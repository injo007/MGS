import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

function telegramApiBase(token: string) {
  return `https://api.telegram.org/bot${token}`;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

export interface ParsedTelegramUpdate {
  updateId: number;
  chatId: string;
  chatType: string;
  userId?: number;
  userDisplayName?: string;
  userUsername?: string;
  text?: string;
  isCommand: boolean;
  command?: string;
  commandArgs?: string;
  timestamp: number;
}

async function getSettingValue(key: string): Promise<string> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return typeof row?.value === "string" ? row.value : "";
}

export async function getTelegramBotToken(): Promise<string> {
  return process.env.TELEGRAM_BOT_TOKEN || await getSettingValue("telegram_bot_token");
}

export async function getTelegramAlertChatId(): Promise<string> {
  return process.env.TELEGRAM_ALERT_CHAT_ID || await getSettingValue("telegram_alert_chat_id");
}

async function telegramFetch(path: string, options?: RequestInit, tokenOverride?: string): Promise<Response> {
  const token = tokenOverride || await getTelegramBotToken();
  if (!token) throw new Error("Telegram bot token is not configured");
  const url = `${telegramApiBase(token)}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
  return response;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<{ messageId: number }> {
  const res = await telegramFetch("/sendMessage", {
    method: "POST",
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    }),
  });
  const data = await res.json();
  return { messageId: data.result?.message_id };
}

export async function sendTelegramAlert(text: string): Promise<boolean> {
  const chatId = await getTelegramAlertChatId();
  if (!chatId) return false;
  await sendTelegramMessage(chatId, text);
  return true;
}

function escapeMarkdown(value: unknown): string {
  return String(value ?? "-").replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export async function sendAuditTelegramAlert(input: {
  action: "login" | "create" | "delete";
  entityType: "user" | "provider" | "server" | "ip_address";
  actorName?: string | null;
  actorEmail?: string | null;
  entityName?: string | null;
  entityDetail?: string | null;
}) {
  try {
    const actionLabels = {
      login: "User Login",
      create: "Created",
      delete: "Deleted",
    };
    const entityLabels = {
      user: "User",
      provider: "Provider",
      server: "Server",
      ip_address: "IP Address",
    };
    const icon = input.action === "delete" ? "🗑️" : input.action === "login" ? "🔐" : "➕";
    const lines = [
      `${icon} *${escapeMarkdown(actionLabels[input.action])}*`,
      `Type: ${escapeMarkdown(entityLabels[input.entityType])}`,
      input.entityName ? `Item: ${escapeMarkdown(input.entityName)}` : null,
      input.entityDetail ? `Details: ${escapeMarkdown(input.entityDetail)}` : null,
      input.actorName || input.actorEmail ? `By: ${escapeMarkdown(input.actorName || input.actorEmail)}${input.actorEmail ? ` \\(${escapeMarkdown(input.actorEmail)}\\)` : ""}` : null,
      `Time: ${escapeMarkdown(new Date().toLocaleString("en-US", { timeZone: "UTC" }))} UTC`,
    ].filter(Boolean);
    await sendTelegramAlert(lines.join("\n"));
  } catch (error) {
    console.warn("[telegram] audit alert failed", error);
  }
}

export async function setTelegramWebhook(webhookUrl: string, secretToken?: string): Promise<void> {
  const body: Record<string, unknown> = { url: webhookUrl };
  if (secretToken) body.secret_token = secretToken;
  const res = await telegramFetch("/setWebhook", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Failed to set webhook: ${data.description}`);
}

export function parseTelegramUpdate(update: TelegramUpdate): ParsedTelegramUpdate | null {
  if (!update || !update.update_id) return null;

  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
  if (!message) return null;

  const text = message.text || "";
  let command: string | undefined;
  let commandArgs: string | undefined;
  let isCommand = false;

  if (message.entities && message.entities.length > 0) {
    const firstEntity = message.entities[0];
    if (firstEntity.type === "bot_command") {
      isCommand = true;
      command = text.slice(firstEntity.offset, firstEntity.length);
      commandArgs = text.slice(firstEntity.offset + firstEntity.length).trim();
    }
  }

  return {
    updateId: update.update_id,
    chatId: String(message.chat.id),
    chatType: message.chat.type,
    userId: message.from ? message.from.id : undefined,
    userDisplayName: message.from ? message.from.first_name : undefined,
    userUsername: message.from ? message.from.username : undefined,
    text: text || undefined,
    isCommand,
    command,
    commandArgs,
    timestamp: message.date,
  };
}
