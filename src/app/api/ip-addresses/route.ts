import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ipAddresses, providers, servers as serversTable, auditLogs, serverUsers } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql } from "drizzle-orm";
import { enrichIpAddress, getIpIntelligenceCache } from "@/lib/ip-intelligence";
import { canAccessServer, forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

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
  const serverId = searchParams.get("serverId");
  const ipVersion = searchParams.get("ipVersion");

  const conditions = [];
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);

  if (search) {
    conditions.push(
      sql`(${ilike(ipAddresses.address, `%${search}%`)} OR ${ilike(ipAddresses.ptrHostname, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(ipAddresses.status, status as typeof ipAddresses.$inferSelect.status));
  if (providerId) conditions.push(eq(ipAddresses.providerId, providerId));
  if (serverId) conditions.push(eq(ipAddresses.serverId, serverId));
  if (ipVersion) conditions.push(eq(ipAddresses.ipVersion, ipVersion as typeof ipAddresses.$inferSelect.ipVersion));
  if (!admin) {
    conditions.push(sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${ipAddresses.serverId} and ${serverUsers.userId} = ${currentUserId})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumns = {
    createdAt: ipAddresses.createdAt,
    updatedAt: ipAddresses.updatedAt,
    address: ipAddresses.address,
    status: ipAddresses.status,
    location: ipAddresses.location,
  } as const;
  const sortColumn = sortColumns[sortBy as keyof typeof sortColumns] || ipAddresses.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: ipAddresses.id,
        address: ipAddresses.address,
        ipVersion: ipAddresses.ipVersion,
        providerId: ipAddresses.providerId,
        providerName: providers.name,
        serverId: ipAddresses.serverId,
        serverName: serversTable.name,
        location: ipAddresses.location,
        status: ipAddresses.status,
        ptrConfigured: ipAddresses.ptrConfigured,
        ptrHostname: ipAddresses.ptrHostname,
        port25Status: ipAddresses.port25Status,
        assignedMailerId: ipAddresses.assignedMailerId,
        createdAt: ipAddresses.createdAt,
        updatedAt: ipAddresses.updatedAt,
      })
      .from(ipAddresses)
      .leftJoin(providers, eq(ipAddresses.providerId, providers.id))
      .leftJoin(serversTable, eq(ipAddresses.serverId, serversTable.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(ipAddresses).where(where),
  ]);

  const total = totalResult[0]?.total || 0;
  const intelligence = await getIpIntelligenceCache();

  return NextResponse.json({
    data: data.map((ip) => ({
      ...ip,
      intelligence: intelligence[ip.address] || null,
    })),
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
  if (!body.address || !body.providerId || !body.serverId) {
    return NextResponse.json(
      { error: "address, providerId, and serverId are required" },
      { status: 400 }
    );
  }
  if (!(await canAccessServer(session, String(body.serverId)))) {
    return forbidden("You can only add IPs to servers assigned to you.");
  }

  const [created] = await db
    .insert(ipAddresses)
    .values(body)
    .returning();

  const intelligence = await enrichIpAddress(created.id).catch(() => null);

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "ip_address",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json({ ...created, intelligence }, { status: 201 });
}
