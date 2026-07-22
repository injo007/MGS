export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "CloudOps CRM";

export const DEFAULT_CURRENCY = "USD";

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "INR",
  "BRL",
] as const;

export const SENDING_WARNING_THRESHOLDS = {
  BOUNCE_RATE_WARNING: 5,
  BOUNCE_RATE_CRITICAL: 10,
  COMPLAINT_RATE_WARNING: 0.1,
  COMPLAINT_RATE_CRITICAL: 0.5,
  UNSUBSCRIBE_RATE_WARNING: 1,
  UNSUBSCRIBE_RATE_CRITICAL: 3,
} as const;

export const PAGINATION_DEFAULTS = {
  PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

export const PROVIDER_CATEGORIES = [
  "VPS Provider",
  "Cloud Provider",
  "Dedicated Server",
  "Shared Hosting",
  "Email Hosting",
  "Bare Metal",
  "Colocation",
  "Other",
] as const;

export const SERVER_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "public", label: "Public" },
  { value: "down", label: "Down" },
  { value: "port_closed", label: "Port Closed" },
  { value: "ts04_error", label: "TSS04" },
  { value: "bounce", label: "Bounce" },
  { value: "complaint", label: "Complaint" },
] as const;

export const PROVIDER_STATUSES = {
  CONTACT_STATUS: [
    { value: "not_contacted", label: "Not Contacted", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    { value: "ready_to_contact", label: "Ready to Contact", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
    { value: "contacted", label: "Contacted", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" },
    { value: "follow_up_due", label: "Follow-up Due", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
    { value: "closed", label: "Closed", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  ],
  RESPONSE_STATUS: [
    { value: "not_sent", label: "Not Sent", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    { value: "no_response", label: "No Response", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
    { value: "replied", label: "Replied", color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
    { value: "needs_follow_up", label: "Needs Follow-up", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  ],
  DECISION: [
    { value: "pending", label: "Pending", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
    { value: "accepted", label: "Accepted", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
    { value: "denied", label: "Denied", color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
    { value: "prohibited_sending", label: "Prohibited", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300" },
    { value: "not_suitable", label: "Not Suitable", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  ],
} as const;
