import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCachedImapInbox, getImapConfigs, saveCachedImapInbox, syncImapInbox } from "@/lib/imap-service";
import { isAdmin, sessionUserId } from "@/lib/access-control";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = isAdmin(session);
    const configs = await getImapConfigs(sessionUserId(session), admin);
    const result = await syncImapInbox(session.user.id, admin);
    const snapshot = await saveCachedImapInbox(result, session.user.id, "manual", admin ? undefined : configs.map((account) => account.user));
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const imapConfigs = await getImapConfigs(sessionUserId(session), isAdmin(session));
    const parsed = await getCachedImapInbox();
    const allowed = isAdmin(session) ? null : new Set(imapConfigs.map((account) => account.user.toLowerCase()));
    const filtered = parsed && allowed
      ? {
          ...parsed,
          emails: (parsed.emails || []).filter((email) => allowed.has((email.sourceEmail || "").toLowerCase())),
        }
      : parsed;

    return NextResponse.json({
      configured: imapConfigs.length > 0,
      accounts: imapConfigs.map((account) => ({ email: account.user, label: account.label || account.user, host: account.host, port: account.port })),
      lastSync: filtered || null,
    });
  } catch {
    return NextResponse.json({ configured: false, lastSync: null });
  }
}
