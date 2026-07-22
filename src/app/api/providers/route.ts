/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers, users, auditLogs, servers, sendingLogs, serverUsers } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql, inArray } from "drizzle-orm";
import { detectProviderCountry } from "@/lib/provider-country";
import { sendAuditTelegramAlert } from "@/lib/telegram";

function cleanProviderPayload(body: Record<string, unknown>): Partial<typeof providers.$inferInsert> {
  const allowedFields = [
    "name",
    "website",
    "supportEmail",
    "salesEmail",
    "contactFormUrl",
    "country",
    "region",
    "category",
    "contactStatus",
    "responseStatus",
    "decision",
    "dateFirstContacted",
    "lastContactDate",
    "nextFollowUpDate",
    "port25Status",
    "ptrStatus",
    "ipv4Available",
    "ipv6Available",
    "mailServerAllowed",
    "sendingRestrictions",
    "dailyLimit",
    "hourlyLimit",
    "abusePolicyNotes",
    "startingPrice",
    "currency",
    "billingMethod",
    "hourlyBilling",
    "monthlyBilling",
    "setupFee",
    "paymentMethod",
    "refundPolicy",
    "assignedUserId",
  ];
  const cleaned: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) cleaned[field] = body[field];
  }

  for (const field of ["website", "supportEmail", "salesEmail", "contactFormUrl", "country", "region", "category", "sendingRestrictions", "billingMethod", "paymentMethod", "refundPolicy", "abusePolicyNotes", "assignedUserId"]) {
    if (cleaned[field] === "") cleaned[field] = null;
  }

  for (const field of ["dateFirstContacted", "lastContactDate", "nextFollowUpDate"]) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = cleaned[field] ? new Date(`${cleaned[field]}T00:00:00.000Z`) : null;
    }
  }

  for (const field of ["dailyLimit", "hourlyLimit", "startingPrice", "setupFee"]) {
    if (cleaned[field] === "") cleaned[field] = null;
    if (cleaned[field] != null) cleaned[field] = Number(cleaned[field]);
  }

  if (cleaned.port25Status === "available") {
    cleaned.mailServerAllowed = true;
  } else if (cleaned.port25Status === "blocked") {
    cleaned.mailServerAllowed = false;
  }

  return cleaned as Partial<typeof providers.$inferInsert>;
}

const activeServersExpr = sql<number>`(
  select count(*)::int
  from ${servers}
  where ${servers.providerId} = ${providers.id}
    and ${servers.status} = 'active'
)`;

const totalServersExpr = sql<number>`(
  select count(*)::int
  from ${servers}
  where ${servers.providerId} = ${providers.id}
)`;

const totalSendsExpr = sql<number>`(
  select coalesce(sum(${sendingLogs.actualSends}), 0)::int
  from ${sendingLogs}
  inner join ${servers} on ${sendingLogs.serverId} = ${servers.id}
  where ${servers.providerId} = ${providers.id}
)`;

const totalSuccessfulExpr = sql<number>`(
  select coalesce(sum(${sendingLogs.successfulSends}), 0)::int
  from ${sendingLogs}
  inner join ${servers} on ${sendingLogs.serverId} = ${servers.id}
  where ${servers.providerId} = ${providers.id}
)`;

const providerScoreExpr = sql<number>`least(
  100,
  (
    case
      when ${totalSendsExpr} > 0 then least(60, floor(${totalSendsExpr} / 100) * 5 + 10)
      else 0
    end
  )
  + least(${activeServersExpr} * 8, 24)
  + (
    case
      when ${providers.decision} = 'accepted' then 16
      when ${providers.responseStatus} = 'replied' then 10
      when ${providers.decision} = 'pending' then 4
      else 0
    end
  )
)`;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "score";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const contactStatus = searchParams.get("contactStatus");
  const decision = searchParams.get("decision");
  const responseStatus = searchParams.get("responseStatus");
  const country = searchParams.get("country");
  const assignedUserId = searchParams.get("assignedUserId");

  const conditions = [];

  if (search) {
    conditions.push(
      sql`(${ilike(providers.name, `%${search}%`)} OR ${ilike(providers.website, `%${search}%`)} OR ${ilike(providers.country, `%${search}%`)})`
    );
  }
  if (contactStatus) conditions.push(eq(providers.contactStatus, contactStatus as any));
  if (decision) conditions.push(eq(providers.decision, decision as any));
  if (responseStatus) conditions.push(eq(providers.responseStatus, responseStatus as any));
  if (country) conditions.push(eq(providers.country, country));
  if (assignedUserId) conditions.push(eq(providers.assignedUserId, assignedUserId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (providers as any)[sortBy] || providers.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;
  const secondaryOrder = sortBy === "score" ? desc(providers.updatedAt) : orderFn(sortColumn);

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: providers.id,
        name: providers.name,
        website: providers.website,
        supportEmail: providers.supportEmail,
        salesEmail: providers.salesEmail,
        contactFormUrl: providers.contactFormUrl,
        country: providers.country,
        region: providers.region,
        category: providers.category,
        contactStatus: providers.contactStatus,
        responseStatus: providers.responseStatus,
        decision: providers.decision,
        dateFirstContacted: providers.dateFirstContacted,
        lastContactDate: providers.lastContactDate,
        nextFollowUpDate: providers.nextFollowUpDate,
        port25Status: providers.port25Status,
        ptrStatus: providers.ptrStatus,
        ipv4Available: providers.ipv4Available,
        ipv6Available: providers.ipv6Available,
        mailServerAllowed: providers.mailServerAllowed,
        sendingRestrictions: providers.sendingRestrictions,
        dailyLimit: providers.dailyLimit,
        hourlyLimit: providers.hourlyLimit,
        abusePolicyNotes: providers.abusePolicyNotes,
        startingPrice: providers.startingPrice,
        currency: providers.currency,
        billingMethod: providers.billingMethod,
        hourlyBilling: providers.hourlyBilling,
        monthlyBilling: providers.monthlyBilling,
        setupFee: providers.setupFee,
        paymentMethod: providers.paymentMethod,
        refundPolicy: providers.refundPolicy,
        assignedUserId: providers.assignedUserId,
        createdById: providers.createdById,
        closedAt: providers.closedAt,
        closedReason: providers.closedReason,
        createdAt: providers.createdAt,
        updatedAt: providers.updatedAt,
        assignedUserName: users.name,
        assignedUserEmail: users.email,
        // Aggregated stats
        totalServers: totalServersExpr,
        activeServers: activeServersExpr,
        totalSends: totalSendsExpr,
        totalSuccessful: totalSuccessfulExpr,
        score: providerScoreExpr,
      })
      .from(providers)
      .leftJoin(users, eq(providers.assignedUserId, users.id))
      .where(where)
      .orderBy(desc(providerScoreExpr), desc(totalSendsExpr), secondaryOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(providers).where(where),
  ]);

  const total = totalResult[0]?.total || 0;
  const providerIds = data.map((provider) => provider.id);
  const usageUsersByProvider = new Map<string, Map<string, { id: string; name: string; email: string; source: "provider" | "server" | "creator" }>>();

  const addUsageUser = (
    providerId: string,
    user: { id: string | null; name: string | null; email: string | null; source: "provider" | "server" | "creator" }
  ) => {
    if (!user.id || !user.name || !user.email) return;
    if (!usageUsersByProvider.has(providerId)) usageUsersByProvider.set(providerId, new Map());
    const existing = usageUsersByProvider.get(providerId)!;
    if (!existing.has(user.id) || user.source === "provider") {
      existing.set(user.id, { id: user.id, name: user.name, email: user.email, source: user.source });
    }
  };

  for (const provider of data) {
    addUsageUser(provider.id, {
      id: provider.assignedUserId,
      name: provider.assignedUserName,
      email: provider.assignedUserEmail,
      source: "provider",
    });
  }

  if (providerIds.length > 0) {
    const [serverAssignees, serverCreators] = await Promise.all([
      db
        .select({
          providerId: servers.providerId,
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
        })
        .from(servers)
        .innerJoin(serverUsers, eq(serverUsers.serverId, servers.id))
        .innerJoin(users, eq(users.id, serverUsers.userId))
        .where(inArray(servers.providerId, providerIds)),
      db
        .select({
          providerId: servers.providerId,
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
        })
        .from(servers)
        .innerJoin(users, eq(users.id, servers.createdById))
        .where(inArray(servers.providerId, providerIds)),
    ]);

    for (const row of serverAssignees) {
      addUsageUser(row.providerId, { id: row.userId, name: row.userName, email: row.userEmail, source: "server" });
    }
    for (const row of serverCreators) {
      addUsageUser(row.providerId, { id: row.userId, name: row.userName, email: row.userEmail, source: "creator" });
    }
  }

  // Normalize numeric aggregate values returned by PostgreSQL.
  const enriched = data.map((p) => {
    const assignedUsers = Array.from(usageUsersByProvider.get(p.id)?.values() || []);
    return {
      ...p,
      assignedUsers,
      assignedUserName: p.assignedUserName || assignedUsers[0]?.name || null,
      totalServers: Number(p.totalServers || 0),
      activeServers: Number(p.activeServers || 0),
      totalSends: Number(p.totalSends || 0),
      totalSuccessful: Number(p.totalSuccessful || 0),
      score: Number(p.score || 0),
    };
  });

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
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const detectedCountry = !body.country
    ? detectProviderCountry({
        website: body.website,
        supportEmail: body.supportEmail,
        salesEmail: body.salesEmail,
      })
    : null;

  const [created] = await db
    .insert(providers)
    .values({
      ...cleanProviderPayload(body),
      name: String(body.name).trim(),
      country: body.country || detectedCountry?.country || null,
      createdById: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "provider",
    entityId: created.id,
    newValue: created,
  });

  await sendAuditTelegramAlert({
    action: "create",
    entityType: "provider",
    actorName: session.user.name,
    actorEmail: session.user.email,
    entityName: created.name,
    entityDetail: created.website || created.country || null,
  });

  return NextResponse.json(created, { status: 201 });
}
