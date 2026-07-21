/* eslint-disable @typescript-eslint/no-explicit-any */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db } from "@/db";
import { providers, providerContacts, providerResponses, outreachLogs, settings } from "@/db/schema";
import { and, or, ilike, eq } from "drizzle-orm";
import { Readable } from "stream";

export interface InboxEmail {
  uid: number;
  messageId: string | null;
  mailbox: string;
  sourceEmail: string;
  sourceLabel: string;
  direction: "incoming" | "outgoing";
  from: string;
  fromName: string | null;
  fromAddress: string;
  to: string;
  toAddresses: string[];
  subject: string;
  date: string;
  matchedProvider: string | null;
  matchedProviderId: string | null;
  matchedProviderWebsite: string | null;
  responseType: string;
  bodyPreview: string;
  bodyText: string;
  seen: boolean;
}

export interface ImapSyncResult {
  processed: number;
  matched: number;
  unmatched: number;
  errors: string[];
  emails: InboxEmail[];
}

export interface CachedImapSync extends ImapSyncResult {
  timestamp: string;
  userId: string;
  mode: "manual" | "daily";
}

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  label?: string;
  assignedUserId?: string | null;
}

function parseSetting(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getSetting(key: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return parseSetting(row?.value);
}

async function setSetting(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key, value: serialized })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: serialized, updatedAt: new Date() },
    });
}

export async function getCachedImapInbox(): Promise<CachedImapSync | null> {
  return ((await getSetting("cached_imap_inbox")) || (await getSetting("last_imap_sync")) || null) as CachedImapSync | null;
}

export async function saveCachedImapInbox(result: ImapSyncResult, userId: string, mode: "manual" | "daily" = "manual", mergeSourceEmails?: string[]) {
  let emails = result.emails;
  if (mergeSourceEmails && mergeSourceEmails.length > 0) {
    const sourceSet = new Set(mergeSourceEmails.map((email) => email.toLowerCase()));
    const cached = await getCachedImapInbox();
    const preserved = (cached?.emails || []).filter((email) => !sourceSet.has((email.sourceEmail || "").toLowerCase()));
    emails = [...preserved, ...result.emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  const snapshot: CachedImapSync = {
    timestamp: new Date().toISOString(),
    userId,
    mode,
    ...result,
    emails,
    processed: emails.length,
    matched: emails.filter((email) => email.matchedProviderId).length,
    unmatched: emails.filter((email) => !email.matchedProviderId).length,
  };
  await setSetting("cached_imap_inbox", snapshot);
  await setSetting("last_imap_sync", snapshot);
  return snapshot;
}

export async function updateCachedImapEmails(updater: (emails: InboxEmail[]) => InboxEmail[]) {
  const cached = await getCachedImapInbox();
  if (!cached) return null;
  const next = { ...cached, emails: updater(cached.emails || []) };
  next.processed = next.emails.length;
  next.matched = next.emails.filter((email) => email.matchedProviderId).length;
  next.unmatched = next.emails.length - next.matched;
  await setSetting("cached_imap_inbox", next);
  await setSetting("last_imap_sync", next);
  return next;
}

export async function getImapConfig(userId?: string, includeAll = true): Promise<ImapConfig | null> {
  const accounts = await getImapConfigs(userId, includeAll);
  return accounts[0] || null;
}

export async function getImapConfigs(userId?: string, includeAll = true): Promise<ImapConfig[]> {
  const savedAccounts = (await getSetting("imap_accounts")) as unknown;
  if (Array.isArray(savedAccounts)) {
    const accounts = savedAccounts
      .map((account) => {
        const row = account as Record<string, unknown>;
        return {
          host: String(row.host || "imap.gmail.com"),
          port: Number(row.port || 993),
          user: String(row.email || row.user || ""),
          pass: String(row.password || row.pass || ""),
          label: String(row.label || row.email || row.user || ""),
          assignedUserId: row.assignedUserId ? String(row.assignedUserId) : null,
        };
      })
      .filter((account) => account.host && account.user && account.pass);
    const visibleAccounts = includeAll || !userId
      ? accounts
      : accounts.filter((account) => account.assignedUserId === userId);
    if (visibleAccounts.length > 0 || accounts.length > 0) return visibleAccounts;
  }

  const host = String((await getSetting("imap_host")) || process.env.GMAIL_IMAP_HOST || "imap.gmail.com");
  const portRaw = (await getSetting("imap_port")) || process.env.GMAIL_IMAP_PORT || "993";
  const user = String((await getSetting("imap_email")) || process.env.GMAIL_ADDRESS || "");
  const pass = String((await getSetting("imap_password")) || process.env.GMAIL_APP_PASSWORD || "");
  const port = Number(portRaw) || 993;

  if (!host || !user || !pass) return [];
  return includeAll ? [{ host, port, user, pass, label: user }] : [];
}

function createClient(config: ImapConfig) {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: undefined,
    connectionTimeout: 30000,
  });
}

export function inferResponseType(subject: string, body: string): string {
  const combined = `${subject} ${body}`.toLowerCase();
  const mentionsPort25 =
    combined.includes("port 25") ||
    combined.includes("port25") ||
    combined.includes("outbound traffic") ||
    combined.includes("outgoing traffic");
  const port25Positive =
    mentionsPort25 &&
    (combined.includes("available") ||
      combined.includes("open") ||
      combined.includes("enabled") ||
      combined.includes("unblocked") ||
      combined.includes("not blocked") ||
      combined.includes("allowed") ||
      combined.includes("approved"));
  const port25Negative =
    mentionsPort25 &&
    (combined.includes("blocked") ||
      combined.includes("closed") ||
      combined.includes("disabled") ||
      combined.includes("not allowed") ||
      combined.includes("prohibited") ||
      combined.includes("restricted"));

  if (port25Positive) {
    return "port25_available";
  }
  if (
    combined.includes("mail server") &&
    (combined.includes("not allowed") || combined.includes("prohibited") || combined.includes("forbidden"))
  ) {
    return "mail_servers_prohibited";
  }
  if (port25Negative) {
    return "port25_blocked";
  }
  if (combined.includes("kyc") || combined.includes("know your customer")) {
    return "requires_kyc";
  }
  if (combined.includes("verify") || combined.includes("confirmation") || combined.includes("identity")) {
    return "needs_verification";
  }
  if (combined.includes("deposit") || combined.includes("payment") || combined.includes("fee") || combined.includes("cost")) {
    return "requires_deposit";
  }
  if (combined.includes("support") || combined.includes("ticket") || combined.includes("help desk")) {
    return "requires_support_request";
  }
  if (combined.includes("reject") || combined.includes("denied") || combined.includes("not interested") || combined.includes("unable to")) {
    return "rejected";
  }
  if (combined.includes("approv") || combined.includes("yes") || combined.includes("confirmed") || combined.includes("accepted")) {
    return "approved";
  }

  return "other";
}

function providerUpdateForResponse(responseType: string, responseDate: Date) {
  const base = {
    contactStatus: "contacted" as const,
    responseStatus: "replied" as const,
    lastContactDate: responseDate,
    updatedAt: new Date(),
  };

  if (responseType === "approved" || responseType === "port25_available") {
    return {
      ...base,
      decision: responseType === "approved" ? ("accepted" as const) : ("pending" as const),
      mailServerAllowed: true,
      port25Status: responseType === "port25_available" ? ("available" as const) : undefined,
    };
  }
  if (responseType === "rejected") {
    return { ...base, decision: "denied" as const };
  }
  if (responseType === "mail_servers_prohibited" || responseType === "port25_blocked") {
    return {
      ...base,
      decision: "prohibited_sending" as const,
      mailServerAllowed: false,
      port25Status: responseType === "port25_blocked" ? ("blocked" as const) : undefined,
      sendingRestrictions: responseType === "mail_servers_prohibited" ? "Provider response prohibits mail server use." : "Provider response indicates Port 25/outbound traffic is blocked.",
    };
  }

  return { ...base, decision: "pending" as const, responseStatus: "needs_follow_up" as const };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase().replace(/^www\./, "") || "";
}

function nameFromEmail(email: string, fromName?: string | null) {
  if (fromName) return fromName.replace(/^["']|["']$/g, "").trim();
  const domain = emailDomain(email);
  if (!domain) return email || "Unknown Provider";
  return domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export async function findProvider(email: string): Promise<{ id: string; name: string; website: string | null } | null> {
  const emailLower = normalizeEmail(email);
  const domain = emailDomain(emailLower);
  if (!emailLower) return null;
  const conditions = [
    ilike(providers.supportEmail, `%${emailLower}%`),
    ilike(providers.salesEmail, `%${emailLower}%`),
  ];
  if (domain) conditions.push(ilike(providers.website, `%${domain}%`));

  const matchedProviders = await db
    .select({
      id: providers.id,
      supportEmail: providers.supportEmail,
      salesEmail: providers.salesEmail,
      website: providers.website,
      name: providers.name,
    })
    .from(providers)
    .where(or(...conditions))
    .limit(10);

  const actualMatch = matchedProviders.find((p) => {
    const support = p.supportEmail?.toLowerCase();
    const sales = p.salesEmail?.toLowerCase();
    const website = p.website?.toLowerCase();
    return (
      (support && (emailLower.includes(support) || support.includes(emailLower))) ||
      (sales && (emailLower.includes(sales) || sales.includes(emailLower))) ||
      (domain && website?.includes(domain))
    );
  });

  if (actualMatch) return { id: actualMatch.id, name: actualMatch.name, website: actualMatch.website };

  const [contactMatch] = await db
    .select({
      id: providers.id,
      name: providers.name,
      website: providers.website,
    })
    .from(providerContacts)
    .innerJoin(providers, eq(providerContacts.providerId, providers.id))
    .where(ilike(providerContacts.email, `%${emailLower}%`))
    .limit(1);

  return contactMatch ? { id: contactMatch.id, name: contactMatch.name, website: contactMatch.website } : null;
}

async function findProviderForAddresses(addresses: string[]) {
  for (const address of addresses) {
    const match = await findProvider(address);
    if (match) return match;
  }
  return null;
}

function emailImportMarker(email: Pick<InboxEmail, "messageId" | "uid" | "mailbox" | "sourceEmail">) {
  const key = email.messageId || `${email.sourceEmail}:${email.mailbox}:${email.uid}`;
  return `[serverops-email:${key}]`;
}

function addressList(addresses: unknown) {
  if (!addresses) return { text: "", emails: [] as string[] };
  const list = Array.isArray(addresses) ? addresses : [addresses];
  const text = list
    .map((item: any) => item?.text)
    .filter(Boolean)
    .join(", ");
  const emails = list
    .flatMap((item: any) => item?.value ?? [])
    .map((item: any) => item?.address)
    .filter((item: unknown): item is string => typeof item === "string" && item.length > 0);

  return { text, emails };
}

async function outreachAlreadyImported(providerId: string, email: InboxEmail) {
  const marker = emailImportMarker(email);
  const [existing] = await db
    .select({ id: outreachLogs.id })
    .from(outreachLogs)
    .where(and(eq(outreachLogs.providerId, providerId), ilike(outreachLogs.message, `%${marker}%`)))
    .limit(1);

  return Boolean(existing);
}

async function parseMessage(
  uid: number,
  source: Buffer | Readable,
  flags: Set<string> | undefined,
  mailbox: string,
  direction: "incoming" | "outgoing",
  config: ImapConfig
): Promise<InboxEmail> {
  const buffer = Buffer.isBuffer(source) ? source : await streamToBuffer(source);
  const parsed = await simpleParser(buffer);
  const from = parsed.from?.value?.[0];
  const fromAddress = from?.address || parsed.from?.text || "";
  const fromName = from?.name || null;
  const parsedTo = addressList(parsed.to);
  const toAddresses = parsedTo.emails;
  const subject = parsed.subject || "(no subject)";
  const bodyText = (parsed.text || parsed.html || "").replace(/\s+\n/g, "\n").trim();
  const date = parsed.date || new Date();
  const matchedProvider = direction === "outgoing"
    ? await findProviderForAddresses(toAddresses)
    : await findProvider(fromAddress);
  const responseType = inferResponseType(subject, bodyText);

  return {
    uid,
    messageId: parsed.messageId || null,
    mailbox,
    sourceEmail: config.user,
    sourceLabel: config.label || config.user,
    direction,
    from: parsed.from?.text || fromAddress,
    fromName,
    fromAddress,
    to: parsedTo.text || toAddresses.join(", "),
    toAddresses,
    subject,
    date: (date instanceof Date ? date : new Date(date)).toISOString(),
    matchedProvider: matchedProvider?.name ?? null,
    matchedProviderId: matchedProvider?.id ?? null,
    matchedProviderWebsite: matchedProvider?.website ?? null,
    responseType,
    bodyPreview: bodyText.slice(0, 300),
    bodyText: bodyText.slice(0, 20000),
    seen: flags?.has("\\Seen") ?? false,
  };
}

async function fetchMailboxEmails(config: ImapConfig, mailboxName: string, direction: "incoming" | "outgoing", limit: number): Promise<InboxEmail[]> {
  const client = createClient(config);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(mailboxName);
    if (!mailbox || mailbox.exists === 0) return [];

    const start = Math.max(1, mailbox.exists - limit + 1);
    const rows: Array<{ uid: number; source: Buffer; flags?: Set<string> }> = [];

    for await (const message of client.fetch(`${start}:*`, { uid: true, source: true, flags: true })) {
      if (!message.uid || !message.source) continue;
      rows.push({ uid: Number(message.uid), source: message.source as Buffer, flags: message.flags as Set<string> | undefined });
    }

    const emails = [];
    for (const row of rows.reverse()) {
      emails.push(await parseMessage(row.uid, row.source, row.flags, mailboxName, direction, config));
    }
    return emails;
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore disconnect errors.
    }
  }
}

export async function fetchImapInbox(limit = 50, userId?: string, includeAll = true): Promise<InboxEmail[]> {
  const config = await getImapConfig(userId, includeAll);
  if (!config) return [];
  return fetchMailboxEmails(config, "INBOX", "incoming", limit);
}

export async function fetchImapConversations(limit = 500, userId?: string, includeAll = true, sourceEmails?: string[]): Promise<InboxEmail[]> {
  const allowedSources = sourceEmails?.length
    ? new Set(sourceEmails.map((email) => email.toLowerCase()))
    : null;
  const configs = (await getImapConfigs(userId, includeAll)).filter((config) => !allowedSources || allowedSources.has(config.user.toLowerCase()));
  const sentMailboxes = ["[Gmail]/Sent Mail", "Sent", "Sent Mail"];
  const collected: InboxEmail[] = [];
  const seen = new Set<string>();

  for (const config of configs) {
    for (const mailbox of [{ name: "INBOX", direction: "incoming" as const }, ...sentMailboxes.map((name) => ({ name, direction: "outgoing" as const }))]) {
      try {
        const emails = await fetchMailboxEmails(config, mailbox.name, mailbox.direction, limit);
        for (const email of emails) {
          if (!email.matchedProviderId) continue;
          const key = email.messageId || `${email.sourceEmail}:${email.mailbox}:${email.uid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push(email);
        }
      } catch {
        // Some providers use different sent-folder names; keep syncing the accounts/folders that exist.
      }
    }
  }

  return collected.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit);
}

export async function fetchImapMessage(uid: number, sourceEmail?: string, userId?: string, includeAll = true): Promise<InboxEmail | null> {
  const configs = await getImapConfigs(userId, includeAll);
  const config = sourceEmail ? configs.find((account) => account.user.toLowerCase() === sourceEmail.toLowerCase()) : configs[0];
  if (!config) return null;

  const client = createClient(config);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const download = await client.download(`${uid}`, undefined, { uid: true });
    if (!download?.content) return null;
    return await parseMessage(uid, download.content, undefined, "INBOX", "incoming", config);
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore disconnect errors.
    }
  }
}

export async function moveImapMessage(uid: number, action: "archive" | "delete", sourceEmail?: string) {
  const configs = await getImapConfigs();
  const config = sourceEmail ? configs.find((account) => account.user.toLowerCase() === sourceEmail.toLowerCase()) : configs[0];
  if (!config) throw new Error("IMAP is not configured.");

  const client = createClient(config);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    if (action === "archive") {
      try {
        await client.messageMove(`${uid}`, "[Gmail]/All Mail", { uid: true });
      } catch {
        await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
      }
    } else {
      try {
        await client.messageMove(`${uid}`, "[Gmail]/Trash", { uid: true });
      } catch {
        await client.messageFlagsAdd(`${uid}`, ["\\Deleted"], { uid: true });
        await client.messageDelete(`${uid}`, { uid: true });
      }
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore disconnect errors.
    }
  }
}

export async function applyEmailToProvider(email: InboxEmail, userId: string, createProvider: boolean) {
  const syncedEmail: InboxEmail = {
    ...email,
    mailbox: email.mailbox || "INBOX",
    sourceEmail: email.sourceEmail || "",
    sourceLabel: email.sourceLabel || email.sourceEmail || "",
    direction: email.direction || "incoming",
    to: email.to || "",
    toAddresses: email.toAddresses || [],
    matchedProviderWebsite: email.matchedProviderWebsite || null,
  };
  let providerId = email.matchedProviderId;
  let providerName = email.matchedProvider;
  let providerWebsite = email.matchedProviderWebsite;
  const responseDate = new Date(syncedEmail.date);
  const update = providerUpdateForResponse(syncedEmail.responseType, responseDate);

  if (!providerId && createProvider) {
    const contactEmail = syncedEmail.direction === "incoming" ? syncedEmail.fromAddress : syncedEmail.toAddresses[0] || "";
    const domain = emailDomain(contactEmail);
    const providerInitialStatus = syncedEmail.direction === "incoming"
      ? update
      : {
          contactStatus: "contacted" as const,
          responseStatus: "no_response" as const,
          lastContactDate: responseDate,
          updatedAt: new Date(),
        };
    const [created] = await db
      .insert(providers)
      .values({
        name: nameFromEmail(contactEmail, syncedEmail.direction === "incoming" ? syncedEmail.fromName : null),
        website: domain ? `https://${domain}` : null,
        supportEmail: contactEmail || null,
        createdById: userId,
        ...providerInitialStatus,
      })
      .returning({ id: providers.id, name: providers.name, website: providers.website });
    providerId = created.id;
    providerName = created.name;
    providerWebsite = created.website;
  }

  if (!providerId) {
    throw new Error("No matched provider. Use Create Provider first or update the provider email address.");
  }

  if (await outreachAlreadyImported(providerId, syncedEmail)) {
    return { providerId, providerName, responseType: syncedEmail.responseType, decision: update.decision, imported: false };
  }

  const marker = emailImportMarker(syncedEmail);
  const bodyWithMarker = `${syncedEmail.bodyText}\n\n${marker}`;

  if (syncedEmail.direction === "incoming") {
    await db.update(providers).set(update).where(eq(providers.id, providerId));

    await db.insert(providerResponses).values({
      providerId,
      responseDate,
      responseType: syncedEmail.responseType as any,
      fullResponse: bodyWithMarker,
      summary: syncedEmail.subject.slice(0, 500),
      decisionRecommendation: update.decision,
      createdById: userId,
    });
  } else {
    await db
      .update(providers)
      .set({
        contactStatus: "contacted",
        lastContactDate: responseDate,
        updatedAt: new Date(),
      })
      .where(eq(providers.id, providerId));
  }

  await db.insert(outreachLogs).values({
    providerId,
    date: responseDate,
    channel: "email",
    recipient: syncedEmail.direction === "incoming" ? syncedEmail.fromAddress : syncedEmail.toAddresses.join(", "),
    subject: syncedEmail.subject.slice(0, 500),
    message: bodyWithMarker,
    sentById: userId,
    sendResult: syncedEmail.direction === "incoming" ? "replied" : "sent",
    responseDate: syncedEmail.direction === "incoming" ? responseDate : null,
    responseSummary: syncedEmail.direction === "incoming" ? syncedEmail.bodyPreview : null,
  });

  return { providerId, providerName, providerWebsite: providerWebsite ?? null, responseType: syncedEmail.responseType, decision: update.decision, imported: true };
}

export async function syncImapInbox(userId: string, includeAll = true, sourceEmails?: string[]): Promise<ImapSyncResult> {
  const result: ImapSyncResult = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    errors: [],
    emails: [],
  };

  try {
    const emails = await fetchImapConversations(500, userId, includeAll, sourceEmails);
    result.emails = emails;
    result.processed = emails.length;

    for (const email of emails) {
      try {
        result.matched++;
        await applyEmailToProvider(email, userId, false);
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : `Failed to apply email UID ${email.uid}`);
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "IMAP connection/sync error");
  }

  return result;
}
