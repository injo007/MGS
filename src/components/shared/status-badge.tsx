"use client";

import { cn } from "@/lib/utils";

export type StatusVariant = "default" | "success" | "warning" | "danger" | "info" | "muted" | "negotiating" | "replied";

const variantClasses: Record<StatusVariant, string> = {
  default: "bg-[#DBEAFE] text-[#1D4ED8]",
  success: "bg-[#DCFCE7] text-[#15803D]",
  warning: "bg-[#FEF3C7] text-[#B45309]",
  danger: "bg-[#FEE2E2] text-[#B91C1C]",
  info: "bg-[#EFF6FF] text-[#2563EB]",
  muted: "bg-[#F3F4F6] text-[#4B5563]",
  negotiating: "bg-[#FEF3C7] text-[#B45309]",
  replied: "bg-[#F3E8FF] text-[#7E22CE]",
};

export const STATUS_CONFIG: Record<string, { variant: StatusVariant; label: string }> = {
  not_contacted: { variant: "muted", label: "Not Contacted" },
  ready_to_contact: { variant: "info", label: "Ready to Contact" },
  contacted: { variant: "default", label: "Contacted" },
  follow_up_due: { variant: "warning", label: "Follow-up Due" },
  closed: { variant: "muted", label: "Closed" },
  not_sent: { variant: "muted", label: "Not Sent" },
  no_response: { variant: "warning", label: "No Response" },
  replied: { variant: "replied", label: "Replied" },
  needs_follow_up: { variant: "warning", label: "Needs Follow-up" },
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "success", label: "Accepted" },
  denied: { variant: "danger", label: "Denied" },
  prohibited_sending: { variant: "danger", label: "Prohibited" },
  not_suitable: { variant: "muted", label: "Not Suitable" },
  available: { variant: "success", label: "Available" },
  active: { variant: "success", label: "Active" },
  configured: { variant: "success", label: "Configured" },
  blocked: { variant: "danger", label: "Blocked" },
  pending_config: { variant: "warning", label: "Pending Config" },
  unknown: { variant: "muted", label: "Unknown" },
  delivered: { variant: "success", label: "Delivered" },
  sent: { variant: "info", label: "Sent" },
  bounced: { variant: "danger", label: "Bounced" },
  failed: { variant: "danger", label: "Failed" },
  warming: { variant: "warning", label: "Warming" },
  paused: { variant: "warning", label: "Paused" },
  suspended: { variant: "danger", label: "Suspended" },
  cancelled: { variant: "danger", label: "Cancelled" },
  expired: { variant: "danger", label: "Expired" },
  retired: { variant: "muted", label: "Retired" },
  unused: { variant: "muted", label: "Unused" },
  public: { variant: "info", label: "Public" },
  down: { variant: "danger", label: "Down" },
  port_closed: { variant: "danger", label: "Port Closed" },
  ts04_error: { variant: "danger", label: "TSS04" },
  tss09_error: { variant: "danger", label: "TSS09" },
  bounce: { variant: "danger", label: "Bounce" },
  complaint: { variant: "danger", label: "Complaint" },
};

export function getStatusConfig(value: string | null | undefined): { variant: StatusVariant; label: string } {
  if (!value) return { variant: "muted", label: "—" };
  return STATUS_CONFIG[value] ?? { variant: "muted", label: value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}

export function StatusBadge({
  value,
  label,
  className,
}: {
  value?: string | null;
  label?: string;
  className?: string;
}) {
  const config = getStatusConfig(value);
  const displayLabel = label ?? config.label;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        variantClasses[config.variant],
        className
      )}
    >
      {displayLabel}
    </span>
  );
}
