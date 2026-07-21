/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { settings, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, isAdmin } from "@/lib/access-control";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Settings are available to admins only.");

  const rows = await db.select().from(settings);

  const settingsObject: Record<string, any> = {};
  for (const row of rows) {
    settingsObject[row.key] = row.value;
  }

  return NextResponse.json(settingsObject);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Settings are available to admins only.");

  const body = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Request body must be a key-value object" },
      { status: 400 }
    );
  }

  for (const [key, value] of Object.entries(body)) {
    const [existing] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    if (existing) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "settings",
    newValue: body,
  });

  const rows = await db.select().from(settings);
  const settingsObject: Record<string, any> = {};
  for (const row of rows) {
    settingsObject[row.key] = row.value;
  }

  return NextResponse.json(settingsObject);
}
