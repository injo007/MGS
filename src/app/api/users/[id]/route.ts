/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, isAdmin } from "@/lib/access-control";
import { sendSystemEmail } from "@/lib/system-email";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Team is available to admins only.");

  const { id } = await params;
  const body = await request.json();

  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: Record<string, any> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.image !== undefined) updateData.image = typeof body.image === "string" && body.image.trim() ? body.image.trim() : null;
  if (body.roleId !== undefined) updateData.roleId = body.roleId;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.password) {
    const { hash } = await import("bcryptjs");
    updateData.hashedPassword = await hash(body.password, 12);
  }
  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  const changedFields = [
    body.name !== undefined && body.name !== existing[0].name ? "name" : null,
    body.email !== undefined && body.email !== existing[0].email ? "email" : null,
    body.image !== undefined && body.image !== existing[0].image ? "image" : null,
    body.password ? "password" : null,
  ].filter(Boolean);

  if (changedFields.length > 0 && updated.email) {
    sendSystemEmail({
      to: updated.email,
      subject: "Your ServerOps CRM account was updated",
      text: [
        `Hello ${updated.name},`,
        "",
        `Your ServerOps CRM account was updated by an administrator.`,
        `Changed fields: ${changedFields.join(", ")}.`,
        "",
        `Current login email: ${updated.email}`,
        body.password ? "Your password was changed. Use the new password provided by your administrator." : "",
        "",
        "If you did not expect this change, contact your administrator.",
      ].filter(Boolean).join("\n"),
    }).catch((err) => {
      console.warn("Failed to send account update email", err);
    });
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "user",
    entityId: id,
    previousValue: { name: existing[0].name, email: existing[0].email, image: existing[0].image, status: existing[0].status },
    newValue: { name: updated.name, email: updated.email, image: updated.image, status: updated.status },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    image: updated.image,
    status: updated.status,
  });
}
