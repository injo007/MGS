import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers, sendingLogs, servers } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { canAccessServer, forbidden } from "@/lib/access-control";

function parseDate(value: string | null, fallback: Date, endOfDay = false) {
  if (!value) return fallback;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("serverId");
  if (!serverId) {
    return NextResponse.json({ error: "serverId is required" }, { status: 400 });
  }

  const now = new Date();
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 6);
  const start = parseDate(searchParams.get("start"), defaultStart);
  const end = parseDate(searchParams.get("end"), now, true);

  const [server] = await db
    .select({
      id: servers.id,
      name: servers.name,
      status: servers.status,
      providerName: providers.name,
    })
    .from(servers)
    .leftJoin(providers, eq(servers.providerId, providers.id))
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, serverId))) {
    return forbidden("Reports only include servers assigned to you.");
  }

  const daily = await db
    .select({
      date: sql<string>`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`,
      planned: sql<number>`coalesce(sum(${sendingLogs.plannedSends}), 0)`,
      sent: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
      successful: sql<number>`coalesce(sum(${sendingLogs.successfulSends}), 0)`,
      bounces: sql<number>`coalesce(sum(${sendingLogs.bounces}), 0)`,
      complaints: sql<number>`coalesce(sum(${sendingLogs.complaints}), 0)`,
      unsubscribes: sql<number>`coalesce(sum(${sendingLogs.unsubscribes}), 0)`,
    })
    .from(sendingLogs)
    .where(and(eq(sendingLogs.serverId, serverId), gte(sendingLogs.date, start), lte(sendingLogs.date, end)))
    .groupBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`);

  const rows = daily.map((row) => ({
    date: row.date,
    planned: Number(row.planned || 0),
    sent: Number(row.sent || 0),
    successful: Number(row.successful || 0),
    bounces: Number(row.bounces || 0),
    complaints: Number(row.complaints || 0),
    unsubscribes: Number(row.unsubscribes || 0),
  }));

  const totals = rows.reduce(
    (sum, row) => ({
      planned: sum.planned + row.planned,
      sent: sum.sent + row.sent,
      successful: sum.successful + row.successful,
      bounces: sum.bounces + row.bounces,
      complaints: sum.complaints + row.complaints,
      unsubscribes: sum.unsubscribes + row.unsubscribes,
    }),
    { planned: 0, sent: 0, successful: 0, bounces: 0, complaints: 0, unsubscribes: 0 }
  );

  return NextResponse.json({
    server,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    totals,
    daily: rows,
  });
}
