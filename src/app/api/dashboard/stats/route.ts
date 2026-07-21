import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  providers,
  servers,
  ipAddresses,
  tasks,
  outreachLogs,
  sendingLogs,
  campaigns,
  auditLogs,
  users,
  serverUsers,
} from "@/db/schema";
import { and, eq, count, sql, isNotNull, desc, gte, max, or, isNull } from "drizzle-orm";
import { isAdmin, sessionUserId } from "@/lib/access-control";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);
  const assignedServerCondition = admin
    ? undefined
    : sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${servers.id} and ${serverUsers.userId} = ${currentUserId})`;
  const assignedSendingCondition = admin
    ? undefined
    : sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${sendingLogs.serverId} and ${serverUsers.userId} = ${currentUserId})`;
  const assignedIpCondition = admin
    ? undefined
    : sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${ipAddresses.serverId} and ${serverUsers.userId} = ${currentUserId})`;

  const [
    totalProviders,
    providersByContactStatus,
    providersByResponseStatus,
    providersByDecision,
    ownedProviders,
    activeServers,
    totalServers,
    totalIps,
    tasksByStatus,
    outreachByChannel,
    sendingAggregates,
    activeCampaigns,
    totalCampaigns,
    contactsOverTime,
    recentActivity,
    sendingOverTime,
    userSendingOverTime,
    serverUtilization,
  ] = await Promise.all([
    db.select({ total: count() }).from(providers),

    db
      .select({ status: providers.contactStatus, count: count() })
      .from(providers)
      .groupBy(providers.contactStatus),

    db
      .select({ status: providers.responseStatus, count: count() })
      .from(providers)
      .groupBy(providers.responseStatus),

    db
      .select({ decision: providers.decision, count: count() })
      .from(providers)
      .groupBy(providers.decision),

    db
      .select({ total: count() })
      .from(providers)
      .where(isNotNull(providers.assignedUserId)),

    db
      .select({ total: count() })
      .from(servers)
      .where(assignedServerCondition ? and(eq(servers.status, "active"), assignedServerCondition) : eq(servers.status, "active")),

    db.select({ total: count() }).from(servers).where(assignedServerCondition),

    db.select({ total: count() }).from(ipAddresses).where(assignedIpCondition),

    db
      .select({ status: tasks.status, count: count() })
      .from(tasks)
      .where(admin ? undefined : or(eq(tasks.assignedUserId, currentUserId), isNull(tasks.assignedUserId)))
      .groupBy(tasks.status),

    db
      .select({ channel: outreachLogs.channel, count: count() })
      .from(outreachLogs)
      .groupBy(outreachLogs.channel),

    db
      .select({
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
        totalBounces: sql<number>`coalesce(sum(${sendingLogs.bounces}), 0)`,
        totalSuccessful: sql<number>`coalesce(sum(${sendingLogs.successfulSends}), 0)`,
        totalComplaints: sql<number>`coalesce(sum(${sendingLogs.complaints}), 0)`,
      })
      .from(sendingLogs)
      .where(assignedSendingCondition),

    db
      .select({ total: count() })
      .from(campaigns)
      .where(eq(campaigns.status, "active")),

    db.select({ total: count() }).from(campaigns),

    db
      .select({
        date: sql<string>`to_char(${outreachLogs.date}, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(outreachLogs)
      .where(gte(outreachLogs.date, sixWeeksAgo))
      .groupBy(sql`to_char(${outreachLogs.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${outreachLogs.date}, 'YYYY-MM-DD')`),

    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.userId, users.id))
      .where(admin ? undefined : eq(auditLogs.userId, currentUserId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),

    // Sending volume over time (last 6 weeks, grouped by day)
    db
      .select({
        date: sql<string>`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`,
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
        successfulSends: sql<number>`coalesce(sum(${sendingLogs.successfulSends}), 0)`,
        bounces: sql<number>`coalesce(sum(${sendingLogs.bounces}), 0)`,
      })
      .from(sendingLogs)
      .where(assignedSendingCondition ? and(gte(sendingLogs.date, sixWeeksAgo), assignedSendingCondition) : gte(sendingLogs.date, sixWeeksAgo))
      .groupBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`),

    db
      .select({
        date: sql<string>`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`,
        userId: sendingLogs.mailerId,
        userName: users.name,
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
      })
      .from(sendingLogs)
      .leftJoin(users, eq(sendingLogs.mailerId, users.id))
      .where(assignedSendingCondition ? and(gte(sendingLogs.date, sixWeeksAgo), assignedSendingCondition) : gte(sendingLogs.date, sixWeeksAgo))
      .groupBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`, sendingLogs.mailerId, users.name)
      .orderBy(sql`to_char(${sendingLogs.date}, 'YYYY-MM-DD')`),

    // Server utilization (per-server send counts)
    db
      .select({
        serverId: servers.id,
        serverName: servers.name,
        providerId: servers.providerId,
        status: servers.status,
        lastSendDate: max(sendingLogs.date),
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
      })
      .from(servers)
      .leftJoin(sendingLogs, eq(servers.id, sendingLogs.serverId))
      .where(assignedServerCondition)
      .groupBy(servers.id, servers.name, servers.providerId, servers.status)
      .orderBy(sql`coalesce(sum(${sendingLogs.actualSends}), 0) desc`),
  ]);

  const stats = {
    providers: {
      total: totalProviders[0]?.total || 0,
      byContactStatus: Object.fromEntries(
        providersByContactStatus.map((r) => [r.status, r.count])
      ),
      byResponseStatus: Object.fromEntries(
        providersByResponseStatus.map((r) => [r.status, r.count])
      ),
      byDecision: Object.fromEntries(
        providersByDecision.map((r) => [r.decision, r.count])
      ),
      owned: ownedProviders[0]?.total || 0,
    },
    servers: {
      total: totalServers[0]?.total || 0,
      active: activeServers[0]?.total || 0,
    },
    ipAddresses: {
      total: totalIps[0]?.total || 0,
    },
    tasks: {
      byStatus: Object.fromEntries(
        tasksByStatus.map((r) => [r.status, r.count])
      ),
    },
    outreach: {
      byChannel: Object.fromEntries(
        outreachByChannel.map((r) => [r.channel, r.count])
      ),
    },
    sending: {
      totalSends: Number(sendingAggregates[0]?.totalSends || 0),
      totalBounces: Number(sendingAggregates[0]?.totalBounces || 0),
      totalSuccessful: Number(sendingAggregates[0]?.totalSuccessful || 0),
      totalComplaints: Number(sendingAggregates[0]?.totalComplaints || 0),
    },
    campaigns: {
      total: totalCampaigns[0]?.total || 0,
      active: activeCampaigns[0]?.total || 0,
    },
    contactsOverTime: contactsOverTime.map((r) => ({
      date: r.date,
      contacts: r.count,
    })),
    recentActivity: recentActivity.map((r) => ({
      id: r.id,
      user: r.userName,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      time: r.createdAt?.toISOString() || new Date().toISOString(),
    })),
    sendingOverTime: sendingOverTime.map((r) => ({
      date: r.date,
      totalSends: Number(r.totalSends),
      successfulSends: Number(r.successfulSends),
      bounces: Number(r.bounces),
    })),
    userSendingOverTime: userSendingOverTime.map((r) => ({
      date: r.date,
      userId: r.userId,
      userName: r.userName || "Unassigned",
      totalSends: Number(r.totalSends),
    })),
    serverUtilization: serverUtilization.map((r) => ({
      serverId: r.serverId,
      serverName: r.serverName,
      providerId: r.providerId,
      status: r.status,
      lastSendDate: r.lastSendDate?.toISOString() || null,
      totalSends: Number(r.totalSends),
    })),
  };

  return NextResponse.json(stats);
}
