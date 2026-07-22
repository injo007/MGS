import dns from "dns/promises";
import { db } from "@/db";
import { ipAddresses, servers, serverUsers, settings } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isMxToolboxApiKey } from "@/lib/mxtoolbox";
import { isBlacklistProvider, isHetrixToolsApiKey, type BlacklistProvider } from "@/lib/blacklist-providers";

export type IpGeo = {
  ip: string;
  success: boolean;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  org?: string;
  asn?: number;
  source: string;
  error?: string;
};

export type BlacklistFinding = {
  source: string;
  listed: boolean;
  name?: string;
  info?: string;
  url?: string;
  response?: string[];
  error?: string;
};

type BlacklistAccount = {
  id: string;
  label: string;
  apiKey: string;
  assignedUserId: string | null;
  enabled: boolean;
};

type BlacklistAssignee = string | string[] | null | undefined;

export type IpIntelligenceSnapshot = {
  ip: string;
  checkedAt: string;
  geo: IpGeo | null;
  blacklist: {
    provider: BlacklistProvider | "dnsbl";
    listed: boolean;
    listedCount: number;
    checkedCount: number;
    findings: BlacklistFinding[];
    error?: string;
  };
};

const DNSBL_ZONES = [
  "zen.spamhaus.org",
  "bl.spamcop.net",
  "b.barracudacentral.org",
  "dnsbl.sorbs.net",
  "psbl.surriel.com",
];

function parseSetting(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (parseSetting(row?.value) as T) ?? fallback;
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

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function isPublicIp(ip: string) {
  if (!ip || ip.includes(":")) return Boolean(ip);
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return !(
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function reverseIpv4(ip: string) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts.reverse().join(".");
}

function isSpamhausListingResponse(response: string) {
  const parts = response.split(".").map(Number);
  return parts.length === 4 && parts[0] === 127 && parts[1] === 0 && parts[2] === 0 && parts[3] >= 2 && parts[3] <= 11;
}

function dnsblFindingFromResponse(zone: string, response: string[]): BlacklistFinding {
  if (zone === "zen.spamhaus.org") {
    const listingResponses = response.filter(isSpamhausListingResponse);
    if (listingResponses.length > 0) {
      return { source: zone, listed: true, response };
    }

    return {
      source: zone,
      listed: false,
      response,
      error: "Spamhaus returned a query policy response, not a blacklist listing. Check MxToolbox/API quota or DNSBL access.",
    };
  }

  return { source: zone, listed: response.length > 0, response };
}

function locationFromGeo(geo: IpGeo | null) {
  if (!geo?.success) return null;
  return [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || geo.country || null;
}

export async function getIpIntelligenceCache(): Promise<Record<string, IpIntelligenceSnapshot>> {
  return getSetting<Record<string, IpIntelligenceSnapshot>>("ip_intelligence_cache", {});
}

export async function getIpIntelligence(ip: string) {
  const cache = await getIpIntelligenceCache();
  return cache[ip] || null;
}

async function saveIpIntelligence(snapshot: IpIntelligenceSnapshot) {
  const cache = await getIpIntelligenceCache();
  cache[snapshot.ip] = snapshot;
  await setSetting("ip_intelligence_cache", cache);
  await setSetting("last_ip_intelligence_check", {
    timestamp: new Date().toISOString(),
    checkedIp: snapshot.ip,
  });
}

export async function lookupIpGeo(ip: string): Promise<IpGeo | null> {
  if (!isPublicIp(ip)) {
    return { ip, success: false, source: "ipwho.is", error: "Private or invalid IP address" };
  }

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      return { ip, success: false, source: "ipwho.is", error: data.message || `HTTP ${res.status}` };
    }

    return {
      ip,
      success: true,
      country: data.country,
      countryCode: data.country_code,
      region: data.region,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      isp: data.connection?.isp,
      org: data.connection?.org,
      asn: data.connection?.asn,
      source: "ipwho.is",
    };
  } catch (err) {
    return { ip, success: false, source: "ipwho.is", error: err instanceof Error ? err.message : "Geo lookup failed" };
  }
}

async function readMxToolboxResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { Message: text };
  }
}

function asMxToolboxRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

function mxToolboxErrorMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (Array.isArray(data)) {
    const messages: string[] = data.map((item) => mxToolboxErrorMessage(item, status)).filter(Boolean);
    if (messages.length > 0) return messages.join("; ");
  }

  const record = asMxToolboxRecord(data);
  const detail = record.Message || record.message || record.Error || record.error || record.Description || record.description;
  return detail ? String(detail) : `MxToolbox HTTP ${status}`;
}

function formatMxToolboxUsage(data: unknown) {
  const record = asMxToolboxRecord(data);
  if (Object.keys(record).length === 0) return null;
  const dnsRequests = record.DnsRequests ?? record.dnsRequests;
  const dnsMax = record.DnsMax ?? record.dnsMax;
  const networkRequests = record.NetworkRequests ?? record.networkRequests;
  const networkMax = record.NetworkMax ?? record.networkMax;
  const parts = [
    dnsRequests != null || dnsMax != null ? `DNS ${dnsRequests ?? "?"}/${dnsMax ?? "?"}` : null,
    networkRequests != null || networkMax != null ? `Network ${networkRequests ?? "?"}/${networkMax ?? "?"}` : null,
  ].filter(Boolean);
  const quotaExplanation = Number(networkMax) === 0
    ? "Blacklist requires Network quota, but this account has none"
    : null;
  return parts.length > 0
    ? [`Usage: ${parts.join(", ")}`, quotaExplanation].filter(Boolean).join(" | ")
    : null;
}

async function getMxToolboxUsage(apiKey: string) {
  try {
    const res = await fetch("https://api.mxtoolbox.com/api/v1/Usage", {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
      cache: "no-store",
    });
    const data = await readMxToolboxResponse(res);
    if (!res.ok) return `Usage API unavailable: ${mxToolboxErrorMessage(data, res.status)}`;
    return formatMxToolboxUsage(data) || "Usage API returned no quota details";
  } catch (err) {
    return `Usage API unavailable: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

async function checkMxtoolboxBlacklist(ip: string, apiKey: string) {
  if (!isMxToolboxApiKey(apiKey)) {
    throw new Error("Invalid API key format. MxToolbox requires a UUID API key; account emails and passwords are not API keys.");
  }

  const res = await fetch(`https://mxtoolbox.com/api/v1/lookup/blacklist/${encodeURIComponent(ip)}`, {
    headers: {
      Accept: "application/json",
      Authorization: apiKey,
    },
    cache: "no-store",
  });
  const data = await readMxToolboxResponse(res);
  if (!res.ok) {
    const usage = await getMxToolboxUsage(apiKey);
    const detail = mxToolboxErrorMessage(data, res.status);
    throw new Error([detail, usage].filter(Boolean).join(" | "));
  }

  const response = asMxToolboxRecord(data);
  const failed = Array.isArray(response.Failed) ? response.Failed : [];
  const warnings = Array.isArray(response.Warnings) ? response.Warnings : [];
  const passed = Array.isArray(response.Passed) ? response.Passed : [];
  const listedFindings = failed.map((item: Record<string, unknown>) => ({
    source: "mxtoolbox",
    listed: true,
    name: String(item.Name || item.ID || "Blacklist"),
    info: item.Info ? String(item.Info) : undefined,
    url: item.Url ? String(item.Url) : undefined,
  }));
  const warningFindings = warnings.map((item: Record<string, unknown>) => ({
    source: "mxtoolbox",
    listed: false,
    name: String(item.Name || item.ID || "Blacklist"),
    info: item.Info ? String(item.Info) : undefined,
    url: item.Url ? String(item.Url) : undefined,
    error: String(item.Message || item.Error || item.Info || "MxToolbox returned a warning for this blacklist lookup."),
  }));
  const findings = [...listedFindings, ...warningFindings];

  return {
    provider: "mxtoolbox" as const,
    listed: listedFindings.length > 0,
    listedCount: listedFindings.length,
    checkedCount: findings.length + passed.length,
    findings,
  };
}

function asHetrixToolsRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

function hetrixToolsErrorMessage(data: unknown, status: number) {
  const record = asHetrixToolsRecord(data);
  const detail = record.error_message || record.message || record.error;
  return detail ? String(detail) : `HetrixTools HTTP ${status}`;
}

async function readJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error_message: text };
  }
}

async function checkHetrixToolsBlacklist(ip: string, apiKey: string) {
  if (!isHetrixToolsApiKey(apiKey)) {
    throw new Error("Invalid API token format. Use the token from HetrixTools Account Settings > API Keys.");
  }
  if (!reverseIpv4(ip)) {
    throw new Error("HetrixTools on-demand blacklist checks currently support IPv4 addresses only.");
  }

  const endpoint = `https://api.hetrixtools.com/v2/${encodeURIComponent(apiKey)}/blacklist-check/ipv4/${encodeURIComponent(ip)}/`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(65_000),
    });
    const data = await readJsonResponse(res);
    if (!res.ok) throw new Error(hetrixToolsErrorMessage(data, res.status));

    const response = asHetrixToolsRecord(data);
    const status = String(response.status || "").toUpperCase();
    const errorMessage = hetrixToolsErrorMessage(data, res.status);
    if (status === "ERROR" && errorMessage.toLowerCase().includes("in progress")) {
      if (attempt === 5) {
        throw new Error("HetrixTools blacklist check is still processing. Retry shortly to collect the cached result.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    if (status !== "SUCCESS") throw new Error(errorMessage);

    const listedOn = Array.isArray(response.blacklisted_on) ? response.blacklisted_on : [];
    const listedCount = Number(response.blacklisted_count ?? listedOn.length) || 0;
    const apiCallsLeft = response.api_calls_left;
    const checkCreditsLeft = response.blacklist_check_credits_left;
    const links = asHetrixToolsRecord(response.links);
    const quotaInfo = [
      apiCallsLeft != null ? `API calls left: ${apiCallsLeft}` : null,
      checkCreditsLeft != null ? `blacklist checks left: ${checkCreditsLeft}` : null,
    ].filter(Boolean).join(" | ");
    const findings: BlacklistFinding[] = listedOn.map((item) => {
      const finding = asHetrixToolsRecord(item);
      return {
        source: "hetrixtools",
        listed: true,
        name: String(finding.rbl || "Blacklist"),
        url: finding.delist ? String(finding.delist) : undefined,
      };
    });
    if (quotaInfo) {
      findings.push({
        source: "hetrixtools",
        listed: false,
        name: "HetrixTools",
        info: quotaInfo,
        url: links.report_link ? String(links.report_link) : undefined,
      });
    }

    return {
      provider: "hetrixtools" as const,
      listed: listedCount > 0,
      listedCount,
      checkedCount: Number(response.blacklists_checked ?? response.rbls_checked ?? listedOn.length) || 0,
      findings,
    };
  }

  throw new Error("HetrixTools blacklist check did not complete.");
}

async function getMxToolboxAccounts(): Promise<BlacklistAccount[]> {
  const savedAccounts = await getSetting<unknown>("mxtoolbox_accounts", []);
  const accounts = Array.isArray(savedAccounts)
    ? savedAccounts
        .map((account) => {
          const row = account as Record<string, unknown>;
          const apiKey = String(row.apiKey || row.key || "").trim();
          if (!apiKey) return null;
          return {
            id: String(row.id || apiKey.slice(-8) || crypto.randomUUID()),
            label: String(row.label || row.name || "MxToolbox Account"),
            apiKey,
            assignedUserId: row.assignedUserId ? String(row.assignedUserId) : null,
            enabled: row.enabled !== false,
          };
        })
        .filter((account): account is BlacklistAccount => Boolean(account))
    : [];

  const legacyKey = ((await getSetting<string | null>("mxtoolbox_api_key", null)) || process.env.MXTOOLBOX_API_KEY || "").trim();
  if (legacyKey && !accounts.some((account) => account.apiKey === legacyKey)) {
    accounts.push({
      id: "legacy-env",
      label: "Legacy MxToolbox Key",
      apiKey: legacyKey,
      assignedUserId: null,
      enabled: true,
    });
  }

  return accounts.filter((account) => account.enabled);
}

async function getHetrixToolsAccounts(): Promise<BlacklistAccount[]> {
  const savedAccounts = await getSetting<unknown>("hetrixtools_accounts", []);
  if (!Array.isArray(savedAccounts)) return [];

  return savedAccounts
    .map((account) => {
      const row = account as Record<string, unknown>;
      const apiKey = String(row.apiKey || row.key || "").trim();
      if (!apiKey) return null;
      return {
        id: String(row.id || apiKey.slice(-8) || crypto.randomUUID()),
        label: String(row.label || row.name || "HetrixTools Account"),
        apiKey,
        assignedUserId: row.assignedUserId ? String(row.assignedUserId) : null,
        enabled: row.enabled !== false,
      };
    })
    .filter((account): account is BlacklistAccount => Boolean(account))
    .filter((account) => account.enabled);
}

function normalizeBlacklistAssignees(assignedUserId: BlacklistAssignee) {
  if (Array.isArray(assignedUserId)) {
    return Array.from(new Set(assignedUserId.map((id) => String(id).trim()).filter(Boolean)));
  }
  const normalized = assignedUserId ? String(assignedUserId).trim() : "";
  return normalized ? [normalized] : [];
}

async function checkMxtoolboxWithAccountPool(ip: string, assignedUserId?: BlacklistAssignee) {
  if (assignedUserId === null) return null;

  const allAccounts = await getMxToolboxAccounts();
  const assigneeIds = normalizeBlacklistAssignees(assignedUserId);
  const accounts = assigneeIds.length > 0
    ? allAccounts.filter((account) => account.assignedUserId && assigneeIds.includes(account.assignedUserId))
    : allAccounts;

  if (accounts.length === 0) return null;

  const rotationKey = assigneeIds.length > 0
    ? `mxtoolbox_account_rotation_index_${assigneeIds.sort().join("_")}`
    : "mxtoolbox_account_rotation_index";
  const startIndex = await getSetting<number>(rotationKey, 0);
  const errors: string[] = [];

  for (let offset = 0; offset < accounts.length; offset++) {
    const index = (startIndex + offset) % accounts.length;
    const account = accounts[index];
    try {
      const result = await checkMxtoolboxBlacklist(ip, account.apiKey);
      await setSetting(rotationKey, (index + 1) % accounts.length);
      return {
        ...result,
        findings: result.findings.map((finding) => ({
          ...finding,
          info: [finding.info, `MxToolbox account: ${account.label}`].filter(Boolean).join(" | "),
        })),
      };
    } catch (err) {
      errors.push(`${account.label}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const fallback = await checkDnsblBlacklist(ip);
  return {
    ...fallback,
    error: `${assigneeIds.length > 0 ? "Assigned MxToolbox account failed" : "All MxToolbox accounts failed"}, used DNSBL fallback: ${errors.join("; ")}`,
  };
}

async function checkHetrixToolsWithAccountPool(ip: string, assignedUserId?: BlacklistAssignee) {
  if (assignedUserId === null) return null;

  const allAccounts = await getHetrixToolsAccounts();
  const assigneeIds = normalizeBlacklistAssignees(assignedUserId);
  const accounts = assigneeIds.length > 0
    ? allAccounts.filter((account) => account.assignedUserId && assigneeIds.includes(account.assignedUserId))
    : allAccounts;

  if (accounts.length === 0) return null;

  const rotationKey = assigneeIds.length > 0
    ? `hetrixtools_account_rotation_index_${assigneeIds.sort().join("_")}`
    : "hetrixtools_account_rotation_index";
  const startIndex = await getSetting<number>(rotationKey, 0);
  const errors: string[] = [];

  for (let offset = 0; offset < accounts.length; offset++) {
    const index = (startIndex + offset) % accounts.length;
    const account = accounts[index];
    try {
      const result = await checkHetrixToolsBlacklist(ip, account.apiKey);
      await setSetting(rotationKey, (index + 1) % accounts.length);
      return {
        ...result,
        findings: result.findings.map((finding) => ({
          ...finding,
          info: [finding.info, `HetrixTools account: ${account.label}`].filter(Boolean).join(" | "),
        })),
      };
    } catch (err) {
      errors.push(`${account.label}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  const fallback = await checkDnsblBlacklist(ip);
  return {
    ...fallback,
    error: `${assigneeIds.length > 0 ? "Assigned HetrixTools account failed" : "All HetrixTools accounts failed"}, used DNSBL fallback: ${errors.join("; ")}`,
  };
}

async function checkDnsblBlacklist(ip: string) {
  const reversed = reverseIpv4(ip);
  if (!reversed) {
    return {
      provider: "dnsbl" as const,
      listed: false,
      listedCount: 0,
      checkedCount: 0,
      findings: [{ source: "dnsbl", listed: false, error: "DNSBL fallback currently supports IPv4 only." }],
    };
  }

  const findings: BlacklistFinding[] = [];
  for (const zone of DNSBL_ZONES) {
    try {
      const response = await dns.resolve4(`${reversed}.${zone}`);
      findings.push(dnsblFindingFromResponse(zone, response));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      findings.push({
        source: zone,
        listed: false,
        error: code && ["ENOTFOUND", "ENODATA"].includes(code) ? undefined : code || "lookup_failed",
      });
    }
  }

  const listedCount = findings.filter((finding) => finding.listed).length;
  return {
    provider: "dnsbl" as const,
    listed: listedCount > 0,
    listedCount,
    checkedCount: DNSBL_ZONES.length,
    findings,
  };
}

export async function getDefaultBlacklistProvider(): Promise<BlacklistProvider> {
  const configured = await getSetting<unknown>("blacklist_provider", "hetrixtools");
  return isBlacklistProvider(configured) ? configured : "hetrixtools";
}

export async function checkIpBlacklist(ip: string, assignedUserId?: BlacklistAssignee, requestedProvider?: BlacklistProvider) {
  const provider = requestedProvider || await getDefaultBlacklistProvider();
  const pooledResult = provider === "hetrixtools"
    ? await checkHetrixToolsWithAccountPool(ip, assignedUserId)
    : await checkMxtoolboxWithAccountPool(ip, assignedUserId);
  if (pooledResult) return pooledResult;

  const fallback = await checkDnsblBlacklist(ip);
  const providerLabel = provider === "hetrixtools" ? "HetrixTools" : "MxToolbox";
  if (assignedUserId === null) {
    return {
      ...fallback,
      error: `This server has no assigned user with an enabled ${providerLabel} account, used DNSBL fallback.`,
    };
  }
  if (normalizeBlacklistAssignees(assignedUserId).length > 0) {
    return {
      ...fallback,
      error: `No enabled ${providerLabel} account is assigned to any user on this server, used DNSBL fallback.`,
    };
  }
  return fallback;
}

export async function enrichIpAddress(
  ipId: string,
  force = false,
  assignedUserId?: BlacklistAssignee,
  provider?: BlacklistProvider,
): Promise<IpIntelligenceSnapshot | null> {
  const [row] = await db.select().from(ipAddresses).where(eq(ipAddresses.id, ipId)).limit(1);
  if (!row) return null;

  const cache = await getIpIntelligenceCache();
  const existing = cache[row.address];
  if (!force && existing?.checkedAt?.startsWith(todayKey())) return existing;

  const geo = await lookupIpGeo(row.address);
  const blacklist = await checkIpBlacklist(row.address, assignedUserId, provider);
  const snapshot: IpIntelligenceSnapshot = {
    ip: row.address,
    checkedAt: new Date().toISOString(),
    geo,
    blacklist,
  };

  await saveIpIntelligence(snapshot);

  const nextLocation = locationFromGeo(geo);
  if (nextLocation && nextLocation !== row.location) {
    await db
      .update(ipAddresses)
      .set({ location: nextLocation, updatedAt: new Date() })
      .where(eq(ipAddresses.id, ipId));
  }

  if (nextLocation && row.serverId) {
    const [server] = await db
      .select({ location: servers.location })
      .from(servers)
      .where(eq(servers.id, row.serverId))
      .limit(1);
    if (server && !server.location) {
      await db
        .update(servers)
        .set({ location: nextLocation, updatedAt: new Date() })
        .where(eq(servers.id, row.serverId));
    }
  }

  return snapshot;
}

export async function runDailyIpIntelligence(force = false, requestedProvider?: BlacklistProvider) {
  const provider = requestedProvider || await getDefaultBlacklistProvider();
  const allIps = await db
    .select({ id: ipAddresses.id, address: ipAddresses.address, serverId: ipAddresses.serverId })
    .from(ipAddresses);
  const serverIds = Array.from(new Set(allIps.map((ip) => ip.serverId)));
  const assignmentRows = serverIds.length > 0
    ? await db
        .select({ serverId: serverUsers.serverId, userId: serverUsers.userId })
        .from(serverUsers)
        .where(inArray(serverUsers.serverId, serverIds))
        .orderBy(serverUsers.createdAt)
    : [];
  const assignedUsersByServer = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const current = assignedUsersByServer.get(assignment.serverId) || [];
    assignedUsersByServer.set(assignment.serverId, [...current, assignment.userId]);
  }

  const results: IpIntelligenceSnapshot[] = [];
  const errors: Array<{ ip: string; error: string }> = [];

  for (const ip of allIps) {
    try {
      const snapshot = await enrichIpAddress(ip.id, force, assignedUsersByServer.get(ip.serverId) || null, provider);
      if (snapshot) results.push(snapshot);
    } catch (err) {
      errors.push({ ip: ip.address, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const blacklistWarnings = results.flatMap((result) => {
    const warnings: Array<{ ip: string; source: string; message: string }> = [];
    if (result.blacklist.error) {
      warnings.push({ ip: result.ip, source: result.blacklist.provider, message: result.blacklist.error });
    }
    for (const finding of result.blacklist.findings) {
      if (finding.error) {
        warnings.push({ ip: result.ip, source: finding.source, message: finding.error });
      }
    }
    return warnings;
  });

  await setSetting("last_ip_intelligence_daily_run", {
    timestamp: new Date().toISOString(),
    checked: allIps.length,
    listed: results.filter((result) => result.blacklist.listed).length,
    errors,
    blacklistWarnings,
  });

  return {
    checked: allIps.length,
    listed: results.filter((result) => result.blacklist.listed).length,
    results,
    errors,
    blacklistWarnings,
  };
}

export async function runIpIntelligenceForServers(
  serverIds: string[],
  force = true,
  userId?: string | null,
  fallbackUserId?: string | null,
  requestedProvider?: BlacklistProvider,
) {
  const provider = requestedProvider || await getDefaultBlacklistProvider();
  const uniqueServerIds = Array.from(new Set(serverIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueServerIds.length === 0) {
    return {
      checked: 0,
      listed: 0,
      results: [] as IpIntelligenceSnapshot[],
      errors: [] as Array<{ ip: string; error: string }>,
      blacklistWarnings: [] as Array<{ ip: string; source: string; message: string }>,
    };
  }

  const conditions = [inArray(ipAddresses.serverId, uniqueServerIds)];
  if (userId) {
    conditions.push(sql`exists (select 1 from ${serverUsers} where ${serverUsers.serverId} = ${ipAddresses.serverId} and ${serverUsers.userId} = ${userId})`);
  }

  const targetIps = await db
    .select({ id: ipAddresses.id, address: ipAddresses.address, serverId: ipAddresses.serverId })
    .from(ipAddresses)
    .where(and(...conditions));
  const assignmentRows = userId
    ? []
    : await db
        .select({ serverId: serverUsers.serverId, userId: serverUsers.userId })
        .from(serverUsers)
        .where(inArray(serverUsers.serverId, uniqueServerIds))
        .orderBy(serverUsers.createdAt);
  const assignedUsersByServer = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const current = assignedUsersByServer.get(assignment.serverId) || [];
    assignedUsersByServer.set(assignment.serverId, [...current, assignment.userId]);
  }

  const results: IpIntelligenceSnapshot[] = [];
  const errors: Array<{ ip: string; error: string }> = [];

  for (const ip of targetIps) {
    try {
      const serverUserIds = assignedUsersByServer.get(ip.serverId) || [];
      const candidateUserIds = Array.from(new Set([
        ...serverUserIds,
        ...(fallbackUserId ? [fallbackUserId] : []),
      ]));
      const accountUserId = userId || (candidateUserIds.length > 0 ? candidateUserIds : null);
      const snapshot = await enrichIpAddress(ip.id, force, accountUserId, provider);
      if (snapshot) results.push(snapshot);
    } catch (err) {
      errors.push({ ip: ip.address, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const blacklistWarnings = results.flatMap((result) => {
    const warnings: Array<{ ip: string; source: string; message: string }> = [];
    if (result.blacklist.error) {
      warnings.push({ ip: result.ip, source: result.blacklist.provider, message: result.blacklist.error });
    }
    for (const finding of result.blacklist.findings) {
      if (finding.error) {
        warnings.push({ ip: result.ip, source: finding.source, message: finding.error });
      }
    }
    return warnings;
  });

  return {
    checked: targetIps.length,
    listed: results.filter((result) => result.blacklist.listed).length,
    results,
    errors,
    blacklistWarnings,
  };
}

export async function runIpRegionDetection(force = false) {
  const allIps = await db
    .select({
      id: ipAddresses.id,
      address: ipAddresses.address,
      location: ipAddresses.location,
      serverId: ipAddresses.serverId,
    })
    .from(ipAddresses);

  const results: IpIntelligenceSnapshot[] = [];
  const errors: Array<{ ip: string; error: string }> = [];

  for (const row of allIps) {
    try {
      const cache = await getIpIntelligenceCache();
      const existing = cache[row.address];
      if (!force && existing?.geo?.success && existing.checkedAt?.startsWith(todayKey())) {
        results.push(existing);
        continue;
      }

      const geo = await lookupIpGeo(row.address);
      const snapshot: IpIntelligenceSnapshot = {
        ip: row.address,
        checkedAt: new Date().toISOString(),
        geo,
        blacklist: existing?.blacklist ?? {
          provider: "dnsbl",
          listed: false,
          listedCount: 0,
          checkedCount: 0,
          findings: [],
        },
      };
      await saveIpIntelligence(snapshot);
      results.push(snapshot);

      const nextLocation = locationFromGeo(geo);
      if (nextLocation && nextLocation !== row.location) {
        await db
          .update(ipAddresses)
          .set({ location: nextLocation, updatedAt: new Date() })
          .where(eq(ipAddresses.id, row.id));
      }

      if (nextLocation && row.serverId) {
        const [server] = await db
          .select({ location: servers.location })
          .from(servers)
          .where(eq(servers.id, row.serverId))
          .limit(1);
        if (server && !server.location) {
          await db
            .update(servers)
            .set({ location: nextLocation, updatedAt: new Date() })
            .where(eq(servers.id, row.serverId));
        }
      }
    } catch (err) {
      errors.push({ ip: row.address, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  await setSetting("last_ip_region_detection_run", {
    timestamp: new Date().toISOString(),
    checked: allIps.length,
    detected: results.filter((result) => result.geo?.success).length,
    errors,
  });

  return {
    checked: allIps.length,
    detected: results.filter((result) => result.geo?.success).length,
    results,
    errors,
  };
}
