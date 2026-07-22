import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { providers, tasks, auditLogs } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { sendAuditTelegramAlert, sendTelegramMessage, parseTelegramUpdate, setTelegramWebhook } from "@/lib/telegram";
import { isAdmin } from "@/lib/access-control";

export async function POST(request: Request) {
  try {
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    const rawUpdate = await request.json();

    if (rawUpdate?.action === "send_test" || rawUpdate?.action === "send_audit_test" || rawUpdate?.url) {
      const session = await auth();
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      if (rawUpdate.action === "send_test") {
        if (!rawUpdate.chat_id) return NextResponse.json({ error: "chat_id is required" }, { status: 400 });
        await sendTelegramMessage(String(rawUpdate.chat_id), rawUpdate.text || "Test message from CloudOps CRM");
        return NextResponse.json({ ok: true });
      }

      if (rawUpdate.action === "send_audit_test") {
        await sendAuditTelegramAlert({
          action: "create",
          entityType: "server",
          actorName: session.user.name,
          actorEmail: session.user.email,
          entityName: "Telegram audit alert test",
          entityDetail: "Settings test",
        }, { throwOnError: true });
        return NextResponse.json({ ok: true });
      }

      await setTelegramWebhook(String(rawUpdate.url), expectedSecret);
      return NextResponse.json({ ok: true });
    }

    if (expectedSecret && secretToken !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = parseTelegramUpdate(rawUpdate);

    if (!parsed || !parsed.text) {
      return NextResponse.json({ ok: true });
    }

    if (!parsed.isCommand) {
      return NextResponse.json({ ok: true });
    }

    const chatId = parsed.chatId;
    const cmd = parsed.command;
    void parsed.commandArgs;

    let responseText: string;

    switch (cmd) {
      case "/start":
        responseText = "Welcome to CloudOps CRM Bot! I can provide you with CRM stats and updates.\n\nUse /chatid to get the exact chat ID for CRM alerts.\n\nType /help to see available commands.";
        break;

      case "/help":
        responseText = "Available commands:\n\n"
          + "/start - Welcome message\n"
          + "/help - Show this help\n"
          + "/chatid - Show this chat ID for alert setup\n"
          + "/stats - Show CRM dashboard statistics\n"
          + "/providers - List last 10 providers\n"
          + "/tasks - List last 10 open tasks";
        break;

      case "/chatid":
        responseText = "Telegram alert setup:\n\n"
          + `Chat ID: \`${chatId}\`\n`
          + `Chat type: ${parsed.chatType}\n\n`
          + "Copy this Chat ID into Settings > Telegram Bot > Alert Chat ID.";
        break;

      case "/stats": {
        const [providerCount] = await db.select({ value: count() }).from(providers);
        const [taskCount] = await db.select({ value: count() }).from(tasks);
        const [openTaskCount] = await db.select({ value: count() }).from(tasks).where(eq(tasks.status, "open"));
        const acceptedCount = await db.select({ value: count() }).from(providers).where(eq(providers.decision, "accepted"));
        const contactedCount = await db
          .select({ value: count() })
          .from(providers)
          .where(eq(providers.contactStatus, "contacted"));

        responseText = "📊 *CRM Dashboard Stats*\n\n"
          + `Total providers: ${providerCount.value}\n`
          + `Accepted: ${acceptedCount[0].value}\n`
          + `Contacted: ${contactedCount[0].value}\n`
          + `Total tasks: ${taskCount.value}\n`
          + `Open tasks: ${openTaskCount.value}\n`;
        break;
      }

      case "/providers": {
        const recentProviders = await db
          .select({
            id: providers.id,
            name: providers.name,
            country: providers.country,
            contactStatus: providers.contactStatus,
            decision: providers.decision,
          })
          .from(providers)
          .orderBy(desc(providers.updatedAt))
          .limit(10);

        if (recentProviders.length === 0) {
          responseText = "No providers found.";
        } else {
          const lines = recentProviders.map(
            (p, i) => `${i + 1}. ${p.name} [${p.country || "N/A"}] - Status: ${p.contactStatus}, Decision: ${p.decision}`
          );
          responseText = "📋 *Recent Providers:*\n\n" + lines.join("\n");
        }
        break;
      }

      case "/tasks": {
        const openTasks = await db
          .select({
            id: tasks.id,
            title: tasks.title,
            priority: tasks.priority,
            createdAt: tasks.createdAt,
          })
          .from(tasks)
          .where(eq(tasks.status, "open"))
          .orderBy(desc(tasks.createdAt))
          .limit(10);

        if (openTasks.length === 0) {
          responseText = "No open tasks found.";
        } else {
          const lines = openTasks.map(
            (t, i) => `${i + 1}. [${t.priority}] ${t.title}`
          );
          responseText = "📌 *Open Tasks:*\n\n" + lines.join("\n");
        }
        break;
      }

      default:
        responseText = `Unknown command: ${cmd}. Type /help to see available commands.`;
        break;
    }

    await sendTelegramMessage(chatId, responseText);

    try {
      await db.insert(auditLogs).values({
        userId: "00000000-0000-0000-0000-000000000000",
        action: "telegram_command",
        entityType: "telegram_update",
        newValue: { command: cmd, chatId: chatId, text: parsed.text },
      });
    } catch {
      // audit log failure is non-fatal
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
