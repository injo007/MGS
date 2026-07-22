import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDailyIpIntelligence, runIpIntelligenceForServers } from "@/lib/ip-intelligence";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const serverIds = Array.isArray(body.serverIds)
    ? body.serverIds.map((id: unknown) => String(id).trim()).filter(Boolean)
    : [];

  if (serverIds.length > 0) {
    const result = await runIpIntelligenceForServers(
      serverIds,
      body.force !== false,
      isAdmin(session) ? undefined : sessionUserId(session),
      isAdmin(session) ? sessionUserId(session) : undefined,
    );
    return NextResponse.json(result);
  }

  if (!isAdmin(session)) return forbidden("Global blacklist checks are available to admins only.");

  const result = await runDailyIpIntelligence(Boolean(body.force));
  return NextResponse.json(result);
}
