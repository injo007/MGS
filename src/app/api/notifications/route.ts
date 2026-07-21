import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUnreadNotifications, markNotificationsRead } from "@/lib/notifications";
import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import { and, desc, eq, isNull, not, or } from "drizzle-orm";
import { isAdmin, sessionUserId } from "@/lib/access-control";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, urgentTasks] = await Promise.all([
    getUnreadNotifications(session.user.id),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        assignedUserId: tasks.assignedUserId,
        assignedUserName: users.name,
        priority: tasks.priority,
        status: tasks.status,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedUserId, users.id))
      .where(
        and(
          eq(tasks.priority, "urgent"),
          not(eq(tasks.status, "completed")),
          not(eq(tasks.status, "cancelled")),
          isAdmin(session)
            ? undefined
            : or(eq(tasks.assignedUserId, sessionUserId(session)), isNull(tasks.assignedUserId))
        )
      )
      .orderBy(desc(tasks.createdAt))
      .limit(5),
  ]);

  return NextResponse.json({ data: notifications, urgentTasks });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids (non-empty array) is required" }, { status: 400 });
  }

  const result = await markNotificationsRead(body.ids);
  return NextResponse.json(result);
}
