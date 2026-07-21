import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { campaigns, auditLogs } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql } from "drizzle-orm";

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
  const status = searchParams.get("status");

  const conditions = [];

  if (search) {
    conditions.push(
      sql`(${ilike(campaigns.name, `%${search}%`)} OR ${ilike(campaigns.description, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(campaigns.status, status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (campaigns as any)[sortBy] || campaigns.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(campaigns).where(where),
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
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(campaigns)
    .values({
      ...body,
      createdById: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "campaign",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
