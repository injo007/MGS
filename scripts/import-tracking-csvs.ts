import { readFileSync } from "fs";
import { basename } from "path";
import Papa from "papaparse";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/cloudops_crm";

const DEFAULT_STATS_CSV = "/home/akmed/Downloads/Yahooooo - Yahoo_Send 2026.csv";
const DEFAULT_PROVIDERS_CSV = "/home/akmed/Downloads/Server Providers - Provider (1).csv";

type CsvRow = Record<string, string>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseCsv(path: string): CsvRow[] {
  const text = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length) {
    const message = parsed.errors.map((error) => error.message).join("; ");
    throw new Error(`Failed to parse ${basename(path)}: ${message}`);
  }
  return parsed.data;
}

function parseMatrixCsv(path: string) {
  const text = readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  if (parsed.errors.length) {
    const message = parsed.errors.map((error) => error.message).join("; ");
    throw new Error(`Failed to parse ${basename(path)}: ${message}`);
  }
  return parsed.data;
}

function nameFromWebsite(website: string) {
  const raw = clean(website);
  if (!raw) return "";
  try {
    const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/.]/)[0];
  }
}

function parseDate(value: string) {
  const raw = clean(value);
  if (!raw) return null;
  const parts = raw.split(/[/-]/).map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [a, b, y] = parts;
  const day = a > 12 ? a : b > 12 ? b : a;
  const month = a > 12 ? b : b > 12 ? a : b;
  return new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
}

function parseMoney(value: string) {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}

function providerContactStatus(status: string) {
  const normalized = clean(status).toLowerCase();
  if (normalized === "contacted") return "contacted";
  if (normalized === "to contact") return "ready_to_contact";
  return "not_contacted";
}

function providerDecision(reason: string, owned: string, production: string, dropStatus: string) {
  const text = `${reason} ${owned} ${production} ${dropStatus}`.toLowerCase();
  if (text.includes("prohibited")) return "prohibited_sending";
  if (text.includes("yes") || text.includes("true") || text.includes("good") || text.includes("email friendly")) return "accepted";
  return "pending";
}

function serverStatus(status: string) {
  const normalized = clean(status).toLowerCase();
  if (normalized === "new") return "pending";
  if (normalized === "paused") return "paused";
  if (normalized === "returned") return "cancelled";
  if (normalized === "to return") return "expired";
  return "active";
}

function providerAliasForServer(serverName: string) {
  const name = serverName.toUpperCase();
  if (name.startsWith("FLY")) return "CloudFly";
  if (name.startsWith("KAM")) return "kamatera";
  if (name.startsWith("ZNR")) return "zonercloud";
  if (name.startsWith("TRNS")) return "transip";
  if (name.startsWith("OVI")) return "OVH";
  if (name.startsWith("MJN")) return "mijn";
  if (name.startsWith("RIX")) return "rixhosting";
  if (name.startsWith("HNOW")) return "hostmenow";
  if (name.startsWith("RNK")) return "RamNode";
  if (name.startsWith("LIND")) return "Linode";
  if (name.startsWith("CLOUD_RAYA") || name.startsWith("RYA")) return "Cloud Raya";
  if (name.startsWith("READYIDC")) return "ReadyIDC";
  if (name.startsWith("INET")) return "Infomaniak";
  return "Unmapped Server Statistics";
}

function parseDailyValue(value: string) {
  const raw = clean(value);
  if (!raw) return null;
  const numeric = raw.replace(/,/g, "");
  if (/^\d+$/.test(numeric)) {
    const count = Number(numeric);
    return { actual: count, successful: count, bounces: 0, status: "normal", notes: null as string | null };
  }
  const slash = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) {
    const actual = Number(slash[1]);
    const bounces = Number(slash[2]);
    return { actual, successful: Math.max(0, actual - bounces), bounces, status: "watch", notes: raw };
  }
  const ts = raw.match(/TS0*4\s*\/\s*(\d+)/i);
  if (ts) {
    return { actual: 0, successful: 0, bounces: Number(ts[1]), status: "watch", notes: raw };
  }
  if (/paused/i.test(raw)) {
    return { actual: 0, successful: 0, bounces: 0, status: "paused", notes: raw };
  }
  return { actual: 0, successful: 0, bounces: 0, status: "watch", notes: raw };
}

async function ensureRolesAndUser(sql: postgres.Sql) {
  const [adminRole] = await sql`
    INSERT INTO roles (name, description, is_system)
    VALUES ('admin', 'Full system administrator', true)
    ON CONFLICT (name) DO UPDATE SET name = 'admin'
    RETURNING id
  `;
  const [researcherRole] = await sql`
    INSERT INTO roles (name, description, is_system)
    VALUES ('researcher', 'Provider and server tracking', true)
    ON CONFLICT (name) DO UPDATE SET name = 'researcher'
    RETURNING id
  `;
  const pass = await bcrypt.hash("marouane123", 12);
  const [user] = await sql`
    INSERT INTO users (name, email, hashed_password, role_id, status, email_verified)
    VALUES ('Marouane', 'marouane@cloudops.com', ${pass}, ${researcherRole.id || adminRole.id}, 'active', NOW())
    ON CONFLICT (email) DO UPDATE SET name = 'Marouane', status = 'active'
    RETURNING id
  `;
  return user.id as string;
}

async function upsertProvider(sql: postgres.Sql, input: {
  name: string;
  website?: string | null;
  type?: string | null;
  price?: string | null;
  production?: string | null;
  status?: string | null;
  ticketStatus?: string | null;
  date?: string | null;
  dropStatus?: string | null;
  reason?: string | null;
  comment?: string | null;
  owned?: string | null;
  ownedIps?: string | null;
  createdById: string;
}) {
  const existing = input.website
    ? await sql`SELECT id FROM providers WHERE website = ${input.website} OR lower(name) = lower(${input.name}) LIMIT 1`
    : await sql`SELECT id FROM providers WHERE lower(name) = lower(${input.name}) LIMIT 1`;
  const contactStatus = providerContactStatus(input.status || "");
  const decision = providerDecision(input.reason || "", input.owned || "", input.production || "", input.dropStatus || "");
  const responseStatus = input.ticketStatus?.toLowerCase() === "open" ? "needs_follow_up" : input.ticketStatus?.toLowerCase() === "close" ? "replied" : "not_sent";
  const mailAllowed = clean(input.reason).toLowerCase().includes("prohibited") ? false : clean(input.reason).toLowerCase().includes("email friendly") ? true : null;
  const noteParts = [
    input.comment && `Comment: ${input.comment}`,
    input.reason && `Reason: ${input.reason}`,
    input.dropStatus && `Drop Status: ${input.dropStatus}`,
    input.ownedIps && `Owned IPs: ${input.ownedIps}`,
  ].filter(Boolean);
  const contactDate = parseDate(input.date || "");

  if (existing[0]?.id) {
    await sql`
      UPDATE providers SET
        website = coalesce(${input.website || null}, website),
        category = ${input.type || null},
        contact_status = ${contactStatus}::contact_status,
        response_status = ${responseStatus}::response_status,
        decision = ${decision}::decision,
        mail_server_allowed = ${mailAllowed},
        sending_restrictions = ${input.reason || null},
        starting_price = ${parseMoney(input.price || "")},
        billing_method = 'monthly'::billing_method,
        last_contact_date = coalesce(${contactDate?.toISOString() || null}, last_contact_date),
        assigned_user_id = CASE WHEN ${input.owned || ""} = 'Yes' THEN ${input.createdById}::uuid ELSE assigned_user_id END,
        updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    return existing[0].id as string;
  }

  const [created] = await sql`
    INSERT INTO providers (
      name, website, category, contact_status, response_status, decision,
      mail_server_allowed, sending_restrictions, starting_price, billing_method,
      last_contact_date, created_by_id, assigned_user_id
    ) VALUES (
      ${input.name}, ${input.website || null}, ${input.type || null},
      ${contactStatus}::contact_status, ${responseStatus}::response_status, ${decision}::decision,
      ${mailAllowed}, ${input.reason || null}, ${parseMoney(input.price || "")}, 'monthly'::billing_method,
      ${contactDate?.toISOString() || null}, ${input.createdById},
      ${input.owned === "Yes" ? input.createdById : null}
    )
    RETURNING id
  `;

  if (noteParts.length) {
    await sql`
      INSERT INTO notes (entity_type, entity_id, content, author_id)
      VALUES ('provider', ${created.id}, ${noteParts.join("\n")}, ${input.createdById})
    `;
  }
  return created.id as string;
}

async function ensureServerProvider(sql: postgres.Sql, providerIds: Map<string, string>, name: string, createdById: string) {
  const key = name.toLowerCase();
  if (providerIds.has(key)) return providerIds.get(key)!;
  const id = await upsertProvider(sql, {
    name,
    website: null,
    type: "Server Statistics",
    createdById,
  });
  providerIds.set(key, id);
  return id;
}

async function main() {
  const providersPath = process.argv[2] || DEFAULT_PROVIDERS_CSV;
  const statsPath = process.argv[3] || DEFAULT_STATS_CSV;
  const sql = postgres(DATABASE_URL);

  try {
    const createdById = await ensureRolesAndUser(sql);
    const providerRows = parseCsv(providersPath);
    const providerIds = new Map<string, string>();

    let providerCount = 0;
    for (const row of providerRows) {
      const website = clean(row.Website);
      const name = clean(row.Name) || nameFromWebsite(website);
      if (!name && !website) continue;
      const id = await upsertProvider(sql, {
        name,
        website: website || null,
        ownedIps: clean(row["owned IPs"]),
        price: clean(row.price),
        production: clean(row.production),
        status: clean(row.Status),
        ticketStatus: clean(row["Ticket Status"]),
        date: clean(row.Date),
        dropStatus: clean(row["Drop Satus"]),
        type: clean(row.Type),
        reason: clean(row.Reason),
        comment: clean(row.Comment),
        owned: clean(row.Owned),
        createdById,
      });
      providerIds.set(name.toLowerCase(), id);
      providerCount++;
    }

    const matrix = parseMatrixCsv(statsPath);
    const headers = matrix[0] || [];
    const dateColumns = headers
      .map((header, index) => ({ header, index, date: parseDate(header) }))
      .filter((item): item is { header: string; index: number; date: Date } => Boolean(item.date));

    let serverCount = 0;
    let ipCount = 0;
    let statCount = 0;

    for (const row of matrix.slice(2)) {
      const owner = clean(row[0]);
      const serverName = clean(row[1]);
      const ip = clean(row[3]);
      if (!serverName || owner.toLowerCase() === "total send") continue;

      const providerName = providerAliasForServer(serverName);
      const providerId = await ensureServerProvider(sql, providerIds, providerName, createdById);
      const existingServer = await sql`SELECT id FROM servers WHERE name = ${serverName} LIMIT 1`;
      const status = serverStatus(clean(row[6]));
      const notes = [clean(row[4]) && `Domain: ${clean(row[4])}`, clean(row[5])].filter(Boolean).join("\n") || null;

      const serverId = existingServer[0]?.id
        ? existingServer[0].id
        : (await sql`
            INSERT INTO servers (name, provider_id, plan, location, status, notes, created_by_id)
            VALUES (${serverName}, ${providerId}, 'Tracked Server', ${clean(row[2]) || null}, ${status}::server_status, ${notes}, ${createdById})
            RETURNING id
          `)[0].id;

      if (existingServer[0]?.id) {
        await sql`
          UPDATE servers SET
            provider_id = ${providerId},
            location = ${clean(row[2]) || null},
            status = ${status}::server_status,
            notes = ${notes},
            updated_at = NOW()
          WHERE id = ${serverId}
        `;
      } else {
        serverCount++;
      }

      const existingAssignment = await sql`
        SELECT id FROM server_users
        WHERE server_id = ${serverId} AND user_id = ${createdById}
        LIMIT 1
      `;
      if (!existingAssignment[0]?.id) {
        await sql`
          INSERT INTO server_users (server_id, user_id)
          VALUES (${serverId}, ${createdById})
        `;
      }

      let ipAddressId: string | null = null;
      if (ip) {
        const existingIp = await sql`SELECT id FROM ip_addresses WHERE address = ${ip} LIMIT 1`;
        ipAddressId = existingIp[0]?.id || null;
        if (!ipAddressId) {
          const [createdIp] = await sql`
            INSERT INTO ip_addresses (address, provider_id, server_id, location, status)
            VALUES (${ip}, ${providerId}, ${serverId}, ${clean(row[2]) || null}, 'active'::ip_status)
            RETURNING id
          `;
          ipAddressId = createdIp.id;
          ipCount++;
        } else {
          await sql`
            UPDATE ip_addresses SET provider_id = ${providerId}, server_id = ${serverId}, location = ${clean(row[2]) || null}, status = 'active'::ip_status
            WHERE id = ${ipAddressId}
          `;
        }
      }

      if (!ipAddressId) continue;
      const firstDate = dateColumns[0]?.date.toISOString();
      const lastDate = dateColumns[dateColumns.length - 1]?.date.toISOString();
      if (firstDate && lastDate) {
        await sql`
          DELETE FROM sending_logs
          WHERE server_id = ${serverId}
          AND date >= ${firstDate}
          AND date <= ${lastDate}
        `;
      }

      for (const column of dateColumns) {
        const parsed = parseDailyValue(row[column.index] || "");
        if (!parsed) continue;
        await sql`
          INSERT INTO sending_logs (
            date, mailer_id, provider_id, server_id, ip_address_id,
            actual_sends, successful_sends, bounces, complaints, unsubscribes,
            delivery_notes, operational_status
          ) VALUES (
            ${column.date.toISOString()}, ${createdById}, ${providerId}, ${serverId}, ${ipAddressId},
            ${parsed.actual}, ${parsed.successful}, ${parsed.bounces}, 0, 0,
            ${parsed.notes}, ${parsed.status}::sending_status
          )
        `;
        statCount++;
      }
    }

    console.log("Tracking CSV import complete");
    console.log(`Providers processed: ${providerCount}`);
    console.log(`New servers created: ${serverCount}`);
    console.log(`New IPs created: ${ipCount}`);
    console.log(`Daily statistics imported: ${statCount}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
