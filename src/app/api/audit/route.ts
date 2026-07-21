/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { eq, desc, asc, and, count } from "drizzle-orm";
import { forbidden, isAdmin } from "@/lib/access-control";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Audit Log is available to admins only.");

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const entityType = searchParams.get("entityType");
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");
  const entityId = searchParams.get("entityId");

  const conditions = [];

  if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
  if (action) conditions.push(eq(auditLogs.action, action));
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (entityId) conditions.push(eq(auditLogs.entityId, entityId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortColumn = (auditLogs as any)[sortBy] || auditLogs.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        previousValue: auditLogs.previousValue,
        newValue: auditLogs.newValue,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        userName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
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
