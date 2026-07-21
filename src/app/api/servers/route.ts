import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { servers, providers, auditLogs, ipAddresses, sendingLogs, serverUsers, users } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql, max, isNull } from "drizzle-orm";
import { enrichIpAddress, getIpIntelligenceCache } from "@/lib/ip-intelligence";
import { isAdmin, sessionUserId } from "@/lib/access-control";

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

async function syncServerIpAddresses(serverId: string, providerId: string, addresses: string[] | null) {
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
    await enrichIpAddress(createdIp.id).catch(() => null);
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const status = searchParams.get("status");
  const providerId = searchParams.get("providerId");

  const conditions = [];
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);

  if (search) {
    conditions.push(
      sql`(${ilike(servers.name, `%${search}%`)} OR ${ilike(servers.plan, `%${search}%`)} OR ${ilike(servers.location, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(servers.status, status as typeof servers.$inferSelect.status));
  if (providerId) conditions.push(eq(servers.providerId, providerId));
  if (!admin) {
    conditions.push(sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${servers.id} and ${serverUsers.userId} = ${currentUserId})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumns = {
    createdAt: servers.createdAt,
    updatedAt: servers.updatedAt,
    name: servers.name,
    status: servers.status,
    monthlyCost: servers.monthlyCost,
  } as const;
  const sortColumn = sortColumns[sortBy as keyof typeof sortColumns] || servers.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: servers.id,
        name: servers.name,
        providerId: servers.providerId,
        providerName: providers.name,
        providerWebsite: providers.website,
        plan: servers.plan,
        location: servers.location,
        operatingSystem: servers.operatingSystem,
        status: servers.status,
        purchaseDate: servers.purchaseDate,
        activationDate: servers.activationDate,
        expirationDate: servers.expirationDate,
        monthlyCost: servers.monthlyCost,
        billingMethod: servers.billingMethod,
        currency: servers.currency,
        cpu: servers.cpu,
        ram: servers.ram,
        storage: servers.storage,
        bandwidth: servers.bandwidth,
        notes: servers.notes,
        dailySendLimit: servers.dailySendLimit,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
        totalSuccessful: sql<number>`coalesce(sum(${sendingLogs.successfulSends}), 0)`,
        totalBounces: sql<number>`coalesce(sum(${sendingLogs.bounces}), 0)`,
        lastSendDate: max(sendingLogs.date),
        firstSendDate: sql<Date>`min(${sendingLogs.date})`,
        todaySends: sql<number>`coalesce((select sum(${sendingLogs.actualSends}) from ${sendingLogs} where ${sendingLogs.serverId} = ${servers.id} and ${sendingLogs.date} >= ${todayStart.toISOString()}), 0)`,
        ipCount: sql<number>`(select count(*) from ${ipAddresses} where ${ipAddresses.serverId} = ${servers.id})`,
      })
      .from(servers)
      .leftJoin(providers, eq(servers.providerId, providers.id))
      .leftJoin(sendingLogs, eq(servers.id, sendingLogs.serverId))
      .where(where)
      .groupBy(servers.id, providers.name, providers.website)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(servers).where(where),
  ]);

  const total = totalResult[0]?.total || 0;

  // Fetch IPs for each server
  const serverIds = data.map((s) => s.id);
  const allIps = serverIds.length > 0
    ? await db
        .select({
          id: ipAddresses.id,
          address: ipAddresses.address,
          ipVersion: ipAddresses.ipVersion,
          status: ipAddresses.status,
          port25Status: ipAddresses.port25Status,
          location: ipAddresses.location,
          serverId: ipAddresses.serverId,
        })
        .from(ipAddresses)
        .where(sql`${ipAddresses.serverId} in ${serverIds}`)
    : [];

  const ipsByServer: Record<string, Array<(typeof allIps)[number] & { intelligence: unknown }>> = {};
  const ipIntelligence = await getIpIntelligenceCache();
  for (const ip of allIps) {
    if (!ipsByServer[ip.serverId]) ipsByServer[ip.serverId] = [];
    ipsByServer[ip.serverId].push({ ...ip, intelligence: ipIntelligence[ip.address] || null });
  }

  // Fetch assigned users for each server
  const assignedUsersByServer: Record<string, { id: string; name: string; email: string }[]> = {};
  if (serverIds.length > 0) {
    const assignments = await db
      .select({
        serverId: serverUsers.serverId,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(serverUsers)
      .innerJoin(users, eq(serverUsers.userId, users.id))
      .where(sql`${serverUsers.serverId} in ${serverIds}`);

    for (const a of assignments) {
      if (!assignedUsersByServer[a.serverId]) assignedUsersByServer[a.serverId] = [];
      assignedUsersByServer[a.serverId].push({ id: a.userId, name: a.userName, email: a.userEmail });
    }
  }

  // Fetch 7-day sending history
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyHistory: Record<string, Record<string, { sends: number; successful: number; bounces: number }>> = {};

  if (serverIds.length > 0) {
    const recentLogs = await db
      .select({
        serverId: sendingLogs.serverId,
        date: sendingLogs.date,
        actualSends: sendingLogs.actualSends,
        successfulSends: sendingLogs.successfulSends,
        bounces: sendingLogs.bounces,
      })
      .from(sendingLogs)
      .where(
        sql`${sendingLogs.serverId} in ${serverIds} AND ${sendingLogs.date} >= ${sevenDaysAgo.toISOString()}`
      )
      .orderBy(sendingLogs.date);

    for (const log of recentLogs) {
      const dateKey = new Date(log.date).toISOString().split("T")[0];
      if (!dailyHistory[log.serverId]) dailyHistory[log.serverId] = {};
      if (!dailyHistory[log.serverId][dateKey]) {
        dailyHistory[log.serverId][dateKey] = { sends: 0, successful: 0, bounces: 0 };
      }
      dailyHistory[log.serverId][dateKey].sends += Number(log.actualSends) || 0;
      dailyHistory[log.serverId][dateKey].successful += Number(log.successfulSends) || 0;
      dailyHistory[log.serverId][dateKey].bounces += Number(log.bounces) || 0;
    }
  }

  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayLabels.push(d.toISOString().split("T")[0]);
  }

  const enriched = data.map((s) => ({
    ...s,
    assignedUsers: assignedUsersByServer[s.id] || [],
    ips: ipsByServer[s.id] || [],
    dailyHistory: dayLabels.map((day) => ({
      date: day,
      label: new Date(day + "T12:00:00Z").toLocaleDateString("en", { weekday: "short" }),
      sends: dailyHistory[s.id]?.[day]?.sends || 0,
      successful: dailyHistory[s.id]?.[day]?.successful || 0,
      bounces: dailyHistory[s.id]?.[day]?.bounces || 0,
    })),
    last7DaysTotal: dayLabels.reduce((sum, day) => sum + (dailyHistory[s.id]?.[day]?.sends || 0), 0),
    last7DaysBounces: dayLabels.reduce((sum, day) => sum + (dailyHistory[s.id]?.[day]?.bounces || 0), 0),
  }));

  return NextResponse.json({
    data: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.name || !body.providerId) {
    return NextResponse.json(
      { error: "Name and providerId are required" },
      { status: 400 }
    );
  }

  const { assignedUserIds, ipAddresses: ipAddressValues, ...serverData } = body;
  const cleanedServerData = cleanServerPayload(serverData);
  const cleanedIpAddresses = cleanIpAddressList(ipAddressValues);
  const requestedAssignedUserIds = Array.isArray(assignedUserIds) ? assignedUserIds : [];
  const finalAssignedUserIds = isAdmin(session)
    ? requestedAssignedUserIds
    : Array.from(new Set([...requestedAssignedUserIds, sessionUserId(session)]));

  const [created] = await db
    .insert(servers)
    .values({
      ...cleanedServerData,
      name: String(body.name).trim(),
      providerId: String(body.providerId),
      createdById: session.user.id,
    })
    .returning();

  await syncServerIpAddresses(created.id, created.providerId, cleanedIpAddresses);

  // Assign users
  if (finalAssignedUserIds.length > 0) {
    for (const userId of finalAssignedUserIds) {
      await db.insert(serverUsers).values({ serverId: created.id, userId });
    }
  }

  const inferredProviderUserId = finalAssignedUserIds[0] || sessionUserId(session);
  await db
    .update(providers)
    .set({ assignedUserId: inferredProviderUserId, updatedAt: new Date() })
    .where(and(eq(providers.id, created.providerId), isNull(providers.assignedUserId)));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "server",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
