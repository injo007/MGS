import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, providers } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const [existing] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const updateData: Partial<typeof providers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.pinned === "boolean") {
    updateData.pinned = body.pinned;
  }

  if (body.markAsNew === true) {
    updateData.createdAt = new Date();
  }

  const [updated] = await db
    .update(providers)
    .set(updateData)
    .where(eq(providers.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "provider",
    entityId: id,
    previousValue: {
      pinned: existing.pinned,
      createdAt: existing.createdAt,
    },
    newValue: {
      pinned: updated.pinned,
      createdAt: updated.createdAt,
    },
  });

  return NextResponse.json(updated);
}
