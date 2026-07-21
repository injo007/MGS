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

export async function sendSystemEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
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
    from: `"${fromName.replace(/"/g, "'")}" <${fromEmail}>`,
    to,
    subject,
    text,
  });

  return { sent: true, skipped: false };
}
