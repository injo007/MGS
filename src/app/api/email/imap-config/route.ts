import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { getImapConfigs } from "@/lib/imap-service";
import { forbidden, isAdmin, sessionUserId } from "@/lib/access-control";

function parseSetting(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function settingValue(key: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return parseSetting(row?.value);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(session);
  const savedConfigs = await getImapConfigs(sessionUserId(session), admin);
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const usersById = new Map(allUsers.map((user) => [user.id, user]));
  const host = String((await settingValue("imap_host")) || process.env.GMAIL_IMAP_HOST || "");
  const port = String((await settingValue("imap_port")) || process.env.GMAIL_IMAP_PORT || "993");
  const email = String((await settingValue("imap_email")) || process.env.GMAIL_ADDRESS || "");

  return NextResponse.json({
    host,
    port: parseInt(port, 10),
    email,
    accounts: savedConfigs.map((account) => ({
      host: account.host,
      port: account.port,
      email: account.user,
      label: account.label || account.user,
      assignedUserId: account.assignedUserId || null,
      assignedUserName: account.assignedUserId ? usersById.get(account.assignedUserId)?.name || null : null,
    })),
    users: admin ? allUsers : [],
    configured: savedConfigs.length > 0,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Only admins can configure IMAP accounts.");

  const body = await request.json();
  const { host, port, email, password, label, assignedUserId } = body;

  if (!host || !email || !password) {
    return NextResponse.json({ error: "Host, email, and password are required" }, { status: 400 });
  }

  try {
    const client = new ImapFlow({
      host,
      port: port || 993,
      secure: true,
      auth: { user: email, pass: password },
      logger: undefined,
      connectionTimeout: 10000,
    });

    await client.connect();
    await client.logout();

    const savedAccounts = ((await settingValue("imap_accounts")) || []) as unknown;
    const accounts = Array.isArray(savedAccounts) ? savedAccounts.filter((account) => {
      const row = account as Record<string, unknown>;
      return String(row.email || row.user || "").toLowerCase() !== String(email).toLowerCase();
    }) : [];
    accounts.push({
      host,
      port: port || 993,
      email,
      password,
      label: label || email,
      assignedUserId: assignedUserId || null,
    });

    const configs = [
      { key: "imap_host", value: JSON.stringify(host) },
      { key: "imap_port", value: JSON.stringify(port || 993) },
      { key: "imap_email", value: JSON.stringify(email) },
      { key: "imap_password", value: JSON.stringify(password) },
      { key: "imap_accounts", value: JSON.stringify(accounts) },
    ];

    for (const config of configs) {
      await db
        .insert(settings)
        .values(config)
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: config.value, updatedAt: new Date() },
        });
    }

    return NextResponse.json({
      success: true,
      message: "IMAP connection successful",
      accounts: accounts.map((account) => {
        const row = account as Record<string, unknown>;
        return {
          host: row.host,
          port: row.port,
          email: row.email,
          label: row.label || row.email,
          assignedUserId: row.assignedUserId || null,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Only admins can assign IMAP accounts.");

  const body = await request.json();
  const email = String(body.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const savedAccounts = ((await settingValue("imap_accounts")) || []) as unknown;
  const accounts = Array.isArray(savedAccounts)
    ? savedAccounts.map((account) => {
        const row = account as Record<string, unknown>;
        if (String(row.email || row.user || "").toLowerCase() !== email) return row;
        return {
          ...row,
          assignedUserId: body.assignedUserId || null,
          label: body.label ?? row.label,
        };
      })
    : [];

  await db
    .insert(settings)
    .values({ key: "imap_accounts", value: JSON.stringify(accounts) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(accounts), updatedAt: new Date() },
    });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Only admins can remove IMAP accounts.");

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const savedAccounts = ((await settingValue("imap_accounts")) || []) as unknown;
  const accounts = Array.isArray(savedAccounts)
    ? savedAccounts.filter((account) => {
        const row = account as Record<string, unknown>;
        return String(row.email || row.user || "").toLowerCase() !== email;
      })
    : [];

  await db
    .insert(settings)
    .values({ key: "imap_accounts", value: JSON.stringify(accounts) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(accounts), updatedAt: new Date() },
    });

  return NextResponse.json({
    success: true,
    accounts: accounts.map((account) => {
      const row = account as Record<string, unknown>;
      return {
        host: row.host,
        port: row.port,
        email: row.email,
        label: row.label || row.email,
        assignedUserId: row.assignedUserId || null,
      };
    }),
  });
}
