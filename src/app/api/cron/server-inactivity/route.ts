import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, sendingLogs, users, serverUsers } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

const CRON_API_KEY = process.env.CRON_API_KEY || "cloudops-cron-key-change-me";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const activeServers = await db
    .select()
    .from(servers)
    .where(eq(servers.status, "active"));

  const alerts: { serverId: string; serverName: string }[] = [];

  for (const server of activeServers) {
    const [result] = await db
      .select({ hasData: sql<boolean>`count(*) > 0` })
      .from(sendingLogs)
      .where(
        and(
          eq(sendingLogs.serverId, server.id),
          gte(sendingLogs.date, twentyFourHoursAgo)
        )
      );

    if (!result?.hasData) {
      alerts.push({ serverId: server.id, serverName: server.name });

      const assigned = await db
        .select({ userId: serverUsers.userId })
        .from(serverUsers)
        .where(eq(serverUsers.serverId, server.id));

      if (assigned.length > 0) {
        for (const row of assigned) {
          await createNotification(
            row.userId,
            "Server Inactivity Alert",
            `Server "${server.name}" has not sent any emails in the last 24 hours.`,
            "server_inactivity",
            "server",
            server.id
          );
        }
      } else {
        const activeUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.status, "active"));

        for (const user of activeUsers) {
          await createNotification(
            user.id,
            "Server Inactivity Alert",
            `Server "${server.name}" has no assigned mailer and has not sent any emails in the last 24 hours.`,
            "server_inactivity",
            "server",
            server.id
          );
        }
      }
    }
  }

  return NextResponse.json({
    checked: activeServers.length,
    alerts: alerts.length,
    servers: alerts,
    timestamp: new Date().toISOString(),
  });
}
