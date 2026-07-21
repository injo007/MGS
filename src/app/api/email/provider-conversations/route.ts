import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCachedImapInbox, getImapConfigs } from "@/lib/imap-service";
import { isAdmin, sessionUserId } from "@/lib/access-control";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get("providerId");
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 500)));
  const requestedSourceEmail = searchParams.get("sourceEmail")?.trim().toLowerCase();

  if (!providerId) {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }

  const cached = await getCachedImapInbox();
  const admin = isAdmin(session);
  const configs = await getImapConfigs(sessionUserId(session), admin);
  const configuredSources = configs.map((account) => account.user.toLowerCase());
  if (requestedSourceEmail && !configuredSources.includes(requestedSourceEmail)) {
    return NextResponse.json({ error: "Selected mailbox is not configured or not assigned to you." }, { status: 403 });
  }
  const allowed = requestedSourceEmail
    ? new Set([requestedSourceEmail])
    : admin
      ? null
      : new Set(configuredSources);
  const emails = (cached?.emails || [])
    .filter((email) => email.matchedProviderId === providerId)
    .filter((email) => !allowed || allowed.has((email.sourceEmail || "").toLowerCase()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  return NextResponse.json({
    data: emails,
    lastSync: cached
      ? {
          timestamp: cached.timestamp,
          mode: cached.mode,
          processed: cached.processed,
          matched: cached.matched,
          unmatched: cached.unmatched,
          errors: cached.errors,
        }
      : null,
    source: "cache",
  });
}
