import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { notes, auditLogs } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const data = await db
    .select()
    .from(notes)
    .where(and(eq(notes.entityType, entityType), eq(notes.entityId, entityId)))
    .orderBy(desc(notes.createdAt));

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.entityType || !body.entityId || !body.content) {
    return NextResponse.json(
      { error: "entityType, entityId, and content are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(notes)
    .values({
      entityType: body.entityType,
      entityId: body.entityId,
      content: body.content,
      isInternal: body.isInternal ?? true,
      authorId: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "note",
    entityId: created.id,
    newValue: created,
  });

  return NextResponse.json(created, { status: 201 });
}
