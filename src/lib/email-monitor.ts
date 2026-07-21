import { db } from "@/db";
import { providers, providerResponses, outreachLogs } from "@/db/schema";
import { eq, ilike, and, or, desc } from "drizzle-orm";

export interface EmailData {
  from: string;
  subject: string;
  body: string;
  date: string | Date;
  to?: string;
  attachments?: Array<{ filename?: string; content?: string; contentType?: string }>;
}

export interface EmailProcessingResult {
  matchedProvider: {
    id: string;
    name: string;
    supportEmail: string | null;
    salesEmail: string | null;
  } | null;
  actionTaken: "response_recorded" | "no_match" | "multiple_matches";
  responseId?: string;
  outreachLogId?: string;
  message: string;
}

export async function processEmailResponse(emailData: EmailData): Promise<EmailProcessingResult> {
  const fromLower = emailData.from.toLowerCase();

  const matchedProviders = await db
    .select({
      id: providers.id,
      name: providers.name,
      supportEmail: providers.supportEmail,
      salesEmail: providers.salesEmail,
    })
    .from(providers)
    .where(
      or(
        ilike(providers.supportEmail, `%${fromLower}%`),
        ilike(providers.salesEmail, `%${fromLower}%`)
      )
    )
    .limit(10);

  const actualMatches = matchedProviders.filter(
    (p) =>
      (p.supportEmail && fromLower.includes(p.supportEmail.toLowerCase())) ||
      (p.salesEmail && fromLower.includes(p.salesEmail.toLowerCase()))
  );

  if (actualMatches.length === 0) {
    return {
      matchedProvider: null,
      actionTaken: "no_match",
      message: `No provider found matching email address: ${emailData.from}`,
    };
  }

  if (actualMatches.length > 1) {
    return {
      matchedProvider: null,
      actionTaken: "multiple_matches",
      message: `Multiple providers (${actualMatches.length}) found matching email address: ${emailData.from}. Please check manually.`,
    };
  }

  const matchedProvider = actualMatches[0];

  const responseDate = new Date(emailData.date);

  const responseType = inferResponseType(emailData.subject, emailData.body) as any;

  const [response] = await db
    .insert(providerResponses)
    .values({
      providerId: matchedProvider.id,
      responseDate,
      responseType,
      fullResponse: emailData.body,
      summary: emailData.subject,
      createdById: "00000000-0000-0000-0000-000000000000",
    })
    .returning();

  await db
    .update(providers)
    .set({
      responseStatus: "replied",
      lastContactDate: responseDate,
      updatedAt: new Date(),
    })
    .where(eq(providers.id, matchedProvider.id));

  const [outreachLog] = await db
    .insert(outreachLogs)
    .values({
      providerId: matchedProvider.id,
      channel: "email",
      recipient: emailData.from,
      subject: emailData.subject,
      message: emailData.body,
      sendResult: "replied",
      responseDate: responseDate,
      responseSummary: emailData.body.slice(0, 500),
    })
    .returning();

  return {
    matchedProvider,
    actionTaken: "response_recorded",
    responseId: response.id,
    outreachLogId: outreachLog.id,
    message: `Response from ${matchedProvider.name} recorded successfully.`,
  };
}

function inferResponseType(subject: string, body: string): string {
  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();
  const combined = lowerSubject + " " + lowerBody;

  if (combined.includes("approv") || combined.includes("yes") || combined.includes("confirmed") || combined.includes("accepted")) {
    return "approved";
  }
  if (combined.includes("reject") || combined.includes("denied") || combined.includes("not interested") || combined.includes("unable to")) {
    return "rejected";
  }
  if (combined.includes("verify") || combined.includes("confirmation") || combined.includes("identity")) {
    return "needs_verification";
  }
  if (combined.includes("deposit") || combined.includes("payment") || combined.includes("fee")) {
    return "requires_deposit";
  }
  if (combined.includes("k") || combined.includes("know your customer")) {
    return "requires_kyc";
  }
  if (combined.includes("port 25") || combined.includes("port25") || combined.includes("outbound traffic")) {
    return "port25_blocked";
  }
  if (combined.includes("support") || combined.includes("ticket")) {
    return "requires_support_request";
  }

  return "other";
}