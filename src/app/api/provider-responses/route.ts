import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providerResponses, providers, users } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql } from "drizzle-orm";

const responseTypes = [
  "approved",
  "rejected",
  "needs_verification",
  "requires_deposit",
  "requires_kyc",
  "requires_support_request",
  "port25_blocked",
  "port25_available",
  "mail_servers_prohibited",
  "other",
] as const;

type ResponseType = (typeof responseTypes)[number];

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "responseDate";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const responseTypeParam = searchParams.get("responseType");
  const responseType = responseTypes.includes(responseTypeParam as ResponseType) ? (responseTypeParam as ResponseType) : null;

  const conditions = [];

  if (search) {
    conditions.push(
      sql`(${ilike(providers.name, `%${search}%`)} OR ${ilike(providerResponses.summary, `%${search}%`)} OR ${ilike(providerResponses.fullResponse, `%${search}%`)})`
    );
  }
  if (responseType) conditions.push(eq(providerResponses.responseType, responseType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumns = {
    responseDate: providerResponses.responseDate,
    responseType: providerResponses.responseType,
    createdAt: providerResponses.createdAt,
    providerName: providers.name,
  };
  const sortColumn = sortColumns[sortBy as keyof typeof sortColumns] || providerResponses.responseDate;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: providerResponses.id,
        providerId: providerResponses.providerId,
        responseDate: providerResponses.responseDate,
        responseType: providerResponses.responseType,
        fullResponse: providerResponses.fullResponse,
        summary: providerResponses.summary,
        decisionRecommendation: providerResponses.decisionRecommendation,
        attachmentUrl: providerResponses.attachmentUrl,
        createdById: providerResponses.createdById,
        createdAt: providerResponses.createdAt,
        providerName: providers.name,
        providerWebsite: providers.website,
        creatorName: users.name,
      })
      .from(providerResponses)
      .leftJoin(providers, eq(providerResponses.providerId, providers.id))
      .leftJoin(users, eq(providerResponses.createdById, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(providerResponses)
      .leftJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(where),
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
  if (!body.providerId || !body.responseType) {
    return NextResponse.json({ error: "providerId and responseType are required" }, { status: 400 });
  }

  const responseDate = body.responseDate ? new Date(body.responseDate) : new Date();

  const [created] = await db
    .insert(providerResponses)
    .values({
      providerId: body.providerId,
      responseDate,
      responseType: body.responseType,
      fullResponse: body.fullResponse || null,
      summary: body.summary || null,
      decisionRecommendation: body.decisionRecommendation || null,
      attachmentUrl: body.attachmentUrl || null,
      createdById: session.user.id,
    })
    .returning();

  const providerUpdate: Partial<typeof providers.$inferInsert> = {
    contactStatus: "contacted",
    responseStatus: "replied",
    lastContactDate: responseDate,
    updatedAt: new Date(),
  };

  if (body.responseType === "approved" || body.responseType === "port25_available") {
    providerUpdate.mailServerAllowed = true;
    if (body.responseType === "approved") providerUpdate.decision = "accepted";
    if (body.responseType === "port25_available") providerUpdate.port25Status = "available";
  } else if (body.responseType === "port25_blocked" || body.responseType === "mail_servers_prohibited") {
    providerUpdate.mailServerAllowed = false;
    providerUpdate.decision = "prohibited_sending";
    providerUpdate.sendingRestrictions =
      body.responseType === "port25_blocked"
        ? "Provider response indicates Port 25/outbound traffic is blocked."
        : "Provider response prohibits mail server use.";
    if (body.responseType === "port25_blocked") providerUpdate.port25Status = "blocked";
  } else if (body.responseType === "rejected") {
    providerUpdate.decision = "denied";
  } else {
    providerUpdate.decision = "pending";
    providerUpdate.responseStatus = "needs_follow_up";
  }

  await db.update(providers).set(providerUpdate).where(eq(providers.id, body.providerId));

  return NextResponse.json(created, { status: 201 });
}
