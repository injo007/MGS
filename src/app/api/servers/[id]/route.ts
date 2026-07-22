import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { servers, auditLogs, serverUsers, users, sendingLogs, ipAddresses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { enrichIpAddress, getIpIntelligenceCache } from "@/lib/ip-intelligence";
import { canAccessServer, forbidden, isAdmin, sessionUserId } from "@/lib/access-control";
import { sendAuditTelegramAlert } from "@/lib/telegram";

function cleanServerPayload(body: Record<string, unknown>): Partial<typeof servers.$inferInsert> {
  const nullableTextFields = [
    "plan",
    "location",
    "operatingSystem",
    "monthlyCost",
    "currency",
    "billingMethod",
    "notes",
  ];
  const dateFields = ["purchaseDate", "activationDate", "expirationDate"];
  const cleaned: Record<string, unknown> = { ...body };

  for (const field of nullableTextFields) {
    if (cleaned[field] === "") cleaned[field] = null;
  }

  for (const field of dateFields) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = cleaned[field] ? new Date(`${cleaned[field]}T00:00:00.000Z`) : null;
    }
  }

  if (cleaned.dailySendLimit === "") cleaned.dailySendLimit = null;
  if (cleaned.dailySendLimit != null) cleaned.dailySendLimit = Number(cleaned.dailySendLimit);

  return cleaned as Partial<typeof servers.$inferInsert>;
}

function cleanIpAddressList(value: unknown) {
  if (!Array.isArray(value)) return null;
  return Array.from(
    new Set(
      value
        .map((ip) => String(ip).trim())
        .filter(Boolean)
    )
  );
}

async function syncServerIpAddresses(serverId: string, providerId: string, addresses: string[] | null, blacklistUserIds?: string | string[] | null) {
  if (!addresses) return;

  const existing = await db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.serverId, serverId));
  const desired = new Set(addresses);

  for (const ip of existing) {
    if (!desired.has(ip.address)) {
      await db.delete(ipAddresses).where(eq(ipAddresses.id, ip.id));
    } else if (ip.providerId !== providerId) {
      await db
        .update(ipAddresses)
        .set({ providerId, updatedAt: new Date() })
        .where(eq(ipAddresses.id, ip.id));
    }
  }

  const existingAddresses = new Set(existing.map((ip) => ip.address));
  for (const address of addresses) {
    if (existingAddresses.has(address)) continue;
    const [createdIp] = await db
      .insert(ipAddresses)
      .values({
        address,
        ipVersion: address.includes(":") ? "ipv6" : "ipv4",
        providerId,
        serverId,
        status: "active",
      })
      .returning();
    await enrichIpAddress(createdIp.id, true, blacklistUserIds).catch(() => null);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [server] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, id))
    .limit(1);

  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, id))) {
    return forbidden("You can only access servers assigned to you.");
  }

  // Fetch assigned users
  const assignedUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(serverUsers)
    .innerJoin(users, eq(serverUsers.userId, users.id))
    .where(eq(serverUsers.serverId, id));

  // Fetch IPs
  const ips = await db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.serverId, id));
  const ipIntelligence = await getIpIntelligenceCache();

  // Fetch 30-day sending history
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sendingHistory = await db
    .select({
      date: sendingLogs.date,
      actualSends: sendingLogs.actualSends,
      successfulSends: sendingLogs.successfulSends,
      bounces: sendingLogs.bounces,
      complaints: sendingLogs.complaints,
      plannedSends: sendingLogs.plannedSends,
    })
    .from(sendingLogs)
    .where(
      sql`${sendingLogs.serverId} = ${id} AND ${sendingLogs.date} >= ${thirtyDaysAgo.toISOString()}`
    )
    .orderBy(sendingLogs.date);

  // Today's sends
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayResult] = await db
    .select({ total: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)` })
    .from(sendingLogs)
    .where(
      sql`${sendingLogs.serverId} = ${id} AND ${sendingLogs.date} >= ${todayStart.toISOString()}`
    );

  return NextResponse.json({
    ...server,
    assignedUsers,
    ips: ips.map((ip) => ({ ...ip, intelligence: ipIntelligence[ip.address] || null })),
    sendingHistory,
    todaySends: todayResult?.total || 0,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, id))) {
    return forbidden("You can only edit servers assigned to you.");
  }

  const { assignedUserIds, ipAddresses: ipAddressValues, ...serverData } = body;
  const cleanedServerData = cleanServerPayload(serverData);
  const cleanedIpAddresses = cleanIpAddressList(ipAddressValues);
  const requestedAssignedUserIds = Array.isArray(assignedUserIds) ? assignedUserIds : null;
  const finalAssignedUserIds = requestedAssignedUserIds
    ? isAdmin(session)
      ? requestedAssignedUserIds
      : Array.from(new Set([...requestedAssignedUserIds, sessionUserId(session)]))
    : null;
  let blacklistUserIds: string | string[] | null = finalAssignedUserIds;
  if (!blacklistUserIds) {
    const existingAssignments = await db
      .select({ userId: serverUsers.userId })
      .from(serverUsers)
      .where(eq(serverUsers.serverId, id));
    blacklistUserIds = existingAssignments.length > 0
      ? existingAssignments.map((assignment) => assignment.userId)
      : sessionUserId(session);
  }

  const [updated] = await db
    .update(servers)
    .set({ ...cleanedServerData, updatedAt: new Date() })
    .where(eq(servers.id, id))
    .returning();

  await syncServerIpAddresses(id, updated.providerId, cleanedIpAddresses, blacklistUserIds);

  // Update assigned users if provided
  if (finalAssignedUserIds) {
    // Remove existing assignments
    await db.delete(serverUsers).where(eq(serverUsers.serverId, id));
    // Add new assignments
    for (const userId of finalAssignedUserIds) {
      await db.insert(serverUsers).values({ serverId: id, userId });
    }
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "server",
    entityId: id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, id))) {
    return forbidden("You can only delete servers assigned to you.");
  }

  await db.delete(sendingLogs).where(eq(sendingLogs.serverId, id));
  await db.delete(servers).where(eq(servers.id, id));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "server",
    entityId: id,
    previousValue: existing,
  });

  await sendAuditTelegramAlert({
    action: "delete",
    entityType: "server",
    actorName: session.user.name,
    actorEmail: session.user.email,
    entityName: existing.name,
    entityDetail: existing.location || existing.status || null,
  });

  return new NextResponse(null, { status: 204 });
}
