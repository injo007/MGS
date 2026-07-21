import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { forbidden, isAdmin } from "@/lib/access-control";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) return forbidden("Roles are available to admins only.");

  const data = await db.select().from(roles).orderBy(roles.name);
  return NextResponse.json({ data });
}
