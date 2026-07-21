import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runAgent } from "@/lib/ai";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { messages } = body as { messages: Array<{ role: string; content: string }> };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }

    const result = await db.select().from(settings).where(eq(settings.key, "openrouter_api_key")).limit(1);
    const apiKeyVal = result[0]?.value;
    const apiKey = typeof apiKeyVal === "string" ? apiKeyVal : JSON.parse(apiKeyVal as string);
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI Agent is not configured. Please set the OpenRouter API key in Settings → AI Agent." },
        { status: 400 }
      );
    }

    const response = await runAgent(messages, session.user.id);
    return NextResponse.json({ response });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
