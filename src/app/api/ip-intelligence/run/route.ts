import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDefaultBlacklistProvider, runDailyIpIntelligence, runIpIntelligenceForServers } from "@/lib/ip-intelligence";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";
import { isBlacklistProvider } from "@/lib/blacklist-providers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ provider: await getDefaultBlacklistProvider() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const serverIds = Array.isArray(body.serverIds)
    ? body.serverIds.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];
  const provider = isBlacklistProvider(body.provider) ? body.provider : undefined;

  if (serverIds.length > 0) {
    const result = await runIpIntelligenceForServers(
      serverIds,
      body.force !== false,
      isAdmin(session) ? undefined : sessionUserId(session),
      isAdmin(session) ? sessionUserId(session) : undefined,
      provider,
    );
    return NextResponse.json(result);
  }

  if (!isAdmin(session)) return forbidden("Global blacklist checks are available to admins only.");

  const result = await runDailyIpIntelligence(Boolean(body.force), provider);
  return NextResponse.json(result);
}
