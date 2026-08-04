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
import { and, eq } from "drizzle-orm";
import { forbidden, isAdmin } from "@/lib/access-control";

const BACKUP_VERSION = 1;

type BackupTableConfig = {
  key: string;
  table: any;
  primaryKey: any;
  primaryKeyField: string;
  foreignKeys?: Record<string, string>;
  matchers?: readonly {
    fields: readonly string[];
    columns: readonly any[];
  }[];
};

const TABLES = [
  {
    key: "roles",
    table: roles,
    primaryKey: roles.id,
    primaryKeyField: "id",
    matchers: [{ fields: ["name"], columns: [roles.name] }],
  },
  {
    key: "users",
    table: users,
    primaryKey: users.id,
    primaryKeyField: "id",
    foreignKeys: { roleId: "roles" },
    matchers: [{ fields: ["email"], columns: [users.email] }],
  },
  {
    key: "settings",
    table: settings,
    primaryKey: settings.id,
    primaryKeyField: "id",
    matchers: [{ fields: ["key"], columns: [settings.key] }],
  },
  {
    key: "statusOptions",
    table: statusOptions,
    primaryKey: statusOptions.id,
    primaryKeyField: "id",
    matchers: [{ fields: ["group", "value"], columns: [statusOptions.group, statusOptions.value] }],
  },
  {
    key: "providers",
    table: providers,
    primaryKey: providers.id,
    primaryKeyField: "id",
    foreignKeys: { assignedUserId: "users", createdById: "users" },
    matchers: [{ fields: ["website"], columns: [providers.website] }],
  },
  {
    key: "providerTags",
    table: providerTags,
    primaryKey: providerTags.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers" },
    matchers: [{ fields: ["providerId", "tag"], columns: [providerTags.providerId, providerTags.tag] }],
  },
  {
    key: "providerContacts",
    table: providerContacts,
    primaryKey: providerContacts.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers" },
  },
  {
    key: "providerCredentials",
    table: providerCredentials,
    primaryKey: providerCredentials.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers", createdById: "users", updatedById: "users" },
  },
  {
    key: "providerResponses",
    table: providerResponses,
    primaryKey: providerResponses.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers", createdById: "users" },
  },
  {
    key: "campaigns",
    table: campaigns,
    primaryKey: campaigns.id,
    primaryKeyField: "id",
    foreignKeys: { createdById: "users" },
  },
  {
    key: "servers",
    table: servers,
    primaryKey: servers.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers", createdById: "users" },
  },
  {
    key: "serverUsers",
    table: serverUsers,
    primaryKey: serverUsers.id,
    primaryKeyField: "id",
    foreignKeys: { serverId: "servers", userId: "users" },
  },
  {
    key: "ipAddresses",
    table: ipAddresses,
    primaryKey: ipAddresses.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers", serverId: "servers", assignedMailerId: "users" },
    matchers: [{ fields: ["address"], columns: [ipAddresses.address] }],
  },
  {
    key: "outreachLogs",
    table: outreachLogs,
    primaryKey: outreachLogs.id,
    primaryKeyField: "id",
    foreignKeys: { providerId: "providers", sentById: "users" },
  },
  {
    key: "sendingLogs",
    table: sendingLogs,
    primaryKey: sendingLogs.id,
    primaryKeyField: "id",
    foreignKeys: {
      mailerId: "users",
      providerId: "providers",
      serverId: "servers",
      ipAddressId: "ipAddresses",
      campaignId: "campaigns",
    },
  },
  {
    key: "tasks",
    table: tasks,
    primaryKey: tasks.id,
    primaryKeyField: "id",
    foreignKeys: { assignedUserId: "users", createdById: "users" },
  },
  {
    key: "notes",
    table: notes,
    primaryKey: notes.id,
    primaryKeyField: "id",
    foreignKeys: { authorId: "users" },
  },
  {
    key: "notifications",
    table: notifications,
    primaryKey: notifications.id,
    primaryKeyField: "id",
    foreignKeys: { userId: "users" },
  },
  {
    key: "auditLogs",
    table: auditLogs,
    primaryKey: auditLogs.id,
    primaryKeyField: "id",
    foreignKeys: { userId: "users" },
  },
] as const satisfies readonly BackupTableConfig[];

type TableKey = (typeof TABLES)[number]["key"];
type TableConfig = BackupTableConfig & { key: TableKey };

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

function remapForeignKeys(
  tableConfig: TableConfig,
  row: Record<string, any>,
  idMaps: Partial<Record<TableKey, Map<string, string>>>
) {
  const next = { ...row };
  for (const [field, tableKey] of Object.entries(tableConfig.foreignKeys || {})) {
    const value = next[field];
    if (!value) continue;
    const mapped = idMaps[tableKey as TableKey]?.get(String(value));
    if (mapped) next[field] = mapped;
  }
  return next;
}

async function findExistingRow(tableConfig: TableConfig, row: Record<string, any>) {
  const primaryValue = row[tableConfig.primaryKeyField];
  if (primaryValue) {
    const existingById = await db
      .select()
      .from(tableConfig.table as any)
      .where(eq(tableConfig.primaryKey as any, primaryValue))
      .limit(1);
    if (existingById[0]) return existingById[0];
  }

  for (const matcher of tableConfig.matchers || []) {
    if (matcher.fields.some((field) => row[field] == null || row[field] === "")) continue;
    const conditions = matcher.columns.map((column, index) => eq(column as any, row[matcher.fields[index]]));
    const existingByMatcher = await db
      .select()
      .from(tableConfig.table as any)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .limit(1);
    if (existingByMatcher[0]) return existingByMatcher[0];
  }

  return null;
}

async function upsertTable(
  tableConfig: TableConfig,
  rows: Record<string, any>[],
  idMaps: Partial<Record<TableKey, Map<string, string>>>
) {
  let restored = 0;
  for (const sourceRow of rows) {
    const normalized = normalizeRestoreRow(sourceRow);
    if (!normalized[tableConfig.primaryKeyField]) continue;
    const row = remapForeignKeys(tableConfig, normalized, idMaps);
    const existing = await findExistingRow(tableConfig, row);

    if (existing?.[tableConfig.primaryKeyField]) {
      const backupId = String(normalized[tableConfig.primaryKeyField]);
      const resolvedId = String(existing[tableConfig.primaryKeyField]);
      if (!idMaps[tableConfig.key]) idMaps[tableConfig.key] = new Map<string, string>();
      idMaps[tableConfig.key]!.set(backupId, resolvedId);
      row[tableConfig.primaryKeyField] = resolvedId;
    }

    const rowId = row[tableConfig.primaryKeyField];
    if (!rowId) continue;
    const updateSet = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== tableConfig.primaryKeyField)
    );

    if (existing) {
      if (Object.keys(updateSet).length > 0) {
        await db
          .update(tableConfig.table as any)
          .set(updateSet)
          .where(eq(tableConfig.primaryKey as any, rowId));
      }
    } else {
      await db
        .insert(tableConfig.table as any)
        .values(row);

      if (!idMaps[tableConfig.key]) idMaps[tableConfig.key] = new Map<string, string>();
      idMaps[tableConfig.key]!.set(String(normalized[tableConfig.primaryKeyField]), String(rowId));
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
  data.serverStatistics = data.sendingLogs;

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

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON payload";
    return NextResponse.json(
      {
        error: `Backup file could not be parsed. ${message}. If this is a large backup, restart the app after increasing the Next.js proxy body limit.`,
      },
      { status: 400 }
    );
  }
  const backupData = body?.data;
  if (!backupData || typeof backupData !== "object") {
    return NextResponse.json({ error: "Invalid backup file. Expected a CloudOps JSON backup." }, { status: 400 });
  }

  // Accept both the canonical table name and the user-facing alias used in exports.
  if (!Array.isArray((backupData as Record<string, unknown>).sendingLogs) && Array.isArray((backupData as Record<string, unknown>).serverStatistics)) {
    (backupData as Record<string, unknown>).sendingLogs = (backupData as Record<string, unknown>).serverStatistics;
  }

  const restored: Record<string, number> = {};
  const idMaps: Partial<Record<TableKey, Map<string, string>>> = {};
  try {
    for (const tableConfig of TABLES) {
      const rows = Array.isArray(backupData[tableConfig.key]) ? backupData[tableConfig.key] : [];
      restored[tableConfig.key] = await upsertTable(tableConfig, rows, idMaps);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown restore error";
    return NextResponse.json({ error: `Restore failed while processing backup data. ${message}` }, { status: 400 });
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
