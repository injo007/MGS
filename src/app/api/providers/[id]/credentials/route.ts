/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, providerCredentials, providers } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { forbidden, isAdmin } from "@/lib/access-control";
import { decryptSecret, encryptSecret } from "@/lib/secret-vault";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function cleanText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

async function ensureProvider(id: string) {
  const [provider] = await db
    .select({ id: providers.id, name: providers.name })
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);
  return provider || null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return forbidden("Provider credentials are available to admins only.");

  const { id } = await context.params;
  const provider = await ensureProvider(id);
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.providerId, id))
    .orderBy(desc(providerCredentials.createdAt));

  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      label: row.label,
      loginUrl: row.loginUrl,
      username: row.username,
      password: decryptSecret(row.encryptedPassword),
      ownerNote: row.ownerNote,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return forbidden("Provider credentials are available to admins only.");

  const { id } = await context.params;
  const provider = await ensureProvider(id);
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const body = await request.json();
  const label = cleanText(body.label);
  if (!label) return NextResponse.json({ error: "Account label is required" }, { status: 400 });

  const [created] = await db
    .insert(providerCredentials)
    .values({
      providerId: id,
      label,
      loginUrl: cleanText(body.loginUrl),
      username: cleanText(body.username),
      encryptedPassword: encryptSecret(cleanText(body.password)),
      ownerNote: cleanText(body.ownerNote),
      notes: cleanText(body.notes),
      createdById: session.user.id,
      updatedById: session.user.id,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "create",
    entityType: "provider_credential",
    entityId: created.id,
    newValue: { providerId: id, label },
  });

  return NextResponse.json({
    ...created,
    password: decryptSecret(created.encryptedPassword),
    encryptedPassword: undefined,
  }, { status: 201 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return forbidden("Provider credentials are available to admins only.");

  const { id } = await context.params;
  const provider = await ensureProvider(id);
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Credential id is required" }, { status: 400 });
  const label = cleanText(body.label);
  if (!label) return NextResponse.json({ error: "Account label is required" }, { status: 400 });

  const updateData: Partial<typeof providerCredentials.$inferInsert> = {
    label,
    loginUrl: cleanText(body.loginUrl),
    username: cleanText(body.username),
    ownerNote: cleanText(body.ownerNote),
    notes: cleanText(body.notes),
    updatedById: session.user.id,
    updatedAt: new Date(),
  };
  if (body.passwordChanged) {
    updateData.encryptedPassword = encryptSecret(cleanText(body.password));
  }

  const [updated] = await db
    .update(providerCredentials)
    .set(updateData)
    .where(and(eq(providerCredentials.id, body.id), eq(providerCredentials.providerId, id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "provider_credential",
    entityId: updated.id,
    newValue: { providerId: id, label },
  });

  return NextResponse.json({
    ...updated,
    password: decryptSecret(updated.encryptedPassword),
    encryptedPassword: undefined,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return forbidden("Provider credentials are available to admins only.");

  const { id } = await context.params;
  const provider = await ensureProvider(id);
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Credential id is required" }, { status: 400 });

  const [deleted] = await db
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.id, body.id), eq(providerCredentials.providerId, id)))
    .returning({ id: providerCredentials.id, label: providerCredentials.label });

  if (!deleted) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "provider_credential",
    entityId: deleted.id,
    previousValue: { providerId: id, label: deleted.label },
  });

  return NextResponse.json({ ok: true });
}
