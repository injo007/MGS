import { NextResponse } from "next/server";
import { runDailyIpIntelligence } from "@/lib/ip-intelligence";

const CRON_API_KEY = process.env.CRON_API_KEY || "cloudops-cron-key-change-me";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyIpIntelligence(false);
  return NextResponse.json({
    ...result,
    timestamp: new Date().toISOString(),
  });
}
