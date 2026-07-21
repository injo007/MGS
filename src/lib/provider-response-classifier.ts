export type ProviderResponseType =
  | "approved"
  | "rejected"
  | "needs_verification"
  | "requires_deposit"
  | "requires_kyc"
  | "requires_support_request"
  | "port25_blocked"
  | "port25_available"
  | "mail_servers_prohibited"
  | "other";

const PORT_CONTEXT_PATTERNS = [
  /\bport\s*25\b/i,
  /\bport25\b/i,
  /\bsmtp\b/i,
  /\boutbound\s+(?:mail|email|smtp|traffic)\b/i,
  /\boutgoing\s+(?:mail|email|smtp|traffic)\b/i,
  /\bmail\s+server/i,
];

const PORT_AVAILABLE_PATTERNS = [
  /\b(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\s+(?:is|has been|was|will be)?\s*(?:open|opened|enabled|unblocked|allowed|available)\b/i,
  /\b(?:open|opened|enable|enabled|unblock|unblocked|allow|allowed)\s+(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\b/i,
  /\b(?:removed|lifted)\s+(?:the\s+)?(?:block|restriction)\s+(?:on|for)\s+(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\b/i,
  /\b(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\s+(?:is|was)?\s*not\s+(?:blocked|restricted|disabled|closed)\b/i,
  /\b(?:request|ticket)\s+(?:to\s+)?(?:open|enable|unblock)\s+(?:port\s*25|port25|smtp)\s+(?:has been|is|was)?\s*(?:approved|accepted|completed)\b/i,
  /\b(?:approved|accepted)\s+(?:your\s+)?(?:request|ticket)\s+(?:to\s+)?(?:open|enable|unblock)\s+(?:port\s*25|port25|smtp)\b/i,
];

const PORT_BLOCKED_PATTERNS = [
  /\b(?:cannot|can't|can not|unable to|will not|won't|do not|don't)\s+(?:open|enable|unblock|allow)\s+(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\b/i,
  /\b(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\s+(?:is|has been|was|will remain|remains|still)\s*(?:blocked|closed|disabled|restricted)\b/i,
  /\b(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\s+(?:is|was)?\s*not\s+(?:available|allowed|permitted|supported)\b/i,
  /\b(?:we|they|provider|network|firewall|system)\s+(?:block|blocked|close|closed|disable|disabled|restrict|restricted)\s+(?:port\s*25|port25|smtp|outbound\s+smtp|outgoing\s+smtp)\b/i,
  /\b(?:request|ticket)\s+(?:to\s+)?(?:open|enable|unblock)\s+(?:port\s*25|port25|smtp)\s+(?:has been|is|was)?\s*(?:denied|rejected|declined|refused)\b/i,
  /\b(?:denied|rejected|declined|refused)\s+(?:your\s+)?(?:request|ticket)\s+(?:to\s+)?(?:open|enable|unblock)\s+(?:port\s*25|port25|smtp)\b/i,
];

const MAIL_PROHIBITED_PATTERNS = [
  /\bmail\s+servers?\s+(?:are|is)?\s*(?:not\s+allowed|not\s+permitted|prohibited|forbidden|banned)\b/i,
  /\b(?:bulk|mass|marketing)\s+(?:mail|email|mailing)\s+(?:is|are)?\s*(?:not\s+allowed|not\s+permitted|prohibited|forbidden|banned)\b/i,
  /\b(?:spam|anti-spam|abuse)\s+policy\s+(?:does\s+not\s+allow|prohibits|forbids)\s+(?:mail|email|smtp|mail\s+servers?)\b/i,
];

function normalizedText(subject: string, body: string) {
  return `${subject || ""} ${body || ""}`.replace(/\s+/g, " ").trim();
}

function anyMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function inferResponseType(subject: string, body: string): ProviderResponseType {
  const combined = normalizedText(subject, body);
  const lower = combined.toLowerCase();
  const mentionsPort25 = anyMatch(combined, PORT_CONTEXT_PATTERNS);

  if (anyMatch(combined, MAIL_PROHIBITED_PATTERNS)) {
    return "mail_servers_prohibited";
  }

  if (mentionsPort25 && anyMatch(combined, PORT_BLOCKED_PATTERNS)) {
    return "port25_blocked";
  }

  if (mentionsPort25 && anyMatch(combined, PORT_AVAILABLE_PATTERNS)) {
    return "port25_available";
  }

  if (lower.includes("kyc") || lower.includes("know your customer")) {
    return "requires_kyc";
  }
  if (lower.includes("verify") || lower.includes("confirmation") || lower.includes("identity")) {
    return "needs_verification";
  }
  if (lower.includes("deposit") || lower.includes("payment") || lower.includes("fee") || lower.includes("cost")) {
    return "requires_deposit";
  }
  if (lower.includes("support") || lower.includes("ticket") || lower.includes("help desk")) {
    return "requires_support_request";
  }
  if (lower.includes("reject") || lower.includes("denied") || lower.includes("declined") || lower.includes("not interested") || lower.includes("unable to")) {
    return "rejected";
  }
  if (lower.includes("approv") || lower.includes("yes") || lower.includes("confirmed") || lower.includes("accepted")) {
    return "approved";
  }

  return "other";
}

export function providerUpdateForResponse(responseType: string, responseDate: Date) {
  const base = {
    contactStatus: "contacted" as const,
    responseStatus: "replied" as const,
    lastContactDate: responseDate,
    updatedAt: new Date(),
  };

  if (responseType === "approved" || responseType === "port25_available") {
    return {
      ...base,
      decision: "accepted" as const,
      mailServerAllowed: true,
      port25Status: responseType === "port25_available" ? ("available" as const) : undefined,
      sendingRestrictions: responseType === "port25_available" ? null : undefined,
    };
  }

  if (responseType === "rejected") {
    return { ...base, decision: "denied" as const };
  }

  if (responseType === "mail_servers_prohibited" || responseType === "port25_blocked") {
    return {
      ...base,
      decision: "prohibited_sending" as const,
      mailServerAllowed: false,
      port25Status: responseType === "port25_blocked" ? ("blocked" as const) : undefined,
      sendingRestrictions: responseType === "mail_servers_prohibited" ? "Provider response prohibits mail server use." : "Provider response indicates Port 25/outbound SMTP is blocked or denied.",
    };
  }

  return { ...base, decision: "pending" as const, responseStatus: "needs_follow_up" as const };
}
