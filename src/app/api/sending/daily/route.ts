/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, ipAddresses, sendingLogs, servers, serverUsers } from "@/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { canAccessServer, forbidden, sessionUserId } from "@/lib/access-control";

function dayWindow(day: string) {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(`${day}T23:59:59.999Z`);
  return { start, end };
}

function dateKey(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function dateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function upsertDailyLog({
  serverId,
  day,
  actualSends,
  sessionId,
}: {
  serverId: string;
  day: string;
  actualSends: number;
  sessionId: string;
}) {
  const [server] = await db
    .select({
      id: servers.id,
      providerId: servers.providerId,
      dailySendLimit: servers.dailySendLimit,
    })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!server) {
    return { serverId, day, status: "failed", error: "Server not found" };
  }

  const [{ userId } = { userId: sessionId }] = await db
    .select({ userId: serverUsers.userId })
    .from(serverUsers)
    .where(eq(serverUsers.serverId, serverId))
    .orderBy(asc(serverUsers.createdAt))
    .limit(1);

  const [ip] = await db
    .select({ id: ipAddresses.id })
    .from(ipAddresses)
    .where(eq(ipAddresses.serverId, serverId))
    .orderBy(asc(ipAddresses.createdAt))
    .limit(1);

  if (!ip) {
    return { serverId, day, status: "failed", error: "Server has no IP address" };
  }

  const { start, end } = dayWindow(day);
  const existing = await db
    .select()
    .from(sendingLogs)
    .where(and(eq(sendingLogs.serverId, serverId), gte(sendingLogs.date, start), lte(sendingLogs.date, end)))
    .orderBy(asc(sendingLogs.createdAt));

  const primary = existing[0];
  const bounces = Number(primary?.bounces || 0);
  const successfulSends = Math.max(0, actualSends - bounces);
  const payload = {
    date: new Date(`${day}T12:00:00.000Z`),
    mailerId: primary?.mailerId || userId || sessionId,
    providerId: server.providerId,
    serverId,
    ipAddressId: primary?.ipAddressId || ip.id,
    plannedSends: server.dailySendLimit ?? actualSends,
    actualSends,
    successfulSends,
    bounces,
    complaints: Number(primary?.complaints || 0),
    unsubscribes: Number(primary?.unsubscribes || 0),
    operationalStatus: primary?.operationalStatus || "normal",
    deliveryNotes: primary?.deliveryNotes || "Updated from Server Statistics Center",
    updatedAt: new Date(),
  };

  if (primary) {
    const [updated] = await db
      .update(sendingLogs)
      .set(payload)
      .where(eq(sendingLogs.id, primary.id))
      .returning();

    if (existing.length > 1) {
      const duplicateIds = existing.slice(1).map((log) => log.id);
      await db.delete(sendingLogs).where(inArray(sendingLogs.id, duplicateIds));
    }

    return { serverId, day, status: "updated", id: updated.id, removedDuplicates: Math.max(0, existing.length - 1) };
  }

  const [created] = await db
    .insert(sendingLogs)
    .values({
      ...payload,
      createdAt: new Date(),
    } as typeof sendingLogs.$inferInsert)
    .returning();

  return { serverId, day, status: "created", id: created.id, removedDuplicates: 0 };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const serverIds = Array.isArray(body.serverIds)
    ? body.serverIds.map((id: unknown) => String(id)).filter(Boolean)
    : body.serverId
      ? [String(body.serverId)]
      : [];
  const actualSends = Number(body.actualSends);
  const days = body.startDate && body.endDate
    ? dateRange(String(body.startDate), String(body.endDate))
    : body.date
      ? [String(body.date).slice(0, 10)]
      : [];

  if (serverIds.length === 0 || days.length === 0 || !Number.isFinite(actualSends) || actualSends < 0) {
    return NextResponse.json({ error: "serverIds, date or date range, and a non-negative actualSends number are required" }, { status: 400 });
  }

  for (const serverId of serverIds) {
    if (!(await canAccessServer(session, serverId))) {
      return forbidden("You can only edit statistics for servers assigned to you.");
    }
  }

  const results = [];
  for (const serverId of serverIds) {
    for (const day of days) {
      results.push(await upsertDailyLog({
        serverId,
        day,
        actualSends,
        sessionId: sessionUserId(session),
      }));
    }
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "upsert_daily_statistics",
    entityType: "sending_log",
    newValue: {
      serverIds,
      days,
      actualSends,
      results,
    },
  });

  const failed = results.filter((result) => result.status === "failed");
  return NextResponse.json({
    updated: results.length - failed.length,
    failed: failed.length,
    removedDuplicates: results.reduce((sum, result: any) => sum + Number(result.removedDuplicates || 0), 0),
    results,
  }, { status: failed.length > 0 ? 207 : 200 });
}
