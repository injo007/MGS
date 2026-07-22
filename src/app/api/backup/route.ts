/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  auditLogs,
  campaigns,
  ipAddresses,
  notes,
  notifications,
  outreachLogs,
  providerContacts,
  providerCredentials,
  providerResponses,
  providerTags,
  providers,
  roles,
  sendingLogs,
  serverUsers,
  servers,
  settings,
  statusOptions,
  tasks,
  users,
} from "@/db/schema";
import { forbidden, isAdmin } from "@/lib/access-control";

const BACKUP_VERSION = 1;

const TABLES = [
  { key: "roles", table: roles, target: roles.id, targetKey: "id" },
  { key: "users", table: users, target: users.id, targetKey: "id" },
  { key: "settings", table: settings, target: settings.key, targetKey: "key" },
  { key: "statusOptions", table: statusOptions, target: statusOptions.id, targetKey: "id" },
  { key: "providers", table: providers, target: providers.id, targetKey: "id" },
  { key: "providerTags", table: providerTags, target: providerTags.id, targetKey: "id" },
  { key: "providerContacts", table: providerContacts, target: providerContacts.id, targetKey: "id" },
  { key: "providerCredentials", table: providerCredentials, target: providerCredentials.id, targetKey: "id" },
  { key: "providerResponses", table: providerResponses, target: providerResponses.id, targetKey: "id" },
  { key: "campaigns", table: campaigns, target: campaigns.id, targetKey: "id" },
  { key: "servers", table: servers, target: servers.id, targetKey: "id" },
  { key: "serverUsers", table: serverUsers, target: serverUsers.id, targetKey: "id" },
  { key: "ipAddresses", table: ipAddresses, target: ipAddresses.id, targetKey: "id" },
  { key: "outreachLogs", table: outreachLogs, target: outreachLogs.id, targetKey: "id" },
  { key: "sendingLogs", table: sendingLogs, target: sendingLogs.id, targetKey: "id" },
  { key: "tasks", table: tasks, target: tasks.id, targetKey: "id" },
  { key: "notes", table: notes, target: notes.id, targetKey: "id" },
  { key: "notifications", table: notifications, target: notifications.id, targetKey: "id" },
  { key: "auditLogs", table: auditLogs, target: auditLogs.id, targetKey: "id" },
] as const;

const DATE_KEYS = new Set([
  "emailVerified",
  "lastLoginAt",
  "createdAt",
  "updatedAt",
  "dateFirstContacted",
  "lastContactDate",
  "nextFollowUpDate",
  "closedAt",
  "date",
  "responseDate",
  "followUpDate",
  "purchaseDate",
  "activationDate",
  "expirationDate",
  "startDate",
  "endDate",
  "dueDate",
  "completedAt",
  "completedAt",
  "expires",
]);

function normalizeRestoreRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (value === null) {
      normalized[key] = null;
      continue;
    }
    if (DATE_KEYS.has(key) && typeof value === "string" && value) {
      const date = new Date(value);
      normalized[key] = Number.isNaN(date.getTime()) ? value : date;
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

async function upsertTable(tableConfig: (typeof TABLES)[number], rows: Record<string, any>[]) {
  let restored = 0;
  for (const sourceRow of rows) {
    const row = normalizeRestoreRow(sourceRow);
    if (!row[tableConfig.targetKey]) continue;
    const updateSet = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== tableConfig.targetKey)
    );

    if (Object.keys(updateSet).length === 0) {
      await db
        .insert(tableConfig.table as any)
        .values(row)
        .onConflictDoNothing({ target: tableConfig.target as any });
    } else {
      await db
        .insert(tableConfig.table as any)
        .values(row)
        .onConflictDoUpdate({
          target: tableConfig.target as any,
          set: updateSet,
        });
    }
    restored++;
  }
  return restored;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Backups are available to admins only.");

  const data: Record<string, unknown[]> = {};
  for (const tableConfig of TABLES) {
    data[tableConfig.key] = await db.select().from(tableConfig.table as any);
  }

  return new Response(JSON.stringify({
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "cloudops-crm",
    data,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cloudops_backup_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Backups are available to admins only.");

  const body = await request.json();
  const backupData = body?.data;
  if (!backupData || typeof backupData !== "object") {
    return NextResponse.json({ error: "Invalid backup file. Expected a CloudOps JSON backup." }, { status: 400 });
  }

  const restored: Record<string, number> = {};
  for (const tableConfig of TABLES) {
    const rows = Array.isArray(backupData[tableConfig.key]) ? backupData[tableConfig.key] : [];
    restored[tableConfig.key] = await upsertTable(tableConfig, rows);
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "restore_backup",
    entityType: "backup",
    newValue: {
      version: body.version || null,
      restored,
    },
  });

  return NextResponse.json({ restored });
}
