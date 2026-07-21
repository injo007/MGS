import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ipAddresses, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessServer, forbidden } from "@/lib/access-control";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [ip] = await db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.id, id))
    .limit(1);

  if (!ip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, ip.serverId))) {
    return forbidden("You can only access IPs on servers assigned to you.");
  }

  return NextResponse.json(ip);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const [existing] = await db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, existing.serverId))) {
    return forbidden("You can only edit IPs on servers assigned to you.");
  }
  if (body.serverId && !(await canAccessServer(session, String(body.serverId)))) {
    return forbidden("You can only move IPs to servers assigned to you.");
  }

  const [updated] = await db
    .update(ipAddresses)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(ipAddresses.id, id))
    .returning();

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "update",
    entityType: "ip_address",
    entityId: id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(ipAddresses)
    .where(eq(ipAddresses.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessServer(session, existing.serverId))) {
    return forbidden("You can only delete IPs on servers assigned to you.");
  }

  await db.delete(ipAddresses).where(eq(ipAddresses.id, id));

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "delete",
    entityType: "ip_address",
    entityId: id,
    previousValue: existing,
  });

  return new NextResponse(null, { status: 204 });
}
