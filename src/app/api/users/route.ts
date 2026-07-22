/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, roles, auditLogs } from "@/db/schema";
import { eq, desc, asc, and, count, sql, ilike } from "drizzle-orm";
import { hash } from "bcryptjs";
import { forbidden, isAdmin } from "@/lib/access-control";
import { sendAuditTelegramAlert } from "@/lib/telegram";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Team is available to admins only.");

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const status = searchParams.get("status");
  const all = searchParams.get("all");

  const conditions = [];

  if (search) {
    conditions.push(
      sql`(${ilike(users.name, `%${search}%`)} OR ${ilike(users.email, `%${search}%`)})`
    );
  }
  if (status) conditions.push(eq(users.status, status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  if (all === "1") {
    const data = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        roleId: users.roleId,
        roleName: roles.name,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(where)
      .orderBy(desc(users.createdAt));
    return NextResponse.json({ data, total: data.length, page: 1, pageSize: data.length, totalPages: 1 });
  }

  const sortColumn = (users as any)[sortBy] || users.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        roleId: users.roleId,
        roleName: roles.name,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users).where(where),
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
  if (!isAdmin(session)) return forbidden("Team is available to admins only.");

  const body = await request.json();
  if (!body.name || !body.email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const existingUser = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existingUser.length > 0) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const hashedPassword = body.password ? await hash(body.password, 12) : null;

  const [created] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.email,
      hashedPassword,
      roleId: body.roleId || null,
      status: body.status || "active",
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "user",
    entityId: created.id,
    newValue: { ...created, hashedPassword: undefined },
  });

  await sendAuditTelegramAlert({
    action: "create",
    entityType: "user",
    actorName: session.user.name,
    actorEmail: session.user.email,
    entityName: created.name,
    entityDetail: created.email,
  });

  return NextResponse.json(
    { id: created.id, name: created.name, email: created.email, status: created.status },
    { status: 201 }
  );
}
