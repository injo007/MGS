/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  providers,
  servers,
  ipAddresses,
  outreachLogs,
  tasks,
} from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { detectProviderCountry } from "@/lib/provider-country";
import { forbidden, isAdmin } from "@/lib/access-control";

interface ImportRequest {
  rows: Record<string, any>[];
  entity: "providers" | "servers" | "ip_addresses" | "outreach" | "tasks";
  mode: "create" | "update" | "skip_existing";
  mappings?: Record<string, string>;
}

const PROVIDER_REQUIRED = ["name"];
const SERVER_REQUIRED = ["name", "provider_id"];
const IP_REQUIRED = ["address", "provider_id", "server_id"];
const OUTREACH_REQUIRED = ["provider_id"];
const TASK_REQUIRED = ["title"];

function validateRow(
  row: Record<string, any>,
  entity: string
): string[] {
  const errors: string[] = [];
  let required: string[] = [];

  switch (entity) {
    case "providers":
      required = PROVIDER_REQUIRED;
      break;
    case "servers":
      required = SERVER_REQUIRED;
      break;
    case "ip_addresses":
      required = IP_REQUIRED;
      break;
    case "outreach":
      required = OUTREACH_REQUIRED;
      break;
    case "tasks":
      required = TASK_REQUIRED;
      break;
  }

  for (const field of required) {
    if (!row[field] && row[field] !== 0) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (entity === "providers" && row.decision) {
    const valid = ["pending", "accepted", "denied", "prohibited_sending", "not_suitable"];
    if (!valid.includes(row.decision)) {
      errors.push(`Invalid decision: ${row.decision}`);
    }
  }

  if (entity === "providers" && row.contact_status) {
    const valid = ["not_contacted", "ready_to_contact", "contacted", "follow_up_due", "closed"];
    if (!valid.includes(row.contact_status)) {
      errors.push(`Invalid contact_status: ${row.contact_status}`);
    }
  }

  if (entity === "providers" && row.response_status) {
    const valid = ["not_sent", "no_response", "replied", "needs_follow_up"];
    if (!valid.includes(row.response_status)) {
      errors.push(`Invalid response_status: ${row.response_status}`);
    }
  }

  if (entity === "servers" && row.status) {
    const valid = ["pending", "active", "paused", "suspended", "cancelled", "expired"];
    if (!valid.includes(row.status)) {
      errors.push(`Invalid server status: ${row.status}`);
    }
  }

  if (entity === "tasks" && row.priority) {
    const valid = ["low", "medium", "high", "urgent"];
    if (!valid.includes(row.priority)) {
      errors.push(`Invalid priority: ${row.priority}`);
    }
  }

  if (entity === "tasks" && row.status) {
    const valid = ["open", "in_progress", "blocked", "completed", "cancelled"];
    if (!valid.includes(row.status)) {
      errors.push(`Invalid task status: ${row.status}`);
    }
  }

  return errors;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "allowed"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "prohibited", "blocked"].includes(normalized)) return false;
  return undefined;
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalBillingMethod(value: unknown): "hourly" | "monthly" | "annually" | "one_time" | "free" | null {
  const text = optionalString(value);
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
  if (["hourly", "monthly", "annually", "one_time", "free"].includes(normalized)) {
    return normalized as "hourly" | "monthly" | "annually" | "one_time" | "free";
  }
  return null;
}

function normalizeProviderWebsite(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;
  return text
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function normalizeEmail(value: unknown): string | null {
  const text = optionalString(value);
  return text ? text.toLowerCase() : null;
}

async function findExistingProvider(row: Record<string, any>, providerValues: { name: string; website: string | null; supportEmail: string | null; salesEmail: string | null }) {
  if (row.id) {
    const [existingById] = await db.select({ id: providers.id }).from(providers).where(eq(providers.id, row.id)).limit(1);
    if (existingById) return existingById;
  }

  const normalizedWebsite = normalizeProviderWebsite(providerValues.website);
  if (normalizedWebsite) {
    const [existingByWebsite] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(sql`regexp_replace(regexp_replace(lower(coalesce(${providers.website}, '')), '^https?://(www\.)?', ''), '/+$', '') = ${normalizedWebsite}`)
      .limit(1);
    if (existingByWebsite) return existingByWebsite;
  }

  const emails = [normalizeEmail(providerValues.supportEmail), normalizeEmail(providerValues.salesEmail)].filter(Boolean) as string[];
  if (emails.length > 0) {
    const [existingByEmail] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(or(...emails.flatMap((email) => [
        sql`lower(coalesce(${providers.supportEmail}, '')) = ${email}`,
        sql`lower(coalesce(${providers.salesEmail}, '')) = ${email}`,
      ])))
      .limit(1);
    if (existingByEmail) return existingByEmail;
  }

  if (!normalizedWebsite && emails.length === 0) {
    const [existingByName] = await db.select({ id: providers.id }).from(providers).where(eq(providers.name, providerValues.name)).limit(1);
    if (existingByName) return existingByName;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(session)) return forbidden("Imports are available to admins only.");

    const body: ImportRequest = await request.json();
    const { rows, entity, mode, mappings } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    if (!entity) {
      return NextResponse.json({ error: "Entity type is required" }, { status: 400 });
    }

    // Apply mappings if provided (rename columns from file to DB columns)
    const mappedRows = mappings
      ? rows.map((row) => {
          const mapped: Record<string, any> = {};
          for (const [fileCol, dbCol] of Object.entries(mappings)) {
            if (row[fileCol] !== undefined) {
              mapped[dbCol] = row[fileCol];
            }
          }
          // Keep unmapped fields too
          for (const [key, val] of Object.entries(row)) {
            if (!mappings[key] && mapped[key] === undefined) {
              mapped[key] = val;
            }
          }
          return mapped;
        })
      : rows;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < mappedRows.length; i++) {
      const row = mappedRows[i];
      const validationErrors = validateRow(row, entity);

      if (validationErrors.length > 0) {
        failed++;
        errors.push({ row: i + 1, reason: validationErrors.join("; ") });
        continue;
      }

      try {
        switch (entity) {
          case "providers": {
            const port25Status = row.port25_status || "unknown";
            const mailServerAllowed =
              port25Status === "available"
                ? true
                : port25Status === "blocked"
                  ? false
                  : parseOptionalBoolean(row.mail_server_allowed);
            const detectedCountry = row.country || detectProviderCountry({
              website: row.website,
              supportEmail: row.support_email,
              salesEmail: row.sales_email,
            })?.country;
            const providerValues = {
              name: String(row.name).trim(),
              website: optionalString(row.website),
              supportEmail: optionalString(row.support_email),
              salesEmail: optionalString(row.sales_email),
              contactFormUrl: optionalString(row.contact_form_url),
              country: optionalString(detectedCountry),
              region: optionalString(row.region),
              category: optionalString(row.category),
              contactStatus: row.contact_status || "not_contacted",
              responseStatus: row.response_status || "not_sent",
              decision: row.decision || "pending",
              port25Status,
              ptrStatus: row.ptr_status || "unknown",
              mailServerAllowed,
              sendingRestrictions: optionalString(row.sending_restrictions),
              dailyLimit: optionalNumber(row.daily_limit),
              hourlyLimit: optionalNumber(row.hourly_limit),
              abusePolicyNotes: optionalString(row.abuse_policy_notes),
              startingPrice: optionalString(row.starting_price),
              setupFee: optionalString(row.setup_fee),
              paymentMethod: optionalString(row.payment_method),
              refundPolicy: optionalString(row.refund_policy),
              currency: optionalString(row.currency) || "USD",
              billingMethod: optionalBillingMethod(row.billing_method),
            };
            if (mode === "update" && row.id) {
              await db
                .update(providers)
                .set(providerValues)
                .where(eq(providers.id, row.id));
              updated++;
            } else {
              const existing = await findExistingProvider(row, providerValues);

              if (existing) {
                if (mode === "skip_existing") {
                  skipped++;
                } else {
                  await db.update(providers).set(providerValues).where(eq(providers.id, existing.id));
                  updated++;
                }
              } else {
                await db.insert(providers).values({
                  ...providerValues,
                  createdById: session.user.id,
                });
                created++;
              }
            }
            break;
          }
          case "servers": {
            if (mode === "update" && row.id) {
              await db
                .update(servers)
                .set({
                  name: row.name,
                  plan: row.plan,
                  location: row.location,
                  operatingSystem: row.operating_system,
                  status: row.status || "active",
                  monthlyCost: row.monthly_cost,
                  hourlyCost: row.hourly_cost,
                  currency: row.currency || "USD",
                  billingMethod: row.billing_method,
                  notes: row.notes,
                })
                .where(eq(servers.id, row.id));
              updated++;
            } else {
              await db.insert(servers).values({
                name: row.name,
                providerId: row.provider_id,
                plan: row.plan,
                location: row.location,
                operatingSystem: row.operating_system,
                status: row.status || "active",
                monthlyCost: row.monthly_cost,
                hourlyCost: row.hourly_cost,
                currency: row.currency || "USD",
                billingMethod: row.billing_method,
                notes: row.notes,
                createdById: session.user.id,
              });
              created++;
            }
            break;
          }
          case "ip_addresses": {
            if (mode === "update" && row.id) {
              await db
                .update(ipAddresses)
                .set({
                  address: row.address,
                  ipVersion: row.ip_version || "ipv4",
                  location: row.location,
                  status: row.status || "unused",
                  ptrConfigured: row.ptr_configured,
                  ptrHostname: row.ptr_hostname,
                  port25Status: row.port25_status || "unknown",
                  notes: row.notes,
                })
                .where(eq(ipAddresses.id, row.id));
              updated++;
            } else {
              await db.insert(ipAddresses).values({
                address: row.address,
                ipVersion: row.ip_version || "ipv4",
                providerId: row.provider_id,
                serverId: row.server_id,
                location: row.location,
                status: row.status || "unused",
                ptrConfigured: row.ptr_configured,
                ptrHostname: row.ptr_hostname,
                port25Status: row.port25_status || "unknown",
                notes: row.notes,
              });
              created++;
            }
            break;
          }
          case "outreach": {
            if (mode === "update" && row.id) {
              await db
                .update(outreachLogs)
                .set({
                  channel: row.channel || "email",
                  recipient: row.recipient,
                  subject: row.subject,
                  message: row.message,
                  sendResult: row.send_result || "drafted",
                  nextAction: row.next_action,
                })
                .where(eq(outreachLogs.id, row.id));
              updated++;
            } else {
              await db.insert(outreachLogs).values({
                providerId: row.provider_id,
                channel: row.channel || "email",
                recipient: row.recipient,
                subject: row.subject,
                message: row.message,
                sendResult: row.send_result || "drafted",
                nextAction: row.next_action,
                sentById: row.sent_by_id,
              });
              created++;
            }
            break;
          }
          case "tasks": {
            if (mode === "update" && row.id) {
              await db
                .update(tasks)
                .set({
                  title: row.title,
                  description: row.description,
                  priority: row.priority || "medium",
                  status: row.status || "open",
                  dueDate: row.due_date,
                  assignedUserId: row.assigned_user_id,
                  relatedEntityType: row.related_entity_type,
                })
                .where(eq(tasks.id, row.id));
              updated++;
            } else {
              await db.insert(tasks).values({
                title: row.title,
                description: row.description,
                priority: row.priority || "medium",
                status: row.status || "open",
                dueDate: row.due_date,
                assignedUserId: row.assigned_user_id,
                relatedEntityType: row.related_entity_type,
                createdById: session.user.id,
              });
              created++;
            }
            break;
          }
          default: {
            skipped++;
            break;
          }
        }
      } catch (err: any) {
        failed++;
        errors.push({ row: i + 1, reason: err.message || "Database error" });
      }
    }

    return NextResponse.json({
      created,
      updated,
      skipped,
      failed,
      total: rows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}
