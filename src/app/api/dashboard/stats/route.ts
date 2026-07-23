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
import { getCachedImapInbox, getImapConfigs } from "@/lib/imap-service";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const currentWeekStart = new Date();
  const weekDay = currentWeekStart.getDay();
  currentWeekStart.setDate(currentWeekStart.getDate() + (weekDay === 0 ? -6 : 1 - weekDay));
  currentWeekStart.setHours(0, 0, 0, 0);
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);
  const requestedUserId = searchParams.get("userId") || "";
  const scopedUserId = admin ? requestedUserId || null : currentUserId;
  const providerUserCondition = scopedUserId
    ? sql`(
        ${providers.assignedUserId} = ${scopedUserId}
        or exists (
          select 1 from ${servers}
          inner join ${serverUsers} on ${serverUsers.serverId} = ${servers.id}
          where ${servers.providerId} = ${providers.id}
            and ${serverUsers.userId} = ${scopedUserId}
        )
        or exists (
          select 1 from ${servers}
          where ${servers.providerId} = ${providers.id}
            and ${servers.createdById} = ${scopedUserId}
        )
      )`
    : undefined;
  const assignedServerCondition = scopedUserId
    ? sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${servers.id} and ${serverUsers.userId} = ${scopedUserId})`
    : undefined;
  const assignedSendingCondition = scopedUserId
    ? eq(sendingLogs.mailerId, scopedUserId)
    : undefined;
  const assignedIpCondition = scopedUserId
    ? sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${ipAddresses.serverId} and ${serverUsers.userId} = ${scopedUserId})`
    : undefined;
  const taskUserCondition = scopedUserId
    ? or(eq(tasks.assignedUserId, scopedUserId), isNull(tasks.assignedUserId))
    : undefined;
  const outreachUserCondition = scopedUserId ? eq(outreachLogs.sentById, scopedUserId) : undefined;
  const auditUserCondition = scopedUserId ? eq(auditLogs.userId, scopedUserId) : undefined;

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
    allUsers,
    currentWeekSendingByUser,
    providerContactOutreachRows,
    contactedProviderRows,
    imapAccounts,
    cachedInbox,
  ] = await Promise.all([
    db.select({ total: count() }).from(providers).where(providerUserCondition),

    db
      .select({ status: providers.contactStatus, count: count() })
      .from(providers)
      .where(providerUserCondition)
      .groupBy(providers.contactStatus),

    db
      .select({ status: providers.responseStatus, count: count() })
      .from(providers)
      .where(providerUserCondition)
      .groupBy(providers.responseStatus),

    db
      .select({ decision: providers.decision, count: count() })
      .from(providers)
      .where(providerUserCondition)
      .groupBy(providers.decision),

    db
      .select({ total: count() })
      .from(providers)
      .where(providerUserCondition ? and(providerUserCondition, isNotNull(providers.assignedUserId)) : isNotNull(providers.assignedUserId)),

    db
      .select({ total: count() })
      .from(servers)
      .where(assignedServerCondition ? and(eq(servers.status, "active"), assignedServerCondition) : eq(servers.status, "active")),

    db.select({ total: count() }).from(servers).where(assignedServerCondition),

    db.select({ total: count() }).from(ipAddresses).where(assignedIpCondition),

    db
      .select({ status: tasks.status, count: count() })
      .from(tasks)
      .where(taskUserCondition)
      .groupBy(tasks.status),

    db
      .select({ channel: outreachLogs.channel, count: count() })
      .from(outreachLogs)
      .where(outreachUserCondition)
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
      .where(outreachUserCondition ? and(gte(outreachLogs.date, sixWeeksAgo), outreachUserCondition) : gte(outreachLogs.date, sixWeeksAgo))
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
      .where(auditUserCondition)
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

    db.select({ id: users.id, name: users.name, email: users.email }).from(users),

    db
      .select({
        userId: sendingLogs.mailerId,
        userName: users.name,
        userEmail: users.email,
        totalSends: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
        serverCount: sql<number>`count(distinct ${sendingLogs.serverId})::int`,
        daysActive: sql<number>`count(distinct to_char(${sendingLogs.date}, 'YYYY-MM-DD'))::int`,
      })
      .from(sendingLogs)
      .leftJoin(users, eq(sendingLogs.mailerId, users.id))
      .where(gte(sendingLogs.date, currentWeekStart))
      .groupBy(sendingLogs.mailerId, users.name, users.email)
      .orderBy(sql`coalesce(sum(${sendingLogs.actualSends}), 0) desc`),

    db
      .select({
        userId: outreachLogs.sentById,
        userName: users.name,
        userEmail: users.email,
        providerIds: sql<string[]>`array_agg(distinct ${outreachLogs.providerId})`,
        emailCount: sql<number>`count(*)::int`,
        lastContactAt: max(outreachLogs.date),
      })
      .from(outreachLogs)
      .leftJoin(users, eq(outreachLogs.sentById, users.id))
      .where(eq(outreachLogs.channel, "email"))
      .groupBy(outreachLogs.sentById, users.name, users.email)
      .orderBy(sql`count(distinct ${outreachLogs.providerId}) desc`, sql`count(*) desc`),

    db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.contactStatus, "contacted")),

    getImapConfigs(undefined, true),

    getCachedImapInbox(),
  ]);

  const userIdByEmail = new Map(allUsers.map((user) => [user.email.toLowerCase(), user.id]));
  const mailboxOwnerBySource = new Map<string, string>();
  for (const account of imapAccounts) {
    const source = account.user.toLowerCase();
    const ownerId = account.assignedUserId || userIdByEmail.get(source) || "";
    if (ownerId) mailboxOwnerBySource.set(source, ownerId);
  }

  const providerContactsByUser = new Map<string, {
    providerIds: Set<string>;
    emailCount: number;
    mailboxes: Set<string>;
    sources: Set<string>;
    lastContactAt: string | null;
  }>();
  const contactedProvidersWithEvidence = new Set<string>();

  for (const email of cachedInbox?.emails || []) {
    if (email.direction !== "outgoing" || !email.matchedProviderId) continue;
    const ownerId = mailboxOwnerBySource.get((email.sourceEmail || "").toLowerCase());
    if (!ownerId) continue;
    if (!providerContactsByUser.has(ownerId)) {
      providerContactsByUser.set(ownerId, {
        providerIds: new Set(),
        emailCount: 0,
        mailboxes: new Set(),
        sources: new Set(),
        lastContactAt: null,
      });
    }
    const row = providerContactsByUser.get(ownerId)!;
    contactedProvidersWithEvidence.add(email.matchedProviderId);
    row.providerIds.add(email.matchedProviderId);
    row.emailCount += 1;
    if (email.sourceEmail) row.mailboxes.add(email.sourceEmail);
    row.sources.add("Inbox");
    if (!row.lastContactAt || new Date(email.date).getTime() > new Date(row.lastContactAt).getTime()) {
      row.lastContactAt = email.date;
    }
  }

  for (const item of providerContactOutreachRows) {
    if (!item.userId) continue;
    if (!providerContactsByUser.has(item.userId)) {
      providerContactsByUser.set(item.userId, {
        providerIds: new Set(),
        emailCount: 0,
        mailboxes: new Set(),
        sources: new Set(),
        lastContactAt: null,
      });
    }
    const row = providerContactsByUser.get(item.userId)!;
    for (const providerId of item.providerIds || []) {
      row.providerIds.add(providerId);
      contactedProvidersWithEvidence.add(providerId);
    }
    row.emailCount = Math.max(row.emailCount, Number(item.emailCount || 0));
    row.sources.add("CRM email logs");
    if (!row.lastContactAt || (item.lastContactAt && item.lastContactAt.getTime() > new Date(row.lastContactAt).getTime())) {
      row.lastContactAt = item.lastContactAt?.toISOString() || row.lastContactAt;
    }
  }

  const marouane = allUsers.find((user) => user.email.toLowerCase() === "marouane@cloudops.com")
    || allUsers.find((user) => user.name.toLowerCase().includes("marouane"));
  if (marouane) {
    if (!providerContactsByUser.has(marouane.id)) {
      providerContactsByUser.set(marouane.id, {
        providerIds: new Set(),
        emailCount: 0,
        mailboxes: new Set(),
        sources: new Set(),
        lastContactAt: null,
      });
    }
    const row = providerContactsByUser.get(marouane.id)!;
    for (const provider of contactedProviderRows) {
      if (!contactedProvidersWithEvidence.has(provider.id)) {
        row.providerIds.add(provider.id);
        row.sources.add("Contacted status fallback");
      }
    }
  }

  const providerContactLeaderboard = allUsers
    .map((profile) => {
      const value = providerContactsByUser.get(profile.id) || {
        providerIds: new Set<string>(),
        emailCount: 0,
        mailboxes: new Set<string>(),
        sources: new Set<string>(),
        lastContactAt: null,
      };
      return {
        userId: profile.id,
        userName: profile.name,
        userEmail: profile.email,
        providerCount: value.providerIds.size,
        emailCount: value.emailCount,
        mailboxCount: value.mailboxes.size,
        lastContactAt: value.lastContactAt,
        source: Array.from(value.sources).join(" + ") || "No contacts yet",
      };
    })
    .sort((a, b) => b.providerCount - a.providerCount || b.emailCount - a.emailCount)
    .slice(0, 50);

  const weeklySendingByUser = new Map<string, (typeof currentWeekSendingByUser)[number]>();
  for (const row of currentWeekSendingByUser) {
    if (row.userId) weeklySendingByUser.set(row.userId, row);
  }

  const weeklySendingLeaderboard = allUsers
    .map((user) => {
      const row = weeklySendingByUser.get(user.id);
      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        totalSends: Number(row?.totalSends || 0),
        serverCount: Number(row?.serverCount || 0),
        daysActive: Number(row?.daysActive || 0),
      };
    })
    .sort((a, b) => b.totalSends - a.totalSends || b.serverCount - a.serverCount);

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
    userRankings: {
      weekStart: currentWeekStart.toISOString(),
      lastInboxSync: cachedInbox?.timestamp || null,
      providerContacts: providerContactLeaderboard,
      weeklySending: weeklySendingLeaderboard,
    },
  };

  return NextResponse.json(stats);
}
