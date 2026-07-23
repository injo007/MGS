import nodemailer from "nodemailer";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

function parseSetting(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getSetting(key: string) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return parseSetting(row?.value);
}

function formatSender(name: string, email: string) {
  return `"${name.replace(/"/g, "'")}" <${email}>`;
}

export async function sendSystemEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const provider = String((await getSetting("system_email_provider")) || "smtp");

  if (provider === "resend") {
    const apiKey = String((await getSetting("resend_api_key")) || process.env.RESEND_API_KEY || "");
    const fromEmail = String((await getSetting("resend_from_email")) || (await getSetting("smtp_from_email")) || "");
    const fromName = String((await getSetting("resend_from_name")) || (await getSetting("smtp_from_name")) || "ServerOps CRM");

    if (!apiKey || !fromEmail) {
      return { sent: false, skipped: true, reason: "Resend is not configured", provider: "resend" };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: formatSender(fromName, fromEmail),
        to: [to],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}${body ? `: ${body}` : ""}`);
    }

    return { sent: true, skipped: false, provider: "resend" };
  }

  const host = String((await getSetting("smtp_host")) || "");
  const port = Number((await getSetting("smtp_port")) || 587);
  const secure = Boolean(await getSetting("smtp_secure"));
  const user = String((await getSetting("smtp_user")) || "");
  const pass = String((await getSetting("smtp_password")) || "");
  const fromEmail = String((await getSetting("smtp_from_email")) || user);
  const fromName = String((await getSetting("smtp_from_name")) || "ServerOps CRM");

  if (!host || !port || !fromEmail) {
    return { sent: false, skipped: true, reason: "SMTP is not configured" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from: formatSender(fromName, fromEmail),
    to,
    subject,
    text,
  });

  return { sent: true, skipped: false, provider: "smtp" };
}
