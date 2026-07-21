import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs, providers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { detectProviderCountry } from "@/lib/provider-country";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;

  const rows = await db.select().from(providers);
  const targets = rows.filter((provider) => {
    if (provider.country) return false;
    if (ids && !ids.includes(provider.id)) return false;
    return true;
  });

  let updated = 0;
  const detected: Array<{ id: string; name: string; country: string; source: string }> = [];

  for (const provider of targets) {
    const result = detectProviderCountry({
      website: provider.website,
      supportEmail: provider.supportEmail,
      salesEmail: provider.salesEmail,
    });
    if (!result) continue;

    await db
      .update(providers)
      .set({ country: result.country, updatedAt: new Date() })
      .where(eq(providers.id, provider.id));
    updated++;
    detected.push({ id: provider.id, name: provider.name, country: result.country, source: result.source });
  }

  await db.insert(auditLogs).values({
    userId: session.user.id,
    action: "detect_country",
    entityType: "provider",
    entityId: ids?.[0] || null,
    newValue: { checked: targets.length, updated, detected },
  });

  return NextResponse.json({ checked: targets.length, updated, detected });
}
