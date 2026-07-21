/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, users, auditLogs } from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql, or, isNull } from "drizzle-orm";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

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
  const priority = searchParams.get("priority");
  const assignedUserId = searchParams.get("assignedUserId");

  const conditions = [];
  const admin = isAdmin(session);
  const currentUserId = sessionUserId(session);

  if (search) {
    conditions.push(
      sql`(${ilike(tasks.title, `%${search}%`)} OR ${ilike(tasks.description, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(tasks.status, status as any));
  if (priority) conditions.push(eq(tasks.priority, priority as any));
  if (admin && assignedUserId) {
    if (assignedUserId === "public") conditions.push(isNull(tasks.assignedUserId));
    else conditions.push(eq(tasks.assignedUserId, assignedUserId));
  }
  if (!admin) conditions.push(or(eq(tasks.assignedUserId, currentUserId), isNull(tasks.assignedUserId)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (tasks as any)[sortBy] || tasks.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        assignedUserId: tasks.assignedUserId,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        status: tasks.status,
        relatedEntityType: tasks.relatedEntityType,
        relatedEntityId: tasks.relatedEntityId,
        createdById: tasks.createdById,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        assignedUserName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedUserId, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(tasks).where(where),
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
  if (!body.title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!isAdmin(session) && body.assignedUserId && body.assignedUserId !== sessionUserId(session)) {
    return forbidden("You can only create tasks assigned to you.");
  }

  const [created] = await db
    .insert(tasks)
    .values({
      ...body,
      assignedUserId: isAdmin(session) ? body.assignedUserId || null : sessionUserId(session),
      relatedEntityType: body.assignedUserId ? body.relatedEntityType || null : body.relatedEntityType || "announcement",
      createdById: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "task",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
