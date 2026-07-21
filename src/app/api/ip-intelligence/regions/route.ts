import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runIpRegionDetection } from "@/lib/ip-intelligence";
import { forbidden, isAdmin } from "@/lib/access-control";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Global region detection is available to admins only.");

  const body = await request.json().catch(() => ({}));
  const result = await runIpRegionDetection(Boolean(body.force));
  return NextResponse.json(result);
}
