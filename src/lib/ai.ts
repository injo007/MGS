/* eslint-disable @typescript-eslint/no-explicit-any */

import { db } from "@/db";
import {
  providers,
  providerResponses,
  servers,
  ipAddresses,
  outreachLogs,
  tasks,
  users,
  sendingLogs,
  settings,
} from "@/db/schema";
import { eq, ilike, desc, asc, and, count, sql } from "drizzle-orm";
import { getCachedImapInbox } from "@/lib/imap-service";
import { enrichIpAddress, getIpIntelligenceCache } from "@/lib/ip-intelligence";

async function getSetting(key: string): Promise<string | null> {
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (result[0]) {
    const val = result[0].value;
    return typeof val === "string" ? val : JSON.parse(val as string);
  }
  return null;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return "";
  }
}

async function fetchText(url: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(normalized, {
      headers: {
        "User-Agent": "ServerOpsCRM/1.0 ProviderResearch",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function researchProviderWeb(name: string, website?: string) {
  const links = new Set<string>();
  if (website) links.add(website);

  if (!website) {
    const query = encodeURIComponent(`${name} hosting official pricing contact support email`);
    const html = await fetchText(`https://duckduckgo.com/html/?q=${query}`);
    for (const match of html.matchAll(/result__a[^>]+href="([^"]+)"/g)) {
      const raw = match[1]?.replace(/&amp;/g, "&");
      const redirected = raw?.match(/[?&]uddg=([^&]+)/)?.[1];
      const url = redirected ? decodeURIComponent(redirected) : raw;
      if (url && !url.includes("duckduckgo.com")) links.add(url);
      if (links.size >= 4) break;
    }
  }

  const pages: Array<{ url: string; text: string }> = [];
  const seed = Array.from(links).slice(0, 4);
  for (const url of seed) {
    const base = new URL(url);
    const candidates = [
      base.href,
      `${base.origin}/pricing`,
      `${base.origin}/contact`,
      `${base.origin}/support`,
    ];
    for (const candidate of candidates) {
      const html = await fetchText(candidate);
      if (html) pages.push({ url: candidate, text: stripHtml(html).slice(0, 6000) });
      if (pages.length >= 6) break;
    }
    if (pages.length >= 6) break;
  }

  const combined = pages.map((page) => page.text).join("\n");
  const emails = Array.from(new Set(combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])).slice(0, 10);
  const priceSnippets = Array.from(combined.matchAll(/.{0,80}(?:\$|€|£)\s?\d+(?:[.,]\d+)?(?:\s?\/\s?(?:mo|month|hour|yr|year))?.{0,80}/gi))
    .map((match) => match[0].trim())
    .slice(0, 8);

  return {
    name,
    searchedAt: new Date().toISOString(),
    likelyWebsite: seed[0] || website || null,
    sources: pages.map((page) => page.url),
    emails,
    priceSnippets,
    notes: pages.length === 0 ? "No public pages could be fetched. Ask the user for the website or add the provider with name only." : "Review sources before treating pricing as final; provider pricing changes frequently.",
  };
}

async function findProviderByIdOrName(args: Record<string, unknown>) {
  if (args.providerId) {
    const [provider] = await db.select().from(providers).where(eq(providers.id, args.providerId as string)).limit(1);
    return provider || null;
  }
  if (args.providerName) {
    const [provider] = await db
      .select()
      .from(providers)
      .where(ilike(providers.name, `%${args.providerName as string}%`))
      .orderBy(desc(providers.updatedAt))
      .limit(1);
    return provider || null;
  }
  return null;
}

export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "scan_app_context",
      description: "Scan the CRM broadly: dashboard totals, recent providers, servers, IP intelligence, provider conversations, responses, tasks, and cached email inbox/conversation data.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum rows per section (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_email_conversations",
      description: "Read cached synced provider email conversations, including inbox replies and sent messages matched to providers.",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "Optional provider UUID filter" },
          query: { type: "string", description: "Search subject, sender, recipient, or body preview" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "research_provider_web",
      description: "Search/fetch public internet pages to find likely provider website, public emails, and pricing snippets. Use before adding a provider when the user asks for correct public provider data.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Provider/company name" },
          website: { type: "string", description: "Known official website URL if available" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_providers",
      description: "Search VPS/cloud providers by name, country, contact status, or decision.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term to match against provider name" },
          contactStatus: {
            type: "string",
            enum: ["not_contacted", "ready_to_contact", "contacted", "follow_up_due", "closed"],
            description: "Filter by contact status",
          },
          decision: {
            type: "string",
            enum: ["pending", "accepted", "denied", "prohibited_sending", "not_suitable"],
            description: "Filter by decision status",
          },
          country: { type: "string", description: "Filter by country" },
          limit: { type: "number", description: "Max results to return (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_provider",
      description: "Get a single provider with full details by ID or name.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Provider UUID" },
          name: { type: "string", description: "Provider name (exact match)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_provider",
      description: "Add a new VPS/cloud provider to the CRM.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Provider name (required)" },
          website: { type: "string", description: "Provider website URL" },
          country: { type: "string", description: "Country" },
          supportEmail: { type: "string", description: "Support email address" },
          salesEmail: { type: "string", description: "Sales email address" },
          enrichFromWeb: { type: "boolean", description: "Research public internet data before creating and fill missing website/email/pricing notes when possible." },
          contactStatus: {
            type: "string",
            enum: ["not_contacted", "ready_to_contact", "contacted", "follow_up_due", "closed"],
          },
          decision: {
            type: "string",
            enum: ["pending", "accepted", "denied", "prohibited_sending", "not_suitable"],
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_provider",
      description: "Update fields on an existing provider.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Provider UUID (required)" },
          name: { type: "string" },
          website: { type: "string" },
          country: { type: "string" },
          supportEmail: { type: "string" },
          salesEmail: { type: "string" },
          contactStatus: {
            type: "string",
            enum: ["not_contacted", "ready_to_contact", "contacted", "follow_up_due", "closed"],
          },
          decision: {
            type: "string",
            enum: ["pending", "accepted", "denied", "prohibited_sending", "not_suitable"],
          },
          responseStatus: {
            type: "string",
            enum: ["not_sent", "no_response", "replied", "needs_follow_up"],
          },
          port25Status: { type: "string", enum: ["available", "blocked", "unknown"] },
          ptrStatus: { type: "string", enum: ["configured", "not_configured", "unknown"] },
          mailServerAllowed: { type: "boolean" },
          dailyLimit: { type: "number" },
          hourlyLimit: { type: "number" },
          startingPrice: { type: "number" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_servers",
      description: "List servers with optional filters for provider and status.",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "Filter by provider UUID" },
          status: {
            type: "string",
            enum: ["pending", "active", "paused", "suspended", "cancelled", "expired"],
          },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_server",
      description: "Add a new server under a provider.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Server name (required)" },
          providerId: { type: "string", description: "Provider UUID. Use when known." },
          providerName: { type: "string", description: "Provider name to resolve when providerId is not known." },
          plan: { type: "string", description: "Server plan/tier" },
          status: {
            type: "string",
            enum: ["pending", "active", "paused", "suspended", "cancelled", "expired"],
          },
          location: { type: "string", description: "Server location/datacenter" },
          monthlyCost: { type: "number", description: "Monthly server cost" },
          currency: { type: "string", description: "Currency code, default USD" },
          operatingSystem: { type: "string", description: "Operating system" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_server",
      description: "Update fields on an existing server.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Server UUID (required)" },
          name: { type: "string" },
          plan: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "active", "paused", "suspended", "cancelled", "expired"],
          },
          location: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_ip_addresses",
      description: "List IP addresses with optional filters.",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "Filter by provider UUID" },
          serverId: { type: "string", description: "Filter by server UUID" },
          status: {
            type: "string",
            enum: ["active", "unused", "warming", "paused", "blocked", "retired"],
          },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_ip_address",
      description: "Add a new IP address to a server.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "IP address (required)" },
          providerId: { type: "string", description: "Provider UUID (required)" },
          serverId: { type: "string", description: "Server UUID (required)" },
          ipVersion: { type: "string", enum: ["ipv4", "ipv6"], description: "IP version (default ipv4)" },
          enrich: { type: "boolean", description: "Automatically detect geo and blacklist status after adding. Default true." },
        },
        required: ["address", "providerId", "serverId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_outreach",
      description: "Create an outreach log entry for contacting a provider.",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "Provider UUID (required)" },
          channel: {
            type: "string",
            enum: ["email", "support_ticket", "contact_form", "live_chat", "phone", "other"],
          },
          recipient: { type: "string", description: "Contact recipient" },
          subject: { type: "string", description: "Message subject" },
          message: { type: "string", description: "Message body" },
        },
        required: ["providerId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_outreach",
      description: "List outreach log entries, optionally filtered by provider.",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "Filter by provider UUID" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title (required)" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          dueDate: { type: "string", description: "Due date in ISO format (YYYY-MM-DD)" },
          assignedUserId: { type: "string", description: "Assignee user UUID" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List tasks with optional filters.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "in_progress", "blocked", "completed", "cancelled"],
          },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: "Update fields on an existing task.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task UUID (required)" },
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["open", "in_progress", "blocked", "completed", "cancelled"],
          },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          dueDate: { type: "string", description: "Due date in ISO format" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_dashboard_stats",
      description: "Get aggregate dashboard statistics: providers by status, server counts, IP counts, and server statistics.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_users",
      description: "List system users.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: [],
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  try {
    switch (name) {
      case "scan_app_context": {
        const limit = Math.min(Number(args.limit) || 20, 50);
        const [
          recentProviders,
          recentServers,
          recentIps,
          recentOutreach,
          recentResponses,
          openTasks,
          cachedInbox,
          ipIntelligence,
        ] = await Promise.all([
          db.select().from(providers).orderBy(desc(providers.updatedAt)).limit(limit),
          db.select().from(servers).orderBy(desc(servers.updatedAt)).limit(limit),
          db.select().from(ipAddresses).orderBy(desc(ipAddresses.updatedAt)).limit(limit),
          db.select().from(outreachLogs).orderBy(desc(outreachLogs.date)).limit(limit),
          db.select().from(providerResponses).orderBy(desc(providerResponses.responseDate)).limit(limit),
          db.select().from(tasks).orderBy(desc(tasks.updatedAt)).limit(limit),
          getCachedImapInbox(),
          getIpIntelligenceCache(),
        ]);

        const [providerCount] = await db.select({ value: count() }).from(providers);
        const [serverCount] = await db.select({ value: count() }).from(servers);
        const [ipCount] = await db.select({ value: count() }).from(ipAddresses);
        const [taskCount] = await db.select({ value: count() }).from(tasks);

        return {
          totals: {
            providers: providerCount.value,
            servers: serverCount.value,
            ipAddresses: ipCount.value,
            tasks: taskCount.value,
          },
          recentProviders,
          recentServers,
          recentIps: recentIps.map((ip) => ({ ...ip, intelligence: ipIntelligence[ip.address] || null })),
          recentOutreach,
          recentResponses,
          openTasks,
          cachedEmailConversations: cachedInbox?.emails?.slice(0, limit) || [],
          lastEmailSync: cachedInbox?.timestamp || null,
        };
      }

      case "list_email_conversations": {
        const limit = Math.min(Number(args.limit) || 20, 100);
        const cached = await getCachedImapInbox();
        let emails = cached?.emails || [];
        if (args.providerId) emails = emails.filter((email) => email.matchedProviderId === args.providerId);
        if (args.query) {
          const q = String(args.query).toLowerCase();
          emails = emails.filter((email) =>
            [email.from, email.fromAddress, email.to, email.subject, email.bodyPreview, email.matchedProvider]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(q))
          );
        }
        return {
          lastSync: cached?.timestamp || null,
          totalCached: cached?.emails?.length || 0,
          data: emails.slice(0, limit),
        };
      }

      case "research_provider_web": {
        if (!args.name) return { error: "name is required" };
        return await researchProviderWeb(String(args.name), args.website ? String(args.website) : undefined);
      }

      case "search_providers": {
        const conditions = [];
        if (args.query) conditions.push(ilike(providers.name, `%${args.query}%`));
        if (args.contactStatus) conditions.push(eq(providers.contactStatus, args.contactStatus as any));
        if (args.decision) conditions.push(eq(providers.decision, args.decision as any));
        if (args.country) conditions.push(ilike(providers.country, `%${args.country}%`));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db
          .select({
            id: providers.id,
            name: providers.name,
            website: providers.website,
            country: providers.country,
            contactStatus: providers.contactStatus,
            decision: providers.decision,
            responseStatus: providers.responseStatus,
          })
          .from(providers)
          .where(where)
          .orderBy(desc(providers.updatedAt))
          .limit(limit);
      }

      case "get_provider": {
        let result;
        if (args.id) {
          result = await db.select().from(providers).where(eq(providers.id, args.id as string)).limit(1);
        } else if (args.name) {
          result = await db.select().from(providers).where(eq(providers.name, args.name as string)).limit(1);
        } else {
          return { error: "Provide either id or name" };
        }
        if (!result[0]) return { error: "Provider not found" };
        const providerServers = await db.select().from(servers).where(eq(servers.providerId, result[0].id));
        const providerIps = await db.select().from(ipAddresses).where(eq(ipAddresses.providerId, result[0].id));
        const providerOutreach = await db
          .select()
          .from(outreachLogs)
          .where(eq(outreachLogs.providerId, result[0].id))
          .orderBy(desc(outreachLogs.date))
          .limit(10);
        return { ...result[0], servers: providerServers, ipAddresses: providerIps, recentOutreach: providerOutreach };
      }

      case "add_provider": {
        if (!args.name) return { error: "name is required" };
        const research = args.enrichFromWeb ? await researchProviderWeb(String(args.name), args.website ? String(args.website) : undefined) : null;
        const supportEmail = (args.supportEmail as string) || research?.emails.find((email) => email.toLowerCase().includes("support")) || research?.emails[0] || null;
        const salesEmail = (args.salesEmail as string) || research?.emails.find((email) => email.toLowerCase().includes("sales")) || null;
        const website = (args.website as string) || research?.likelyWebsite || null;
        const notes = research?.priceSnippets?.length
          ? `Public pricing snippets found on ${research.sources.join(", ")}:\n${research.priceSnippets.join("\n")}`
          : null;
        const inserted = await db
          .insert(providers)
          .values({
            name: args.name as string,
            website,
            country: (args.country as string) || null,
            supportEmail,
            salesEmail,
            abusePolicyNotes: notes,
            contactStatus: (args.contactStatus as any) || "not_contacted",
            decision: (args.decision as any) || "pending",
            createdById: userId,
          })
          .returning();
        return { provider: inserted[0], research };
      }

      case "update_provider": {
        if (!args.id) return { error: "id is required" };
        const updateData: Record<string, unknown> = {};
        const allowedFields = [
          "name", "website", "country", "supportEmail", "salesEmail",
          "contactStatus", "decision", "responseStatus", "port25Status",
          "ptrStatus", "mailServerAllowed", "dailyLimit", "hourlyLimit", "startingPrice",
        ];
        for (const field of allowedFields) {
          if (args[field] !== undefined) updateData[field] = args[field];
        }
        if (Object.keys(updateData).length === 0) return { error: "No fields to update" };
        updateData.updatedAt = new Date();
        const updated = await db.update(providers).set(updateData).where(eq(providers.id, args.id as string)).returning();
        if (!updated[0]) return { error: "Provider not found" };
        return updated[0];
      }

      case "list_servers": {
        const conditions = [];
        if (args.providerId) conditions.push(eq(servers.providerId, args.providerId as string));
        if (args.status) conditions.push(eq(servers.status, args.status as any));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db
          .select({
            id: servers.id,
            name: servers.name,
            providerId: servers.providerId,
            plan: servers.plan,
            location: servers.location,
            status: servers.status,
            createdAt: servers.createdAt,
          })
          .from(servers)
          .where(where)
          .orderBy(desc(servers.createdAt))
          .limit(limit);
      }

      case "add_server": {
        if (!args.name) return { error: "name is required" };
        const provider = await findProviderByIdOrName(args);
        if (!provider) return { error: "providerId or providerName must match an existing provider before adding a server" };
        const inserted = await db
          .insert(servers)
          .values({
            name: args.name as string,
            providerId: provider.id,
            plan: (args.plan as string) || null,
            status: (args.status as any) || "pending",
            location: (args.location as string) || null,
            monthlyCost: args.monthlyCost !== undefined ? String(args.monthlyCost) : null,
            currency: (args.currency as string) || "USD",
            operatingSystem: (args.operatingSystem as string) || null,
            createdById: userId,
          })
          .returning();
        return { ...inserted[0], providerName: provider.name };
      }

      case "update_server": {
        if (!args.id) return { error: "id is required" };
        const updateData: Record<string, unknown> = {};
        for (const field of ["name", "plan", "status", "location"]) {
          if (args[field] !== undefined) updateData[field] = args[field];
        }
        if (Object.keys(updateData).length === 0) return { error: "No fields to update" };
        updateData.updatedAt = new Date();
        const updated = await db.update(servers).set(updateData).where(eq(servers.id, args.id as string)).returning();
        if (!updated[0]) return { error: "Server not found" };
        return updated[0];
      }

      case "list_ip_addresses": {
        const conditions = [];
        if (args.providerId) conditions.push(eq(ipAddresses.providerId, args.providerId as string));
        if (args.serverId) conditions.push(eq(ipAddresses.serverId, args.serverId as string));
        if (args.status) conditions.push(eq(ipAddresses.status, args.status as any));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db.select().from(ipAddresses).where(where).orderBy(desc(ipAddresses.createdAt)).limit(limit);
      }

      case "add_ip_address": {
        if (!args.address || !args.providerId || !args.serverId) {
          return { error: "address, providerId, and serverId are required" };
        }
        const inserted = await db
          .insert(ipAddresses)
          .values({
            address: args.address as string,
            providerId: args.providerId as string,
            serverId: args.serverId as string,
            ipVersion: (args.ipVersion as any) || "ipv4",
          })
          .returning();
        const intelligence = args.enrich === false ? null : await enrichIpAddress(inserted[0].id).catch((err) => ({ error: err instanceof Error ? err.message : "IP enrichment failed" }));
        return { ...inserted[0], intelligence };
      }

      case "create_outreach": {
        if (!args.providerId) return { error: "providerId is required" };
        const inserted = await db
          .insert(outreachLogs)
          .values({
            providerId: args.providerId as string,
            channel: (args.channel as any) || "email",
            recipient: (args.recipient as string) || null,
            subject: (args.subject as string) || null,
            message: (args.message as string) || null,
            sentById: userId,
          })
          .returning();
        return inserted[0];
      }

      case "list_outreach": {
        const conditions = [];
        if (args.providerId) conditions.push(eq(outreachLogs.providerId, args.providerId as string));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db.select().from(outreachLogs).where(where).orderBy(desc(outreachLogs.date)).limit(limit);
      }

      case "create_task": {
        if (!args.title) return { error: "title is required" };
        const inserted = await db
          .insert(tasks)
          .values({
            title: args.title as string,
            description: (args.description as string) || null,
            priority: (args.priority as any) || "medium",
            dueDate: args.dueDate ? new Date(args.dueDate as string) : null,
            assignedUserId: (args.assignedUserId as string) || null,
            createdById: userId,
          })
          .returning();
        return inserted[0];
      }

      case "list_tasks": {
        const conditions = [];
        if (args.status) conditions.push(eq(tasks.status, args.status as any));
        if (args.priority) conditions.push(eq(tasks.priority, args.priority as any));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt)).limit(limit);
      }

      case "update_task": {
        if (!args.id) return { error: "id is required" };
        const updateData: Record<string, unknown> = {};
        for (const field of ["title", "description", "status", "priority"]) {
          if (args[field] !== undefined) updateData[field] = args[field];
        }
        if (args.dueDate !== undefined) updateData.dueDate = new Date(args.dueDate as string);
        if (Object.keys(updateData).length === 0) return { error: "No fields to update" };
        updateData.updatedAt = new Date();
        const updated = await db.update(tasks).set(updateData).where(eq(tasks.id, args.id as string)).returning();
        if (!updated[0]) return { error: "Task not found" };
        return updated[0];
      }

      case "get_dashboard_stats": {
        const [providerCount] = await db.select({ value: count() }).from(providers);
        const [serverCount] = await db.select({ value: count() }).from(servers);
        const [ipCount] = await db.select({ value: count() }).from(ipAddresses);
        const [taskCount] = await db.select({ value: count() }).from(tasks);

        const providersByDecision = await db
          .select({ decision: providers.decision, count: count() })
          .from(providers)
          .groupBy(providers.decision);

        const providersByContactStatus = await db
          .select({ contactStatus: providers.contactStatus, count: count() })
          .from(providers)
          .groupBy(providers.contactStatus);

        const serversByStatus = await db
          .select({ status: servers.status, count: count() })
          .from(servers)
          .groupBy(servers.status);

        const [sendingStats] = await db
          .select({
            totalPlanned: sql<number>`coalesce(sum(${sendingLogs.plannedSends}), 0)`,
            totalActual: sql<number>`coalesce(sum(${sendingLogs.actualSends}), 0)`,
            totalSuccessful: sql<number>`coalesce(sum(${sendingLogs.successfulSends}), 0)`,
            totalBounces: sql<number>`coalesce(sum(${sendingLogs.bounces}), 0)`,
          })
          .from(sendingLogs);

        return {
          totals: {
            providers: providerCount.value,
            servers: serverCount.value,
            ipAddresses: ipCount.value,
            tasks: taskCount.value,
          },
          providersByDecision,
          providersByContactStatus,
          serversByStatus,
          sendingStats,
        };
      }

      case "list_users": {
        const limit = Math.min(Number(args.limit) || 20, 100);
        return await db
          .select({ id: users.id, name: users.name, email: users.email, status: users.status })
          .from(users)
          .orderBy(asc(users.name))
          .limit(limit);
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const SYSTEM_PROMPT = `You are ServerOps AI, an intelligent assistant for managing a provider and server operations CRM. You help users understand the whole app state, including providers, servers, IP addresses, tasks, outreach, provider responses, and synced email conversations.

You can:
- Scan the entire CRM context, including cached inbox/sent email conversations
- Search, add, and update VPS/cloud/server providers
- Research public internet pages for provider website, contact emails, and pricing snippets when the user asks for correct public data
- Add servers under providers by provider ID or provider name
- Manage IP addresses and trigger automatic IP geo/blacklist enrichment
- Track outreach, provider responses, and tasks
- Create and manage tasks
- View dashboard statistics and analytics

If the user explicitly asks you to add, update, or create something, do it with the available tools. Ask a short clarification only when required information is missing and cannot be inferred safely. When provider public data is requested or useful, use web research before writing and mention that pricing should be verified because it changes. Be concise and format operational findings clearly.

Current date: ${new Date().toISOString().split("T")[0]}`;

interface ChatMessage {
  role: string;
  content: string;
}

interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export async function runAgent(
  messages: ChatMessage[],
  userId: string
): Promise<string> {
  const MAX_ITERATIONS = 10;

  const apiKey = await getSetting("openrouter_api_key");
  if (!apiKey) {
    return "AI Agent is not configured. Please set the OpenRouter API key in Settings → AI Agent.";
  }
  const model = (await getSetting("openrouter_model")) || "openai/gpt-4o-mini";

  const fullMessages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "CloudOps CRM",
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice?.message) {
      throw new Error("No response from AI model");
    }

    const assistantMessage = choice.message;

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      fullMessages.push({
        role: "assistant",
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        const result = await executeTool(toolCall.function.name, args, userId);

        fullMessages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    } else {
      return assistantMessage.content || "I wasn't able to generate a response.";
    }
  }

  return "I've reached the maximum number of processing steps. Please try a simpler request.";
}
