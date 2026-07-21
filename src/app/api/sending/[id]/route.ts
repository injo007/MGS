/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sendingLogs, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessServer, forbidden } from "@/lib/access-control";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const [existing] = await db.select().from(sendingLogs).where(eq(sendingLogs.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, existing.serverId))) {
    return forbidden("You can only edit statistics for servers assigned to you.");
  }

  const updates: Record<string, any> = {};
  if (body.date !== undefined) updates.date = new Date(body.date);
  if (body.plannedSends !== undefined) updates.plannedSends = body.plannedSends;
  if (body.actualSends !== undefined) updates.actualSends = body.actualSends;
  if (body.successfulSends !== undefined) updates.successfulSends = body.successfulSends;
  if (body.bounces !== undefined) updates.bounces = body.bounces;
  if (body.complaints !== undefined) updates.complaints = body.complaints;
  if (body.unsubscribes !== undefined) updates.unsubscribes = body.unsubscribes;
  if (body.deliveryNotes !== undefined) updates.deliveryNotes = body.deliveryNotes;
  if (body.operationalStatus !== undefined) updates.operationalStatus = body.operationalStatus;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(sendingLogs)
    .set(updates)
    .where(eq(sendingLogs.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "sending_log",
    entityId: id,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(sendingLogs).where(eq(sendingLogs.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, existing.serverId))) {
    return forbidden("You can only delete statistics for servers assigned to you.");
  }

  const [deleted] = await db
    .delete(sendingLogs)
    .where(eq(sendingLogs.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "sending_log",
    entityId: id,
    previousValue: deleted,
  });

  return NextResponse.json({ success: true });
}
