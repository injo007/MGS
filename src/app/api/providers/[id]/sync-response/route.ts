import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCachedImapInbox } from "@/lib/imap-service";
import { inferResponseType, providerUpdateForResponse } from "@/lib/provider-response-classifier";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const cached = await getCachedImapInbox();
  const latestEmail = (cached?.emails || [])
    .filter((email) => email.direction === "incoming" && email.matchedProviderId === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (!latestEmail) {
    return NextResponse.json({ error: "No saved provider response found in Email Inbox." }, { status: 404 });
  }

  const responseDate = new Date(latestEmail.date);
  const responseType = latestEmail.responseType && latestEmail.responseType !== "other"
    ? latestEmail.responseType
    : inferResponseType(latestEmail.subject, latestEmail.bodyText || latestEmail.bodyPreview || "");
  const update = providerUpdateForResponse(responseType, responseDate);

  const [updated] = await db
    .update(providers)
    .set(update)
    .where(eq(providers.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "provider",
    entityId: id,
    previousValue: {
      responseStatus: existing.responseStatus,
      decision: existing.decision,
      port25Status: existing.port25Status,
    },
    newValue: {
      responseStatus: updated.responseStatus,
      decision: updated.decision,
      port25Status: updated.port25Status,
      sourceEmail: latestEmail.sourceEmail,
      responseType,
    },
  });

  return NextResponse.json({ provider: updated, responseType, sourceEmail: latestEmail.sourceEmail });
}
