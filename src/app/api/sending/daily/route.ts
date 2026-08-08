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

type SendingLogInsert = typeof sendingLogs.$inferInsert;
type SendingStatus = NonNullable<SendingLogInsert["operationalStatus"]>;

const SENDING_STATUSES = new Set<SendingStatus>([
  "normal",
  "active",
  "watch",
  "paused",
  "stopped",
  "suspended",
  "down",
  "port_closed",
  "ts04_error",
  "tss04_error",
  "tss05_error",
  "tss07_error",
  "tss09_error",
  "bounce",
  "complaint",
]);

function parseSendingStatus(value: unknown): SendingStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return SENDING_STATUSES.has(normalized as SendingStatus) ? (normalized as SendingStatus) : undefined;
}

async function upsertDailyLog({
  serverId,
  day,
  actualSends,
  operationalStatus,
  deliveryNotes,
  cellColor,
  cellFontColor,
  sessionId,
}: {
  serverId: string;
  day: string;
  actualSends?: number;
  operationalStatus?: SendingStatus;
  deliveryNotes?: string;
  cellColor?: string;
  cellFontColor?: string;
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
  const resolvedActualSends = actualSends ?? Number(primary?.actualSends || 0);
  const successfulSends = Math.max(0, resolvedActualSends - bounces);
  const payload: SendingLogInsert = {
    date: new Date(`${day}T12:00:00.000Z`),
    mailerId: primary?.mailerId || userId || sessionId,
    providerId: server.providerId,
    serverId,
    ipAddressId: primary?.ipAddressId || ip.id,
    plannedSends: server.dailySendLimit ?? resolvedActualSends,
    actualSends: resolvedActualSends,
    successfulSends,
    bounces,
    complaints: Number(primary?.complaints || 0),
    unsubscribes: Number(primary?.unsubscribes || 0),
    operationalStatus: operationalStatus || primary?.operationalStatus || "normal",
    deliveryNotes: deliveryNotes?.trim() || primary?.deliveryNotes || (cellColor || cellFontColor ? null : "Updated from Server Statistics Center"),
    cellColor: cellColor || primary?.cellColor || null,
    cellFontColor: cellFontColor || primary?.cellFontColor || null,
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
  const actualSends = body.actualSends == null || body.actualSends === "" ? undefined : Number(body.actualSends);
  const operationalStatus = parseSendingStatus(body.operationalStatus);
  const deliveryNotes = typeof body.deliveryNotes === "string" ? body.deliveryNotes : undefined;
  const cellColor = typeof body.cellColor === "string" && body.cellColor.trim() ? body.cellColor.trim() : undefined;
  const cellFontColor = typeof body.cellFontColor === "string" && body.cellFontColor.trim() ? body.cellFontColor.trim() : undefined;

  if ((cellColor && !/^#[0-9a-fA-F]{6}$/.test(cellColor)) || (cellFontColor && !/^#[0-9a-fA-F]{6}$/.test(cellFontColor))) {
    return NextResponse.json({ error: "cellColor and cellFontColor must be hex colors like #4F46E5" }, { status: 400 });
  }
  const days = body.startDate && body.endDate
    ? dateRange(String(body.startDate), String(body.endDate))
    : body.date
      ? [String(body.date).slice(0, 10)]
      : [];

  if (serverIds.length === 0 || days.length === 0) {
    return NextResponse.json({ error: "serverIds and a date or date range are required" }, { status: 400 });
  }
  if (actualSends != null && (!Number.isFinite(actualSends) || actualSends < 0)) {
    return NextResponse.json({ error: "actualSends must be a non-negative number" }, { status: 400 });
  }
  if (typeof body.operationalStatus === "string" && body.operationalStatus.trim() && !operationalStatus) {
    return NextResponse.json({ error: "Invalid operationalStatus value" }, { status: 400 });
  }
  if (actualSends == null && !operationalStatus && !deliveryNotes?.trim() && !cellColor && !cellFontColor) {
    return NextResponse.json({ error: "Provide at least one daily statistic to update" }, { status: 400 });
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
        operationalStatus,
        deliveryNotes,
        cellColor,
        cellFontColor,
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
      operationalStatus,
      deliveryNotes,
      cellColor,
      cellFontColor,
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
