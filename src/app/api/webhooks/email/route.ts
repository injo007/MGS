import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { processEmailResponse, EmailData } from "@/lib/email-monitor";

export async function POST(request: Request) {
  try {
    const secretHeader = request.headers.get("X-Webhook-Secret");
    const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;

    if (expectedSecret && secretHeader !== expectedSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: EmailData = await request.json();

    if (!body.from || !body.subject || !body.body) {
      return NextResponse.json(
        { error: "Missing required fields: from, subject, body" },
        { status: 400 }
      );
    }

    const result = await processEmailResponse(body);

    try {
      await db.insert(auditLogs).values({
        userId: "00000000-0000-0000-0000-000000000000",
        action: "email_webhook_received",
        entityType: "email",
        newValue: {
          from: body.from,
          subject: body.subject,
          actionTaken: result.actionTaken,
        },
      });
    } catch {
      // non-fatal
    }

    if (result.actionTaken === "response_recorded") {
      return NextResponse.json(result, { status: 201 });
    } else if (result.actionTaken === "no_match") {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 200 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
