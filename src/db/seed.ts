import postgres from "postgres";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/cloudops_crm";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@cloudops.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SEED_DEMO_TRACKING_DATA = ["1", "true", "yes"].includes(
  String(process.env.SEED_DEMO_TRACKING_DATA || "").toLowerCase()
);

// Status mapping from CRM data to DB enum values
const CONTACT_STATUS_MAP: Record<string, string> = {
  "Not Contacted": "not_contacted",
  "Ready to Contact": "ready_to_contact",
  "Contacted": "contacted",
  "Follow-up Due": "follow_up_due",
  "Closed": "closed",
};

const RESPONSE_STATUS_MAP: Record<string, string> = {
  "Not Sent": "not_sent",
  "No Response Yet": "no_response",
  "No Response": "no_response",
  "Replied": "replied",
  "Needs Follow-up": "needs_follow_up",
};

const DECISION_MAP: Record<string, string> = {
  "Pending": "pending",
  "Accepted": "accepted",
  "Denied": "denied",
  "Prohibited Sending - Close": "prohibited_sending",
  "Not Suitable": "not_suitable",
};

const PORT25_MAP: Record<string, string> = {
  "Unknown": "unknown",
  "Open": "available",
  "Available": "available",
  "Blocked by Default": "blocked",
  "Permanently Blocked": "blocked",
  "Can Be Opened on Request": "available",
};

const PTR_MAP: Record<string, string> = {
  "Unknown": "unknown",
  "Available": "configured",
  "Not Available": "not_configured",
  "Available on Request": "configured",
};

const CHANNEL_MAP: Record<string, string> = {
  "Email": "email",
  "Support Ticket": "support_ticket",
  "Contact Form": "contact_form",
  "Live Chat": "live_chat",
  "Phone": "phone",
  "Other": "other",
};

const SEND_RESULT_MAP: Record<string, string> = {
  "Drafted": "drafted",
  "Sent": "sent",
  "Delivered": "delivered",
  "Failed": "failed",
  "Bounced": "bounced",
  "Replied": "replied",
};

interface ProviderJson {
  provider_name: string;
  website?: string;
  support_email?: string;
  sales_email?: string;
  country?: string;
  region?: string;
  contact_status?: string;
  response_status?: string;
  final_decision?: string;
  port_25_status?: string;
  ptr_rdns_availability?: string;
  owner?: string;
  comments?: string;
  daily_limit?: string | number;
  starting_price?: string | number;
  currency?: string;
  billing_method?: string;
  next_follow_up_date?: string;
}

interface OutreachJson {
  provider_name: string;
  date?: string | null;
  contact_channel?: string;
  recipient?: string;
  subject?: string;
  sent_by?: string;
  send_result?: string;
  next_action?: string;
  follow_up_date?: string;
}

interface ServerJson {
  provider_name: string;
  name?: string;
  plan?: string;
  location?: string;
  operating_system?: string;
  status?: string;
  monthly_cost?: string | number;
  hourly_cost?: string | number;
  currency?: string;
  billing_method?: string;
  notes?: string;
}

interface IpAddressJson {
  provider_name?: string;
  server_name?: string;
  address?: string;
  ip_version?: string;
  location?: string;
  status?: string;
  ptr_configured?: boolean | string;
  ptr_hostname?: string;
  port25_status?: string;
  notes?: string;
}

interface TaskJson {
  title?: string;
  description?: string;
  provider_name?: string;
  priority?: string;
  status?: string;
  due_date?: string;
  assigned_to?: string;
  related_entity_type?: string;
}

interface DailySendingJson {
  provider_name?: string;
  server_name?: string;
  ip_address?: string;
  date?: string;
  planned_sends?: string | number;
  actual_sends?: string | number;
  successful_sends?: string | number;
  bounces?: string | number;
  complaints?: string | number;
  unsubscribes?: string | number;
  delivery_notes?: string;
  operational_status?: string;
}

interface ProviderResponseJson {
  provider_name?: string;
  response_date?: string;
  response_type?: string;
  full_response?: string;
  summary?: string;
  decision_recommendation?: string;
}

function jsonVal(v: any): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

async function seed() {
  console.log("🌱 Seeding database with real CRM data...\n");
  const client = postgres(DATABASE_URL);

  try {
    // ── Roles ──────────────────────────────────────────────────
    console.log("  Creating roles...");
    const adminRole = await client`
      INSERT INTO roles (name, description, is_system) 
      VALUES ('admin', 'Full system administrator', true)
      ON CONFLICT (name) DO UPDATE SET name = 'admin'
      RETURNING id
    `;
    const mailerRole = await client`
      INSERT INTO roles (name, description, is_system) 
      VALUES ('mailer', 'Email sending operations', true)
      ON CONFLICT (name) DO UPDATE SET name = 'mailer'
      RETURNING id
    `;
    const researcherRole = await client`
      INSERT INTO roles (name, description, is_system) 
      VALUES ('researcher', 'Provider research and outreach', true)
      ON CONFLICT (name) DO UPDATE SET name = 'researcher'
      RETURNING id
    `;
    const adminRoleId = adminRole[0].id;
    const mailerRoleId = mailerRole[0].id;
    const researcherRoleId = researcherRole[0].id;

    // ── Permissions ────────────────────────────────────────────
    console.log("  Creating permissions...");
    const allPermissions = [
      "providers.view", "providers.create", "providers.edit", "providers.delete", "providers.assign",
      "servers.view", "servers.create", "servers.edit", "servers.delete",
      "ip_addresses.view", "ip_addresses.create", "ip_addresses.edit", "ip_addresses.delete",
      "outreach.view", "outreach.create", "outreach.edit",
      "responses.view", "responses.create",
      "sending.view", "sending.create", "sending.edit",
      "tasks.view", "tasks.create", "tasks.edit",
      "users.view", "users.create", "users.edit", "users.disable",
      "reports.view", "imports.create", "exports.create",
      "audit.view", "settings.manage",
    ];

    for (const perm of allPermissions) {
      const [group] = perm.split(".");
      await client`
        INSERT INTO permissions (name, description, "group")
        VALUES (${perm}, ${perm}, ${group})
        ON CONFLICT (name) DO NOTHING
      `;
    }

    // Admin gets everything
    const adminPerms = await client`SELECT id FROM permissions`;
    for (const perm of adminPerms) {
      await client`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${adminRoleId}, ${perm.id})
        ON CONFLICT DO NOTHING
      `;
    }

    // Mailer gets limited
    const mailerPermNames = [
      "providers.view", "servers.view", "ip_addresses.view",
      "outreach.view", "outreach.create", "outreach.edit",
      "responses.view", "sending.view", "sending.create", "sending.edit",
      "tasks.view", "tasks.create", "tasks.edit", "exports.create",
    ];
    for (const permName of mailerPermNames) {
      const perm = await client`SELECT id FROM permissions WHERE name = ${permName}`;
      if (perm[0]) {
        await client`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${mailerRoleId}, ${perm[0].id})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // Researcher gets research-level access
    const researcherPermNames = [
      "providers.view", "providers.create", "providers.edit",
      "outreach.view", "outreach.create", "outreach.edit",
      "responses.view", "responses.create",
      "tasks.view", "tasks.create", "tasks.edit", "exports.create",
    ];
    for (const permName of researcherPermNames) {
      const perm = await client`SELECT id FROM permissions WHERE name = ${permName}`;
      if (perm[0]) {
        await client`
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (${researcherRoleId}, ${perm[0].id})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // ── Users ──────────────────────────────────────────────────
    console.log("  Creating users...");
    const adminPass = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await client`
      INSERT INTO users (name, email, hashed_password, role_id, status, email_verified)
      VALUES ('Admin User', ${ADMIN_EMAIL}, ${adminPass}, ${adminRoleId}, 'active', NOW())
      ON CONFLICT (email) DO NOTHING
    `;

    const marouanePass = await bcrypt.hash("marouane123", 12);
    const marouaneResult = await client`
      INSERT INTO users (name, email, hashed_password, role_id, status, email_verified)
      VALUES ('Marouane', 'marouane@cloudops.com', ${marouanePass}, ${researcherRoleId}, 'active', NOW())
      ON CONFLICT (email) DO UPDATE SET name = 'Marouane'
      RETURNING id
    `;
    const marouaneId = marouaneResult[0]?.id;

    const mailerPass = await bcrypt.hash("mailer123", 12);
    await client`
      INSERT INTO users (name, email, hashed_password, role_id, status, email_verified)
      VALUES ('John Davidson', 'john@cloudops.com', ${mailerPass}, ${mailerRoleId}, 'active', NOW())
      ON CONFLICT (email) DO NOTHING
    `;

    // ── Status Options ─────────────────────────────────────────
    console.log("  Creating status options...");
    const statusGroups = [
      { group: "contact_status", value: "not_contacted", label: "Not Contacted", color: "#94a3b8", sort: 0 },
      { group: "contact_status", value: "ready_to_contact", label: "Ready to Contact", color: "#60a5fa", sort: 1 },
      { group: "contact_status", value: "contacted", label: "Contacted", color: "#818cf8", sort: 2 },
      { group: "contact_status", value: "follow_up_due", label: "Follow-up Due", color: "#fb923c", sort: 3 },
      { group: "contact_status", value: "closed", label: "Closed", color: "#9ca3af", sort: 4 },
      { group: "response_status", value: "not_sent", label: "Not Sent", color: "#94a3b8", sort: 0 },
      { group: "response_status", value: "no_response", label: "No Response", color: "#fbbf24", sort: 1 },
      { group: "response_status", value: "replied", label: "Replied", color: "#34d399", sort: 2 },
      { group: "response_status", value: "needs_follow_up", label: "Needs Follow-up", color: "#fb923c", sort: 3 },
      { group: "decision", value: "pending", label: "Pending", color: "#fbbf24", sort: 0 },
      { group: "decision", value: "accepted", label: "Accepted", color: "#34d399", sort: 1 },
      { group: "decision", value: "denied", label: "Denied", color: "#f87171", sort: 2 },
      { group: "decision", value: "prohibited_sending", label: "Prohibited Sending", color: "#e11d48", sort: 3 },
      { group: "decision", value: "not_suitable", label: "Not Suitable", color: "#9ca3af", sort: 4 },
    ];
    for (const s of statusGroups) {
      await client`
        INSERT INTO status_options ("group", value, label, color, sort_order)
        VALUES (${s.group}, ${s.value}, ${s.label}, ${s.color}, ${s.sort})
        ON CONFLICT ("group", value) DO UPDATE SET label = ${s.label}
      `;
    }

    // ── Settings ───────────────────────────────────────────────
    console.log("  Creating settings...");
    const defaultSettings = [
      { key: "company_name", value: JSON.stringify("CloudOps CRM") },
      { key: "default_currency", value: JSON.stringify("USD") },
      { key: "timezone", value: JSON.stringify("UTC") },
      { key: "date_format", value: JSON.stringify("MM/DD/YYYY") },
      { key: "bounce_rate_warning", value: JSON.stringify(5) },
      { key: "bounce_rate_critical", value: JSON.stringify(10) },
      { key: "complaint_rate_warning", value: JSON.stringify(0.1) },
      { key: "complaint_rate_critical", value: JSON.stringify(0.5) },
      { key: "blacklist_provider", value: JSON.stringify("hetrixtools") },
      { key: "hetrixtools_accounts", value: JSON.stringify([]) },
      { key: "mxtoolbox_accounts", value: JSON.stringify([]) },
    ];
    for (const setting of defaultSettings) {
      await client`
        INSERT INTO settings (key, value)
        VALUES (${setting.key}, ${setting.value}::jsonb)
        ON CONFLICT (key) DO NOTHING
      `;
    }

    // ── Providers (real data from CRM) ─────────────────────────
    console.log("  Importing providers from CRM data...");
    const providersPath = join(process.cwd(), "data", "providers.json");
    const providersData: ProviderJson[] = JSON.parse(readFileSync(providersPath, "utf-8"));

    const providerNameToId = new Map<string, string>();

    for (const p of providersData) {
      const contactStatus = CONTACT_STATUS_MAP[p.contact_status || ""] || "not_contacted";
      const responseStatus = RESPONSE_STATUS_MAP[p.response_status || ""] || "not_sent";
      const decision = DECISION_MAP[p.final_decision || ""] || "pending";
      const port25 = PORT25_MAP[p.port_25_status || ""] || "unknown";
      const ptr = PTR_MAP[p.ptr_rdns_availability || ""] || "unknown";

      const result = await client`
        INSERT INTO providers (
          name, website, support_email, country,
          contact_status, response_status, decision,
          port25_status, ptr_status,
          created_by_id, assigned_user_id
        ) VALUES (
          ${p.provider_name},
          ${jsonVal(p.website)},
          ${jsonVal(p.support_email)},
          ${null},
          ${contactStatus}::contact_status,
          ${responseStatus}::response_status,
          ${decision}::decision,
          ${port25}::port25_status,
          ${ptr}::ptr_status,
          ${marouaneId || adminRoleId},
          ${marouaneId}
        )
        ON CONFLICT (website) DO UPDATE SET name = ${p.provider_name}
        RETURNING id
      `;

      const providerId = result[0].id;
      providerNameToId.set(p.provider_name, providerId);

      // Add country from CRM data if available
      if (p.country) {
        await client`
          UPDATE providers SET country = ${p.country} WHERE id = ${providerId}
        `;
      }

      // Add comment as note
      if (p.comments) {
        await client`
          INSERT INTO notes (entity_type, entity_id, content, author_id)
          VALUES ('provider', ${providerId}, ${p.comments}, ${marouaneId || adminRoleId})
        `;
      }
    }

    console.log(`  ✓ Imported ${providersData.length} providers`);

    if (!SEED_DEMO_TRACKING_DATA) {
      console.log("  ⏭ Skipping demo tracking data. Providers, team, settings, and email settings are preserved.");
    } else {

    // ── Outreach (real data from CRM) ──────────────────────────
    console.log("  Importing outreach records...");
    const outreachPath = join(process.cwd(), "data", "outreach.json");
    const outreachData: OutreachJson[] = JSON.parse(readFileSync(outreachPath, "utf-8"));

    let outreachCount = 0;
    for (const o of outreachData) {
      const providerId = providerNameToId.get(o.provider_name);
      if (!providerId) {
        console.log(`  ⚠ Skipping outreach for unknown provider: ${o.provider_name}`);
        continue;
      }

      const channel = CHANNEL_MAP[o.contact_channel || ""] || "email";
      const sendResult = SEND_RESULT_MAP[o.send_result || ""] || "drafted";

      await client`
        INSERT INTO outreach_logs (
          provider_id, channel, recipient, subject,
          send_result, next_action, sent_by_id
        ) VALUES (
          ${providerId},
          ${channel}::contact_channel,
          ${jsonVal(o.recipient)},
          ${jsonVal(o.subject)},
          ${sendResult}::send_result,
          ${jsonVal(o.next_action)},
          ${marouaneId || adminRoleId}
        )
      `;
      outreachCount++;
    }

    console.log(`  ✓ Imported ${outreachCount} outreach records`);

    // ── Servers (from JSON) ────────────────────────────────────
    console.log("  Importing servers...");
    const serversPath = join(process.cwd(), "data", "servers.json");
    const serversData: ServerJson[] = JSON.parse(readFileSync(serversPath, "utf-8"));

    const serverNameToId = new Map<string, string>();
    let serversCount = 0;

    if (serversData.length > 0) {
      for (const s of serversData) {
        const providerId = s.provider_name ? providerNameToId.get(s.provider_name) : undefined;
        if (!providerId) {
          console.log(`  ⚠ Skipping server "${s.name}" — unknown provider: ${s.provider_name}`);
          continue;
        }

        const billingMethod = s.billing_method?.toLowerCase() || null;
        const dailyLimit = s.name?.includes("RNK") ? 500 : s.name?.includes("Hex") ? 1000 : s.name?.includes("GleSYS") ? 750 : null;
        const serverStatus = s.name?.includes("RNK-LAX") ? "public" : "active";
        const result = await client`
          INSERT INTO servers (
            name, provider_id, plan, location, operating_system,
            status, monthly_cost, hourly_cost, currency,
            billing_method, notes, daily_send_limit, created_by_id
          ) VALUES (
            ${s.name || "Unnamed Server"},
            ${providerId},
            ${jsonVal(s.plan)},
            ${jsonVal(s.location)},
            ${jsonVal(s.operating_system)},
            ${serverStatus}::server_status,
            ${s.monthly_cost != null ? String(s.monthly_cost) : null},
            ${s.hourly_cost != null ? String(s.hourly_cost) : null},
            ${jsonVal(s.currency) || 'USD'},
            ${billingMethod}::billing_method,
            ${jsonVal(s.notes)},
            ${dailyLimit},
            ${marouaneId || adminRoleId}
          )
          RETURNING id
        `;
        serverNameToId.set(s.name || "Unnamed Server", result[0].id);
        serversCount++;
      }
      console.log(`  ✓ Imported ${serversCount} servers`);
    } else {
      console.log("  ⏭ No server data to import (empty array)");
    }

    // ── Server-User Assignments ────────────────────────────────
    console.log("  Assigning users to servers...");
    const allServerIds = [...serverNameToId.values()];
    const allUserIds = [adminRoleId, marouaneId].filter(Boolean);
    let assignmentsCount = 0;
    for (const sid of allServerIds) {
      const userId = allUserIds[assignmentsCount % allUserIds.length];
      if (userId) {
        await client`
          INSERT INTO server_users (server_id, user_id)
          VALUES (${sid}, ${userId})
          ON CONFLICT (server_id, user_id) DO NOTHING
        `;
        assignmentsCount++;
      }
    }
    console.log(`  ✓ Assigned ${assignmentsCount} server-user pairs`);

    // ── IP Addresses (from JSON) ───────────────────────────────
    console.log("  Importing IP addresses...");
    const ipsPath = join(process.cwd(), "data", "ip_addresses.json");
    const ipsData: IpAddressJson[] = JSON.parse(readFileSync(ipsPath, "utf-8"));

    let ipsCount = 0;

    if (ipsData.length > 0) {
      for (const ip of ipsData) {
        if (!ip.address) {
          console.log(`  ⚠ Skipping IP entry — no address field`);
          continue;
        }
        const providerId = ip.provider_name ? providerNameToId.get(ip.provider_name) : undefined;
        if (!providerId) {
          console.log(`  ⚠ Skipping IP "${ip.address}" — unknown provider: ${ip.provider_name}`);
          continue;
        }

        const serverId = ip.server_name ? serverNameToId.get(ip.server_name) : undefined;
        if (!serverId) {
          console.log(`  ⚠ Skipping IP "${ip.address}" — unknown server: ${ip.server_name}`);
          continue;
        }

        const ipVersion = (ip.ip_version || "ipv4").toLowerCase();
        const ipStatus = (ip.status || "unused").toLowerCase();
        const port25 = (ip.port25_status || "unknown").toLowerCase();

        await client`
          INSERT INTO ip_addresses (
            address, ip_version, provider_id, server_id,
            location, status, ptr_configured, ptr_hostname,
            port25_status, notes
          ) VALUES (
            ${ip.address},
            ${ipVersion}::ip_version,
            ${providerId},
            ${serverId},
            ${jsonVal(ip.location)},
            ${ipStatus}::ip_status,
            ${ip.ptr_configured === true || ip.ptr_configured === "true"},
            ${jsonVal(ip.ptr_hostname)},
            ${port25}::port25_status,
            ${jsonVal(ip.notes)}
          )
          ON CONFLICT (address) DO NOTHING
        `;
        ipsCount++;
      }
      console.log(`  ✓ Imported ${ipsCount} IP addresses`);
    } else {
      console.log("  ⏭ No IP address data to import (empty array)");
    }

    // ── Tasks (from JSON) ──────────────────────────────────────
    console.log("  Importing tasks...");
    const tasksPath = join(process.cwd(), "data", "tasks.json");
    const tasksData: TaskJson[] = JSON.parse(readFileSync(tasksPath, "utf-8"));

    let tasksCount = 0;

    if (tasksData.length > 0) {
      for (const t of tasksData) {
        const priority = (t.priority || "medium").toLowerCase();
        const status = (t.status || "open").toLowerCase();

        await client`
          INSERT INTO tasks (
            title, description, priority, status,
            due_date, related_entity_type, related_entity_id,
            assigned_user_id, created_by_id
          ) VALUES (
            ${t.title || "Untitled Task"},
            ${jsonVal(t.description)},
            ${priority}::task_priority,
            ${status}::task_status,
            ${t.due_date || null},
            ${jsonVal(t.related_entity_type)},
            ${null},
            ${marouaneId || adminRoleId},
            ${marouaneId || adminRoleId}
          )
        `;
        tasksCount++;
      }
      console.log(`  ✓ Imported ${tasksCount} tasks`);
    } else {
      console.log("  ⏭ No task data to import (empty array)");
    }

    // ── Daily Sending (from JSON) ──────────────────────────────
    console.log("  Importing daily sending logs...");
    const sendingPath = join(process.cwd(), "data", "daily_sending.json");
    const sendingData: DailySendingJson[] = JSON.parse(readFileSync(sendingPath, "utf-8"));

    let sendingCount = 0;

    if (sendingData.length > 0) {
      for (const s of sendingData) {
        const providerId = s.provider_name ? providerNameToId.get(s.provider_name) : undefined;
        if (!providerId) {
          console.log(`  ⚠ Skipping sending log — unknown provider: ${s.provider_name}`);
          continue;
        }

        const serverId = s.server_name ? serverNameToId.get(s.server_name) : undefined;
        if (!serverId) {
          console.log(`  ⚠ Skipping sending log — unknown server: ${s.server_name}`);
          continue;
        }

        // Find IP address by address
        const ipResult = s.ip_address
          ? await client`SELECT id FROM ip_addresses WHERE address = ${s.ip_address} LIMIT 1`
          : [];
        const ipAddressId = ipResult[0]?.id;
        if (!ipAddressId) {
          console.log(`  ⚠ Skipping sending log — unknown IP: ${s.ip_address}`);
          continue;
        }

        await client`
          INSERT INTO sending_logs (
            date, mailer_id, provider_id, server_id, ip_address_id,
            planned_sends, actual_sends, successful_sends,
            bounces, complaints, unsubscribes,
            delivery_notes, operational_status
          ) VALUES (
            ${s.date || new Date().toISOString()},
            ${marouaneId || adminRoleId},
            ${providerId},
            ${serverId},
            ${ipAddressId},
            ${s.planned_sends != null ? Number(s.planned_sends) : 0},
            ${s.actual_sends != null ? Number(s.actual_sends) : 0},
            ${s.successful_sends != null ? Number(s.successful_sends) : 0},
            ${s.bounces != null ? Number(s.bounces) : 0},
            ${s.complaints != null ? Number(s.complaints) : 0},
            ${s.unsubscribes != null ? Number(s.unsubscribes) : 0},
            ${jsonVal(s.delivery_notes)},
            ${s.operational_status || 'normal'}::sending_status
          )
        `;
        sendingCount++;
      }
      console.log(`  ✓ Imported ${sendingCount} sending logs`);
    } else {
      console.log("  ⏭ No sending log data to import (empty array)");
    }

    // ── Provider Responses (from JSON) ─────────────────────────
    console.log("  Importing provider responses...");
    const responsesPath = join(process.cwd(), "data", "provider_responses.json");
    const responsesData: ProviderResponseJson[] = JSON.parse(readFileSync(responsesPath, "utf-8"));

    let responsesCount = 0;

    if (responsesData.length > 0) {
      for (const r of responsesData) {
        const providerId = r.provider_name ? providerNameToId.get(r.provider_name) : undefined;
        if (!providerId) {
          console.log(`  ⚠ Skipping response — unknown provider: ${r.provider_name}`);
          continue;
        }

        const responseType = (r.response_type || "other").toLowerCase();

        await client`
          INSERT INTO provider_responses (
            provider_id, response_date, response_type,
            full_response, summary, decision_recommendation,
            created_by_id
          ) VALUES (
            ${providerId},
            ${r.response_date || new Date().toISOString()},
            ${responseType}::response_type,
            ${jsonVal(r.full_response)},
            ${jsonVal(r.summary)},
            ${jsonVal(r.decision_recommendation)},
            ${marouaneId || adminRoleId}
          )
        `;
        responsesCount++;
      }
      console.log(`  ✓ Imported ${responsesCount} provider responses`);
    } else {
      console.log("  ⏭ No provider response data to import (empty array)");
    }

    }

    // ── Summary ────────────────────────────────────────────────
    const providerCount = await client`SELECT COUNT(*) as count FROM providers`;
    const outreachTotal = await client`SELECT COUNT(*) as count FROM outreach_logs`;
    const serversTotal = await client`SELECT COUNT(*) as count FROM servers`;
    const ipsTotal = await client`SELECT COUNT(*) as count FROM ip_addresses`;
    const tasksTotal = await client`SELECT COUNT(*) as count FROM tasks`;
    const sendingTotal = await client`SELECT COUNT(*) as count FROM sending_logs`;
    const responsesTotal = await client`SELECT COUNT(*) as count FROM provider_responses`;
    const userCount = await client`SELECT COUNT(*) as count FROM users`;

    console.log("\n🎉 Seed completed successfully!\n");
    console.log("📊 Database summary:");
    console.log(`   Providers:          ${providerCount[0].count}`);
    console.log(`   Outreach:           ${outreachTotal[0].count}`);
    console.log(`   Servers:            ${serversTotal[0].count}`);
    console.log(`   IP Addresses:       ${ipsTotal[0].count}`);
    console.log(`   Tasks:              ${tasksTotal[0].count}`);
    console.log(`   Sending Logs:       ${sendingTotal[0].count}`);
    console.log(`   Provider Responses: ${responsesTotal[0].count}`);
    console.log(`   Users:              ${userCount[0].count}`);
    console.log("\n📋 Login credentials:");
    console.log(`   Admin:       ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log("   Researcher:  marouane@cloudops.com / marouane123");
    console.log("   Mailer:      john@cloudops.com / mailer123");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  } finally {
    await client.end();
  }
}

seed();
