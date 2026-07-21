/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tasks, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAdmin(session) && task.assignedUserId !== sessionUserId(session) && task.assignedUserId !== null) {
    return forbidden("You can only access tasks assigned to you.");
  }

  return NextResponse.json(task);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAdmin(session) && existing.assignedUserId !== sessionUserId(session)) {
    return forbidden("You can only edit tasks assigned to you.");
  }
  if (!isAdmin(session) && body.assignedUserId && body.assignedUserId !== sessionUserId(session)) {
    return forbidden("You can only assign tasks to yourself.");
  }

  const updateData: Record<string, any> = { ...body, updatedAt: new Date() };
  if (!isAdmin(session)) updateData.assignedUserId = sessionUserId(session);

  if (body.status === "completed" && existing.status !== "completed") {
    updateData.completedAt = new Date();
  }

  const [updated] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "task",
    entityId: id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAdmin(session) && existing.assignedUserId !== sessionUserId(session)) {
    return forbidden("You can only delete tasks assigned to you.");
  }

  await db.delete(tasks).where(eq(tasks.id, id));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "task",
    entityId: id,
    previousValue: existing,
  });

  return new NextResponse(null, { status: 204 });
}
