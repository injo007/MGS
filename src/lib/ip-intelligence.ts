import dns from "dns/promises";
import { db } from "@/db";
import { ipAddresses, servers, settings } from "@/db/schema";
import { eq } from "drizzle-orm";

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

type MxToolboxAccount = {
  id: string;
  label: string;
  apiKey: string;
  assignedUserId: string | null;
  enabled: boolean;
};

export type IpIntelligenceSnapshot = {
  ip: string;
  checkedAt: string;
  geo: IpGeo | null;
  blacklist: {
    provider: "mxtoolbox" | "dnsbl";
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

async function checkMxtoolboxBlacklist(ip: string, apiKey: string) {
  const res = await fetch(`https://mxtoolbox.com/api/v1/lookup/blacklist/${encodeURIComponent(ip)}`, {
    headers: {
      Accept: "application/json",
      Authorization: apiKey,
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.Message || data?.Error || `MxToolbox HTTP ${res.status}`);

  const failed = Array.isArray(data.Failed) ? data.Failed : [];
  const warnings = Array.isArray(data.Warnings) ? data.Warnings : [];
  const passed = Array.isArray(data.Passed) ? data.Passed : [];
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

async function getMxToolboxAccounts(): Promise<MxToolboxAccount[]> {
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
        .filter((account): account is MxToolboxAccount => Boolean(account))
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

async function checkMxtoolboxWithAccountPool(ip: string) {
  const accounts = await getMxToolboxAccounts();
  if (accounts.length === 0) return null;

  const startIndex = await getSetting<number>("mxtoolbox_account_rotation_index", 0);
  const errors: string[] = [];

  for (let offset = 0; offset < accounts.length; offset++) {
    const index = (startIndex + offset) % accounts.length;
    const account = accounts[index];
    try {
      const result = await checkMxtoolboxBlacklist(ip, account.apiKey);
      await setSetting("mxtoolbox_account_rotation_index", (index + 1) % accounts.length);
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
    error: `All MxToolbox accounts failed, used DNSBL fallback: ${errors.join("; ")}`,
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

export async function checkIpBlacklist(ip: string) {
  const pooledResult = await checkMxtoolboxWithAccountPool(ip);
  if (pooledResult) return pooledResult;

  return checkDnsblBlacklist(ip);
}

export async function enrichIpAddress(ipId: string, force = false): Promise<IpIntelligenceSnapshot | null> {
  const [row] = await db.select().from(ipAddresses).where(eq(ipAddresses.id, ipId)).limit(1);
  if (!row) return null;

  const cache = await getIpIntelligenceCache();
  const existing = cache[row.address];
  if (!force && existing?.checkedAt?.startsWith(todayKey())) return existing;

  const geo = await lookupIpGeo(row.address);
  const blacklist = await checkIpBlacklist(row.address);
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

export async function runDailyIpIntelligence(force = false) {
  const allIps = await db
    .select({ id: ipAddresses.id, address: ipAddresses.address })
    .from(ipAddresses);

  const results: IpIntelligenceSnapshot[] = [];
  const errors: Array<{ ip: string; error: string }> = [];

  for (const ip of allIps) {
    try {
      const snapshot = await enrichIpAddress(ip.id, force);
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
