import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string,
  relatedEntityType?: string,
  relatedEntityId?: string
) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      title,
      message,
      type,
      relatedEntityType: relatedEntityType || null,
      relatedEntityId: relatedEntityId || null,
    })
    .returning();
  return notification;
}

export async function getUnreadNotifications(userId: string) {
  return await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .orderBy(desc(notifications.createdAt));
}

export async function markNotificationRead(notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, notificationId))
    .returning();
  return updated;
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return { count: 0 };
  await db
    .update(notifications)
    .set({ read: true })
    .where(inArray(notifications.id, ids));
  return { count: ids.length };
}
