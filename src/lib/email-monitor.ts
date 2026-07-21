import { db } from "@/db";
import { providers, providerResponses, outreachLogs } from "@/db/schema";
import { eq, ilike, or } from "drizzle-orm";
import { inferResponseType, providerUpdateForResponse } from "@/lib/provider-response-classifier";

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
  const providerUpdate = providerUpdateForResponse(responseType, responseDate);

  const [response] = await db
    .insert(providerResponses)
    .values({
      providerId: matchedProvider.id,
      responseDate,
      responseType,
      fullResponse: emailData.body,
      summary: emailData.subject,
      decisionRecommendation: providerUpdate.decision,
      createdById: "00000000-0000-0000-0000-000000000000",
    })
    .returning();

  await db
    .update(providers)
    .set(providerUpdate)
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
