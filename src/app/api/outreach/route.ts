import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { outreachLogs, providers, users, auditLogs } from "@/db/schema";
import { eq, desc, asc, and, count } from "drizzle-orm";

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
  const channel = searchParams.get("channel");
  const sendResult = searchParams.get("sendResult");
  const sentById = searchParams.get("sentById");

  const conditions = [];
  if (providerId) conditions.push(eq(outreachLogs.providerId, providerId));
  if (channel) conditions.push(eq(outreachLogs.channel, channel as any));
  if (sendResult) conditions.push(eq(outreachLogs.sendResult, sendResult as any));
  if (sentById) conditions.push(eq(outreachLogs.sentById, sentById));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (outreachLogs as any)[sortBy] || outreachLogs.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: outreachLogs.id,
        providerId: outreachLogs.providerId,
        date: outreachLogs.date,
        channel: outreachLogs.channel,
        recipient: outreachLogs.recipient,
        subject: outreachLogs.subject,
        message: outreachLogs.message,
        sentById: outreachLogs.sentById,
        sendResult: outreachLogs.sendResult,
        responseDate: outreachLogs.responseDate,
        responseSummary: outreachLogs.responseSummary,
        nextAction: outreachLogs.nextAction,
        followUpDate: outreachLogs.followUpDate,
        createdAt: outreachLogs.createdAt,
        updatedAt: outreachLogs.updatedAt,
        providerName: providers.name,
        sentByName: users.name,
      })
      .from(outreachLogs)
      .leftJoin(providers, eq(outreachLogs.providerId, providers.id))
      .leftJoin(users, eq(outreachLogs.sentById, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(outreachLogs).where(where),
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
  if (!body.providerId) {
    return NextResponse.json(
      { error: "providerId is required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(outreachLogs)
    .values({
      ...body,
      sentById: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "outreach",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
