import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, serverUsers } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

export type SessionLike = {
  user?: {
    id?: string;
    roleName?: string | null;
  } | null;
} | null;

export function sessionUserId(session: SessionLike) {
  return session?.user?.id || "";
}

export function isAdmin(session: SessionLike) {
  return String(session?.user?.roleName || "").toLowerCase() === "admin";
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function canAccessServer(session: SessionLike, serverId: string) {
  if (isAdmin(session)) return true;
  const userId = sessionUserId(session);
  if (!userId) return false;

  const [assignment] = await db
    .select({ id: serverUsers.id })
    .from(serverUsers)
    .innerJoin(servers, eq(servers.id, serverUsers.serverId))
    .where(and(eq(serverUsers.serverId, serverId), eq(serverUsers.userId, userId), ne(servers.status, "archived")))
    .limit(1);

  return Boolean(assignment);
}
