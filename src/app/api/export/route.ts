/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  providers,
  servers,
  ipAddresses,
  outreachLogs,
  sendingLogs,
  tasks,
} from "@/db/schema";
import Papa from "papaparse";
import { forbidden, isAdmin } from "@/lib/access-control";

const ENTITY_TABLE_MAP: Record<string, any> = {
  providers,
  servers,
  ip_addresses: ipAddresses,
  outreach: outreachLogs,
  sending_logs: sendingLogs,
  tasks,
};

const ENTITY_SELECT_MAP: Record<string, any> = {
  providers: {
    id: providers.id,
    name: providers.name,
    website: providers.website,
    support_email: providers.supportEmail,
    sales_email: providers.salesEmail,
    contact_form_url: providers.contactFormUrl,
    country: providers.country,
    region: providers.region,
    category: providers.category,
    contact_status: providers.contactStatus,
    response_status: providers.responseStatus,
    decision: providers.decision,
    date_first_contacted: providers.dateFirstContacted,
    last_contact_date: providers.lastContactDate,
    next_follow_up_date: providers.nextFollowUpDate,
    port25_status: providers.port25Status,
    ptr_status: providers.ptrStatus,
    ipv4_available: providers.ipv4Available,
    ipv6_available: providers.ipv6Available,
    mail_server_allowed: providers.mailServerAllowed,
    sending_restrictions: providers.sendingRestrictions,
    daily_limit: providers.dailyLimit,
    hourly_limit: providers.hourlyLimit,
    abuse_policy_notes: providers.abusePolicyNotes,
    starting_price: providers.startingPrice,
    currency: providers.currency,
    billing_method: providers.billingMethod,
    hourly_billing: providers.hourlyBilling,
    monthly_billing: providers.monthlyBilling,
    setup_fee: providers.setupFee,
    payment_method: providers.paymentMethod,
    refund_policy: providers.refundPolicy,
    assigned_user_id: providers.assignedUserId,
    closed_at: providers.closedAt,
    closed_reason: providers.closedReason,
    created_at: providers.createdAt,
    updated_at: providers.updatedAt,
  },
  servers: {
    id: servers.id,
    name: servers.name,
    provider_id: servers.providerId,
    plan: servers.plan,
    location: servers.location,
    operating_system: servers.operatingSystem,
    status: servers.status,
    monthly_cost: servers.monthlyCost,
    hourly_cost: servers.hourlyCost,
    currency: servers.currency,
    billing_method: servers.billingMethod,
    notes: servers.notes,
    created_at: servers.createdAt,
    updated_at: servers.updatedAt,
  },
  ip_addresses: {
    id: ipAddresses.id,
    address: ipAddresses.address,
    ip_version: ipAddresses.ipVersion,
    provider_id: ipAddresses.providerId,
    server_id: ipAddresses.serverId,
    location: ipAddresses.location,
    status: ipAddresses.status,
    ptr_configured: ipAddresses.ptrConfigured,
    ptr_hostname: ipAddresses.ptrHostname,
    port25_status: ipAddresses.port25Status,
    notes: ipAddresses.notes,
    created_at: ipAddresses.createdAt,
    updated_at: ipAddresses.updatedAt,
  },
  outreach: {
    id: outreachLogs.id,
    provider_id: outreachLogs.providerId,
    date: outreachLogs.date,
    channel: outreachLogs.channel,
    recipient: outreachLogs.recipient,
    subject: outreachLogs.subject,
    message: outreachLogs.message,
    send_result: outreachLogs.sendResult,
    next_action: outreachLogs.nextAction,
    created_at: outreachLogs.createdAt,
  },
  sending_logs: {
    id: sendingLogs.id,
    date: sendingLogs.date,
    mailer_id: sendingLogs.mailerId,
    provider_id: sendingLogs.providerId,
    server_id: sendingLogs.serverId,
    ip_address_id: sendingLogs.ipAddressId,
    planned_sends: sendingLogs.plannedSends,
    actual_sends: sendingLogs.actualSends,
    successful_sends: sendingLogs.successfulSends,
    bounces: sendingLogs.bounces,
    complaints: sendingLogs.complaints,
    unsubscribes: sendingLogs.unsubscribes,
    delivery_notes: sendingLogs.deliveryNotes,
    operational_status: sendingLogs.operationalStatus,
    created_at: sendingLogs.createdAt,
  },
  tasks: {
    id: tasks.id,
    title: tasks.title,
    description: tasks.description,
    assigned_user_id: tasks.assignedUserId,
    priority: tasks.priority,
    due_date: tasks.dueDate,
    status: tasks.status,
    related_entity_type: tasks.relatedEntityType,
    created_at: tasks.createdAt,
    updated_at: tasks.updatedAt,
  },
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(session)) return forbidden("Exports are available to admins only.");

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");

    if (!entity || !ENTITY_SELECT_MAP[entity]) {
      return NextResponse.json(
        { error: `Invalid entity. Valid: ${Object.keys(ENTITY_SELECT_MAP).join(", ")}` },
        { status: 400 }
      );
    }

    const selectFields = ENTITY_SELECT_MAP[entity];
    const data = await db.select(selectFields).from(ENTITY_TABLE_MAP[entity]);

    // Serialize dates to strings for CSV
    const serialized = data.map((row: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (val instanceof Date) {
          out[key] = val.toISOString();
        } else {
          out[key] = val;
        }
      }
      return out;
    });

    const csv = Papa.unparse(serialized);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity}_export_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 }
    );
  }
}
