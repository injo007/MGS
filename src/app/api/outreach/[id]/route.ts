import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { outreachLogs, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [log] = await db
    .select()
    .from(outreachLogs)
    .where(eq(outreachLogs.id, id))
    .limit(1);

  if (!log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(log);
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
    .from(outreachLogs)
    .where(eq(outreachLogs.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(outreachLogs)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(outreachLogs.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "outreach",
    entityId: id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json(updated);
}
