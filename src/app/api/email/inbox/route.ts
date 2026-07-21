import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers } from "@/db/schema";
import {
  applyEmailToProvider,
  fetchImapMessage,
  getCachedImapInbox,
  getImapConfigs,
  moveImapMessage,
  saveCachedImapInbox,
  syncImapInbox,
  updateCachedImapEmails,
} from "@/lib/imap-service";
import { inArray } from "drizzle-orm";
import type { InboxEmail } from "@/lib/imap-service";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

function sameDay(a: string | null | undefined, b = new Date()) {
  if (!a) return false;
  const date = new Date(a);
  return date.getFullYear() === b.getFullYear() && date.getMonth() === b.getMonth() && date.getDate() === b.getDate();
}

async function withProviderWebsites(emails: InboxEmail[]) {
  const providerIds = Array.from(new Set(emails.map((email) => email.matchedProviderId).filter((id): id is string => Boolean(id))));
  if (providerIds.length === 0) return emails;

  const rows = await db
    .select({
      id: providers.id,
      website: providers.website,
    })
    .from(providers)
    .where(inArray(providers.id, providerIds));
  const websites = new Map(rows.map((provider) => [provider.id, provider.website]));

  return emails.map((email) => ({
    ...email,
    matchedProviderWebsite: email.matchedProviderWebsite || (email.matchedProviderId ? websites.get(email.matchedProviderId) ?? null : null),
  }));
}

function filterEmailsForSources(emails: InboxEmail[], sourceEmails: string[] | null) {
  if (!sourceEmails) return emails;
  const allowed = new Set(sourceEmails.map((email) => email.toLowerCase()));
  return emails.filter((email) => allowed.has((email.sourceEmail || "").toLowerCase()));
}

function requestedSourceFilter(
  sourceEmail: string | null,
  configs: Awaited<ReturnType<typeof getImapConfigs>>,
  admin: boolean
) {
  const requested = sourceEmail?.trim().toLowerCase();
  const configuredSources = configs.map((account) => account.user.toLowerCase());

  if (requested) {
    if (!configuredSources.includes(requested)) {
      return { error: "Selected mailbox is not configured or not assigned to you." };
    }
    return { sourceEmails: [requested] };
  }

  return { sourceEmails: admin ? null : configuredSources };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 500)));
  const allowDailySync = searchParams.get("sync") === "daily";
  const selectedSourceEmail = searchParams.get("sourceEmail");
  const admin = isAdmin(session);
  const configs = await getImapConfigs(sessionUserId(session), admin);
  const sourceFilter = requestedSourceFilter(selectedSourceEmail, configs, admin);
  if ("error" in sourceFilter) {
    return forbidden(sourceFilter.error);
  }
  const sourceEmails = sourceFilter.sourceEmails;
  const configured = configs.length > 0;
  if (!configured) {
    const cached = await getCachedImapInbox();
    const emails = await withProviderWebsites(filterEmailsForSources(cached?.emails ?? [], sourceEmails).slice(0, limit));
    return NextResponse.json({ configured: false, data: emails, lastSync: cached, source: "cache" });
  }

  let cached = await getCachedImapInbox();
  let source: "cache" | "daily-sync" = "cache";

  if (allowDailySync && !sameDay(cached?.timestamp)) {
    const result = await syncImapInbox(session.user.id, admin);
    cached = await saveCachedImapInbox(result, session.user.id, "daily", admin ? undefined : configs.map((account) => account.user));
    source = "daily-sync";
  }

  const emails = await withProviderWebsites(filterEmailsForSources(cached?.emails ?? [], sourceEmails).slice(0, limit));

  return NextResponse.json({
    configured: true,
    data: emails,
    lastSync: cached,
    source,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const uid = Number(body.uid);
  const action = body.action;
  const sourceEmail = body.sourceEmail ? String(body.sourceEmail) : undefined;

  if (!uid || !["archive", "delete"].includes(action)) {
    return NextResponse.json({ error: "Valid uid and action are required" }, { status: 400 });
  }

  const admin = isAdmin(session);
  const configs = await getImapConfigs(sessionUserId(session), admin);
  const allowedSources = new Set(configs.map((account) => account.user.toLowerCase()));
  if (!admin && (!sourceEmail || !allowedSources.has(sourceEmail.toLowerCase()))) {
    return forbidden("Email Inbox only includes mailboxes assigned to you.");
  }

  await moveImapMessage(uid, action, sourceEmail);
  await updateCachedImapEmails((emails) => emails.filter((email) => !(email.uid === uid && (!sourceEmail || email.sourceEmail === sourceEmail))));
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const uid = Number(body.uid);
  const createProvider = Boolean(body.createProvider);
  const sourceEmail = body.sourceEmail ? String(body.sourceEmail) : undefined;

  if (!uid) {
    return NextResponse.json({ error: "Valid uid is required" }, { status: 400 });
  }

  const cached = await getCachedImapInbox();
  const cachedEmail = cached?.emails?.find((item) => item.uid === uid && (!sourceEmail || item.sourceEmail === sourceEmail)) ?? null;
  const admin = isAdmin(session);
  const configs = await getImapConfigs(sessionUserId(session), admin);
  const allowedSources = new Set(configs.map((account) => account.user.toLowerCase()));
  if (!admin && (!sourceEmail || !allowedSources.has(sourceEmail.toLowerCase()))) {
    return forbidden("Email Inbox only includes mailboxes assigned to you.");
  }

  const email = cachedEmail || await fetchImapMessage(uid, sourceEmail, sessionUserId(session), admin);
  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const result = await applyEmailToProvider(email, session.user.id, createProvider);
  await updateCachedImapEmails((emails) =>
    emails.map((item) =>
      item.uid === uid
        ? {
            ...item,
            matchedProviderId: result.providerId,
            matchedProvider: result.providerName,
            matchedProviderWebsite: result.providerWebsite ?? null,
          }
        : item
    )
  );
  return NextResponse.json({ success: true, ...result });
}
