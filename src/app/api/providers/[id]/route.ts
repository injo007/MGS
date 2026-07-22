import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers, users, auditLogs, sendingLogs, notes } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { detectProviderCountry } from "@/lib/provider-country";
import { sendAuditTelegramAlert } from "@/lib/telegram";

function cleanProviderPayload(body: Record<string, unknown>): Partial<typeof providers.$inferInsert> {
  const allowedFields = [
    "name",
    "website",
    "supportEmail",
    "salesEmail",
    "contactFormUrl",
    "country",
    "region",
    "category",
    "contactStatus",
    "responseStatus",
    "decision",
    "dateFirstContacted",
    "lastContactDate",
    "nextFollowUpDate",
    "port25Status",
    "ptrStatus",
    "ipv4Available",
    "ipv6Available",
    "mailServerAllowed",
    "sendingRestrictions",
    "dailyLimit",
    "hourlyLimit",
    "abusePolicyNotes",
    "startingPrice",
    "currency",
    "billingMethod",
    "hourlyBilling",
    "monthlyBilling",
    "setupFee",
    "paymentMethod",
    "refundPolicy",
    "assignedUserId",
  ];
  const cleaned: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) cleaned[field] = body[field];
  }

  for (const field of ["website", "supportEmail", "salesEmail", "contactFormUrl", "country", "region", "category", "sendingRestrictions", "billingMethod", "paymentMethod", "refundPolicy", "abusePolicyNotes", "assignedUserId"]) {
    if (cleaned[field] === "") cleaned[field] = null;
  }

  for (const field of ["dateFirstContacted", "lastContactDate", "nextFollowUpDate"]) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = cleaned[field] ? new Date(`${cleaned[field]}T00:00:00.000Z`) : null;
    }
  }

  for (const field of ["dailyLimit", "hourlyLimit", "startingPrice", "setupFee"]) {
    if (cleaned[field] === "") cleaned[field] = null;
    if (cleaned[field] != null) cleaned[field] = Number(cleaned[field]);
  }

  if (cleaned.port25Status === "available") {
    cleaned.mailServerAllowed = true;
  } else if (cleaned.port25Status === "blocked") {
    cleaned.mailServerAllowed = false;
  }

  return cleaned as Partial<typeof providers.$inferInsert>;
}

const latestProviderNoteExpr = (providerId: string) => db
  .select({
    id: notes.id,
    content: notes.content,
  })
  .from(notes)
  .where(and(eq(notes.entityType, "provider"), eq(notes.entityId, providerId)))
  .orderBy(desc(notes.createdAt))
  .limit(1);

function cleanFormNote(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

async function saveProviderFormNote(providerId: string, authorId: string, value: unknown) {
  const content = cleanFormNote(value);
  const [latestNote] = await latestProviderNoteExpr(providerId);

  if (!content) {
    if (latestNote) await db.delete(notes).where(eq(notes.id, latestNote.id));
    return null;
  }

  if (latestNote) {
    const [updated] = await db
      .update(notes)
      .set({ content, updatedAt: new Date(), authorId })
      .where(eq(notes.id, latestNote.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(notes)
    .values({
      entityType: "provider",
      entityId: providerId,
      content,
      isInternal: true,
      authorId,
    })
    .returning();
  return created;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [provider] = await db
    .select({
      id: providers.id,
      name: providers.name,
      website: providers.website,
      supportEmail: providers.supportEmail,
      salesEmail: providers.salesEmail,
      contactFormUrl: providers.contactFormUrl,
      country: providers.country,
      region: providers.region,
      category: providers.category,
      contactStatus: providers.contactStatus,
      responseStatus: providers.responseStatus,
      decision: providers.decision,
      dateFirstContacted: providers.dateFirstContacted,
      lastContactDate: providers.lastContactDate,
      nextFollowUpDate: providers.nextFollowUpDate,
      port25Status: providers.port25Status,
      ptrStatus: providers.ptrStatus,
      ipv4Available: providers.ipv4Available,
      ipv6Available: providers.ipv6Available,
      mailServerAllowed: providers.mailServerAllowed,
      sendingRestrictions: providers.sendingRestrictions,
      dailyLimit: providers.dailyLimit,
      hourlyLimit: providers.hourlyLimit,
      abusePolicyNotes: providers.abusePolicyNotes,
      startingPrice: providers.startingPrice,
      currency: providers.currency,
      billingMethod: providers.billingMethod,
      hourlyBilling: providers.hourlyBilling,
      monthlyBilling: providers.monthlyBilling,
      setupFee: providers.setupFee,
      paymentMethod: providers.paymentMethod,
      refundPolicy: providers.refundPolicy,
      assignedUserId: providers.assignedUserId,
      createdById: providers.createdById,
      closedAt: providers.closedAt,
      closedReason: providers.closedReason,
      createdAt: providers.createdAt,
      updatedAt: providers.updatedAt,
      assignedUserName: users.name,
    })
    .from(providers)
    .leftJoin(users, eq(providers.assignedUserId, users.id))
    .where(eq(providers.id, id))
    .limit(1);

  if (!provider) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [latestNote] = await latestProviderNoteExpr(id);

  return NextResponse.json({ ...provider, notes: latestNote?.content || "" });
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
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const countryProvided = Object.prototype.hasOwnProperty.call(body, "country");
  const detectedCountry = countryProvided && !body.country
    ? detectProviderCountry({
        website: body.website ?? existing.website,
        supportEmail: body.supportEmail ?? existing.supportEmail,
        salesEmail: body.salesEmail ?? existing.salesEmail,
      })
    : null;
  const nextCountry = countryProvided ? body.country || detectedCountry?.country || null : existing.country;

  const [updated] = await db
    .update(providers)
    .set({ ...cleanProviderPayload(body), country: nextCountry, updatedAt: new Date() })
    .where(eq(providers.id, id))
    .returning();

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    await saveProviderFormNote(id, session.user.id, body.notes);
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "provider",
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
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(sendingLogs).where(eq(sendingLogs.providerId, id));
  await db.delete(providers).where(eq(providers.id, id));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "provider",
    entityId: id,
    previousValue: existing,
  });

  await sendAuditTelegramAlert({
    action: "delete",
    entityType: "provider",
    actorName: session.user.name,
    actorEmail: session.user.email,
    entityName: existing.name,
    entityDetail: existing.website || existing.country || null,
  });

  return new NextResponse(null, { status: 204 });
}
