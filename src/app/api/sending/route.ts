/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sendingLogs, providers, servers, users, auditLogs, serverUsers } from "@/db/schema";
import { eq, desc, asc, and, count, gte, lte, sql } from "drizzle-orm";
import { canAccessServer, forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const providerId = searchParams.get("providerId");
  const serverId = searchParams.get("serverId");
  const mailerId = searchParams.get("mailerId");
  const campaignId = searchParams.get("campaignId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const conditions = [];
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);

  if (providerId) conditions.push(eq(sendingLogs.providerId, providerId));
  if (serverId) conditions.push(eq(sendingLogs.serverId, serverId));
  if (mailerId) conditions.push(eq(sendingLogs.mailerId, mailerId));
  if (campaignId) conditions.push(eq(sendingLogs.campaignId, campaignId));
  if (startDate) conditions.push(gte(sendingLogs.date, new Date(startDate)));
  if (endDate) conditions.push(lte(sendingLogs.date, new Date(endDate)));
  if (!admin) {
    conditions.push(sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${sendingLogs.serverId} and ${serverUsers.userId} = ${currentUserId})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (sendingLogs as any)[sortBy] || sendingLogs.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: sendingLogs.id,
        date: sendingLogs.date,
        mailerId: sendingLogs.mailerId,
        providerId: sendingLogs.providerId,
        serverId: sendingLogs.serverId,
        ipAddressId: sendingLogs.ipAddressId,
        campaignId: sendingLogs.campaignId,
        plannedSends: sendingLogs.plannedSends,
        actualSends: sendingLogs.actualSends,
        successfulSends: sendingLogs.successfulSends,
        bounces: sendingLogs.bounces,
        complaints: sendingLogs.complaints,
        unsubscribes: sendingLogs.unsubscribes,
        deliveryNotes: sendingLogs.deliveryNotes,
        operationalStatus: sendingLogs.operationalStatus,
        createdAt: sendingLogs.createdAt,
        updatedAt: sendingLogs.updatedAt,
        providerName: providers.name,
        serverName: servers.name,
        mailerName: users.name,
      })
      .from(sendingLogs)
      .leftJoin(providers, eq(sendingLogs.providerId, providers.id))
      .leftJoin(servers, eq(sendingLogs.serverId, servers.id))
      .leftJoin(users, eq(sendingLogs.mailerId, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(sendingLogs).where(where),
  ]);

  const total = totalResult[0]?.total || 0;

  return NextResponse.json({
    data,
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
  if (!body.mailerId || !body.providerId || !body.serverId || !body.ipAddressId) {
    return NextResponse.json(
      { error: "mailerId, providerId, serverId, and ipAddressId are required" },
      { status: 400 }
    );
  }
  if (!(await canAccessServer(session, String(body.serverId)))) {
    return forbidden("You can only add statistics for servers assigned to you.");
  }

  const [created] = await db
    .insert(sendingLogs)
    .values({
      ...body,
      date: new Date(body.date),
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "sending_log",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
