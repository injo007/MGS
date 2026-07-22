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

  const currentUserId = sessionUserId(session);
  const userOwnsTask = existing.createdById === currentUserId;
  let updateData: Record<string, any> = { ...body, updatedAt: new Date() };
  if (!isAdmin(session)) {
    if (userOwnsTask) {
      const allowedStatus = ["open", "in_progress", "blocked", "completed", "cancelled"];
      if (body.status !== undefined && !allowedStatus.includes(body.status)) {
        return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
      }
      updateData = {
        title: body.title !== undefined ? String(body.title).trim() : existing.title,
        description: body.description !== undefined ? body.description || null : existing.description,
        priority: body.priority !== undefined ? body.priority : existing.priority,
        status: body.status !== undefined ? body.status : existing.status,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : existing.dueDate,
        assignedUserId: currentUserId,
        relatedEntityType: existing.relatedEntityType,
        relatedEntityId: existing.relatedEntityId,
        createdById: existing.createdById,
        updatedAt: new Date(),
      };
      if (!updateData.title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }
    } else if (existing.assignedUserId !== currentUserId) {
      return forbidden("You can only update the status of tasks assigned to you.");
    } else {
      const allowedStatus = ["open", "in_progress", "blocked", "completed", "cancelled"];
      if (Object.keys(body).some((key) => key !== "status") || !allowedStatus.includes(body.status)) {
        return forbidden("Only task owners and admins can edit task details.");
      }

      updateData.status = body.status;
      updateData.assignedUserId = existing.assignedUserId;
      updateData.title = existing.title;
      updateData.description = existing.description;
      updateData.priority = existing.priority;
      updateData.dueDate = existing.dueDate;
      updateData.relatedEntityType = existing.relatedEntityType;
      updateData.relatedEntityId = existing.relatedEntityId;
      updateData.createdById = existing.createdById;
    }
  }

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
  if (!isAdmin(session) && existing.createdById !== sessionUserId(session)) {
    return forbidden("Only admins and task owners can delete tasks.");
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
