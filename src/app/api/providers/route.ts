/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers, users, auditLogs, servers, sendingLogs } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql } from "drizzle-orm";
import { detectProviderCountry } from "@/lib/provider-country";

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
        // Aggregated stats
        totalServers: sql<number>`(select count(*) from ${servers} where ${servers.providerId} = ${providers.id})`,
        activeServers: sql<number>`(select count(*) from ${servers} where ${servers.providerId} = ${providers.id} and ${servers.status} = 'active')`,
        totalSends: sql<number>`(select coalesce(sum(${sendingLogs.actualSends}), 0) from ${sendingLogs} inner join ${servers} on ${sendingLogs.serverId} = ${servers.id} where ${servers.providerId} = ${providers.id})`,
        totalSuccessful: sql<number>`(select coalesce(sum(${sendingLogs.successfulSends}), 0) from ${sendingLogs} inner join ${servers} on ${sendingLogs.serverId} = ${servers.id} where ${servers.providerId} = ${providers.id})`,
      })
      .from(providers)
      .leftJoin(users, eq(providers.assignedUserId, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(providers).where(where),
  ]);

  const total = totalResult[0]?.total || 0;

  // Calculate score for each provider
  const enriched = data.map((p) => {
    let score = 0;
    // Decision scoring
    if (p.decision === "accepted") score += 40;
    else if (p.decision === "pending" && p.responseStatus === "replied") score += 25;
    else if (p.decision === "pending") score += 10;
    // Server scoring
    score += Math.min(p.activeServers * 10, 30);
    // Sending scoring
    if (p.totalSends > 0) score += Math.min(20, Math.floor(p.totalSends / 100) * 5);
    // Cap at 100
    score = Math.min(score, 100);

    return {
      ...p,
      score,
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

  return NextResponse.json(created, { status: 201 });
}
