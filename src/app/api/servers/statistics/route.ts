import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, sendingLogs } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { canAccessServer, forbidden } from "@/lib/access-control";

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const serverIds: string[] = Array.isArray(body.serverIds)
    ? Array.from(new Set(body.serverIds.map(String).filter(Boolean)))
    : [];

  if (serverIds.length === 0) {
    return NextResponse.json({ error: "serverIds are required" }, { status: 400 });
  }
  for (const serverId of serverIds) {
    if (!(await canAccessServer(session, serverId))) {
      return forbidden("You can only delete statistics for servers assigned to you.");
    }
  }

  const existingLogs = await db
    .select({ id: sendingLogs.id })
    .from(sendingLogs)
    .where(inArray(sendingLogs.serverId, serverIds));

  await db.delete(sendingLogs).where(inArray(sendingLogs.serverId, serverIds));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete_statistics",
    entityType: "server",
    entityId: serverIds[0],
    previousValue: { serverIds, deletedLogs: existingLogs.length },
  });

  return NextResponse.json({
    success: true,
    serverCount: serverIds.length,
    deletedLogs: existingLogs.length,
  });
}
