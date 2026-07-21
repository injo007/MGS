const TELEGRAM_API_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || ""}`;

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

async function telegramFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = `${TELEGRAM_API_BASE}${path}`;
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

export function parseTelegramUpdate(update: any): ParsedTelegramUpdate | null {
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
