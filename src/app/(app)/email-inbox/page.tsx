"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Link as LinkIcon,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Unlink,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProviderLogo } from "@/components/shared/provider-logo";
import { toast } from "sonner";

interface InboxEmail {
  uid: number;
  messageId: string | null;
  mailbox?: string;
  sourceEmail?: string;
  sourceLabel?: string;
  direction?: "incoming" | "outgoing";
  from: string;
  fromName: string | null;
  fromAddress: string;
  to?: string;
  toAddresses?: string[];
  subject: string;
  date: string;
  matchedProvider: string | null;
  matchedProviderId: string | null;
  matchedProviderWebsite: string | null;
  responseType: string;
  bodyPreview: string;
  bodyText: string;
  seen: boolean;
}

interface SyncStatus {
  configured: boolean;
  lastSync: {
    timestamp: string;
    processed: number;
    matched: number;
    unmatched: number;
    errors: string[];
    emails: InboxEmail[];
  } | null;
}

interface InboxResponse {
  configured: boolean;
  data: InboxEmail[];
  lastSync: SyncStatus["lastSync"];
  source: "cache" | "daily-sync";
  error?: string;
}

interface ImapAccount {
  host: string;
  port: number;
  email: string;
  label: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface ProviderConversationGroup {
  key: string;
  providerId: string | null;
  providerName: string;
  providerWebsite: string | null;
  emails: InboxEmail[];
  latest: InboxEmail;
  sentCount: number;
  receivedCount: number;
  sourceEmails: string[];
}

const RESPONSE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: "Approved", color: "text-[#16A34A]", bg: "bg-[#ECFDF5]" },
  rejected: { label: "Rejected", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  needs_verification: { label: "Needs Verification", color: "text-[#D97706]", bg: "bg-[#FFFBEB]" },
  requires_deposit: { label: "Requires Deposit", color: "text-[#EA580C]", bg: "bg-[#FFF7ED]" },
  requires_kyc: { label: "Requires KYC", color: "text-[#7C3AED]", bg: "bg-[#F5F3FF]" },
  requires_support_request: { label: "Support Request", color: "text-[#2563EB]", bg: "bg-[#EFF6FF]" },
  port25_blocked: { label: "Port 25 Blocked", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  port25_available: { label: "Port 25 Available", color: "text-[#16A34A]", bg: "bg-[#ECFDF5]" },
  mail_servers_prohibited: { label: "Mail Prohibited", color: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  other: { label: "Other", color: "text-[#6B7280]", bg: "bg-[#F3F4F6]" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function responseConfig(type: string) {
  return RESPONSE_TYPE_CONFIG[type] || RESPONSE_TYPE_CONFIG.other;
}

const KPI_ITEMS: Array<{
  label: string;
  key: "emails" | "providers" | "accounts" | "last";
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}> = [
  { label: "Conversation Emails", key: "emails", icon: Mail, color: "text-[#2563EB]", bg: "bg-[#EFF6FF]" },
  { label: "Providers", key: "providers", icon: LinkIcon, color: "text-[#16A34A]", bg: "bg-[#ECFDF5]" },
  { label: "Synced Accounts", key: "accounts", icon: Unlink, color: "text-[#EA580C]", bg: "bg-[#FFF7ED]" },
  { label: "Last Analyze", key: "last", icon: CheckCircle2, color: "text-[#7C3AED]", bg: "bg-[#F5F3FF]" },
];

export default function EmailInboxPage() {
  const { data: session } = useSession();
  const admin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ host: "imap.gmail.com", port: "993", email: "", password: "", label: "", assignedUserId: "" });
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [testing, setTesting] = useState(false);
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/email/imap-config");
    if (!res.ok) return;
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setUsers(data.users ?? []);
    setConfigForm((current) => ({
      ...current,
      host: data.host || current.host,
      port: String(data.port || current.port),
      email: "",
      password: "",
      label: "",
      assignedUserId: "",
    }));
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/email/imap-sync");
    if (!res.ok) return;
    const data = await res.json();
    setSyncStatus(data);
  }, []);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500", sync: "daily" });
      if (admin && sourceFilter !== "all") params.set("sourceEmail", sourceFilter);
      const res = await fetch(`/api/email/inbox?${params.toString()}`);
      const data: InboxResponse = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load conversations");
      setEmails(data.data ?? []);
      setSyncStatus((current) => ({
        configured: Boolean(data.configured),
        lastSync: data.lastSync ?? current?.lastSync ?? null,
      }));
      if (data.source === "daily-sync") toast.success("Daily conversation sync completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [admin, sourceFilter]);

  useEffect(() => {
    fetchConfig();
    fetchStatus().finally(fetchInbox);
  }, [fetchConfig, fetchInbox, fetchStatus]);

  useEffect(() => {
    if (!admin || sourceFilter === "all") return;
    const stillConfigured = accounts.some((account) => account.email.toLowerCase() === sourceFilter.toLowerCase());
    if (!stillConfigured) setSourceFilter("all");
  }, [accounts, admin, sourceFilter]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/email/imap-sync", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Sync failed");
      setSyncStatus((prev) => prev ? { ...prev, lastSync: { ...result, timestamp: new Date().toISOString() } } : prev);
      toast.success(`Saved conversations: ${result.processed} provider emails synced from ${accounts.length || 1} account${(accounts.length || 1) === 1 ? "" : "s"}`);
      await fetchInbox();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleTestConfig = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/email/imap-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      toast.success("IMAP connection saved");
      setConfigForm({ host: configForm.host, port: configForm.port, email: "", password: "", label: "", assignedUserId: "" });
      await fetchConfig();
      await fetchStatus();
      await fetchInbox();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveAccount = async (email: string) => {
    setTesting(true);
    try {
      const res = await fetch("/api/email/imap-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove account");
      await fetchConfig();
      toast.success("Mailbox removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove account");
    } finally {
      setTesting(false);
    }
  };

  const handleAssignAccount = async (email: string, assignedUserId: string) => {
    setTesting(true);
    try {
      const res = await fetch("/api/email/imap-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, assignedUserId: assignedUserId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to assign mailbox");
      await fetchConfig();
      toast.success("Mailbox assignment updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign mailbox");
    } finally {
      setTesting(false);
    }
  };

  const handleMailboxAction = async (email: InboxEmail, action: "archive" | "delete") => {
    const key = `${action}-${email.uid}`;
    setActionLoading(key);
    try {
      const res = await fetch("/api/email/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: email.uid, sourceEmail: email.sourceEmail, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} email`);
      setEmails((current) => current.filter((item) => item.uid !== email.uid));
      toast.success(action === "archive" ? "Email archived" : "Email moved to trash");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} email`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApply = async (email: InboxEmail, createProvider: boolean) => {
    const key = `${createProvider ? "create" : "apply"}-${email.uid}`;
    setActionLoading(key);
    try {
      const res = await fetch("/api/email/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: email.uid, sourceEmail: email.sourceEmail, createProvider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply email");
      toast.success(`${data.providerName || "Provider"} conversation saved`);
      await fetchInbox();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply email");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails.filter((email) => {
      if (q && ![email.from, email.fromAddress, email.to || "", email.subject, email.bodyPreview, email.matchedProvider || "", email.sourceEmail || ""].some((value) => value.toLowerCase().includes(q))) return false;
      if (typeFilter !== "all" && email.responseType !== typeFilter) return false;
      if (matchFilter === "matched" && !email.matchedProviderId) return false;
      if (matchFilter === "unmatched" && email.matchedProviderId) return false;
      return true;
    });
  }, [emails, matchFilter, search, typeFilter]);

  const sourceAccountCount = new Set(emails.map((email) => email.sourceEmail).filter(Boolean)).size || accounts.length;
  const grouped = useMemo<ProviderConversationGroup[]>(() => {
    const map = new Map<string, InboxEmail[]>();
    for (const email of filtered) {
      const key = email.matchedProviderId || email.matchedProvider || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(email);
    }

    return Array.from(map.entries())
      .map(([key, groupEmails]) => {
        const sorted = [...groupEmails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latest = sorted[0];
        return {
          key,
          providerId: latest.matchedProviderId,
          providerName: latest.matchedProvider || "Unknown Provider",
          providerWebsite: latest.matchedProviderWebsite || null,
          emails: sorted,
          latest,
          sentCount: sorted.filter((email) => email.direction === "outgoing").length,
          receivedCount: sorted.filter((email) => email.direction !== "outgoing").length,
          sourceEmails: Array.from(new Set(sorted.map((email) => email.sourceEmail || email.sourceLabel).filter(Boolean))) as string[],
        };
      })
      .sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());
  }, [filtered]);
  const selectedGroup = grouped.find((group) => group.key === selectedProviderKey) || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#111827]">Provider Conversations</h1>
          <p className="mt-0.5 text-[13px] text-[#6B7280]">Saved provider email history. It syncs inbox replies and sent emails once per day or when you analyze manually.</p>
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <button onClick={() => setShowConfig(true)} className="flex h-[34px] items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]">
              <Settings className="h-3.5 w-3.5" /> Configure
            </button>
          )}
          <button onClick={fetchInbox} disabled={loading} className="flex h-[34px] items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB] disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Reload Saved
          </button>
          <button onClick={handleSync} disabled={syncing || syncStatus?.configured === false} className="flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {syncing ? "Analyzing..." : "Sync Conversations"}
          </button>
        </div>
      </div>

      {syncStatus?.configured === false && !loading && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-[13px] font-medium text-amber-800">IMAP is not configured</p>
              <p className="mt-1 text-[12px] text-amber-700">Click Configure and save IMAP credentials. Saved provider conversations will still be shown if a cache already exists.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {KPI_ITEMS.map(({ label, key, icon: Icon, color, bg }) => {
          const value = key === "emails" ? emails.length : key === "providers" ? grouped.length : key === "accounts" ? sourceAccountCount : syncStatus?.lastSync ? timeAgo(syncStatus.lastSync.timestamp) : "Never";
          return (
          <div key={label} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${bg} ${color}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-[#6B7280]">{label}</p>
                <p className="mt-1 text-[20px] font-bold leading-none text-[#111827]">{String(value)}</p>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sender, subject, or content..." className="h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]">
          <option value="all">All Response Types</option>
          {Object.entries(RESPONSE_TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
        </select>
        <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)} className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]">
          <option value="all">All Conversations</option>
          <option value="matched">Matched</option>
          <option value="unmatched">Unmatched</option>
        </select>
        {admin && (
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-[34px] max-w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]">
            <option value="all">All Mailboxes</option>
            {accounts.map((account) => (
              <option key={account.email} value={account.email}>
                {(account.label || account.email)} · {account.email}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[132px] animate-pulse rounded-[10px] border border-[#E5E7EB] bg-white" />)
        ) : grouped.length === 0 ? (
          <div className="grid h-[240px] place-items-center rounded-[10px] border border-[#E5E7EB] bg-white text-center">
            <div>
              <Inbox className="mx-auto h-8 w-8 text-[#9CA3AF]" />
              <p className="mt-3 text-[13px] font-semibold text-[#111827]">No provider conversations found</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">Reload saved conversations, sync manually, or adjust filters.</p>
            </div>
          </div>
        ) : (
          grouped.map((group) => {
            const latest = group.latest;
            const cfg = responseConfig(latest.responseType);
            const isOutgoing = latest.direction === "outgoing";
            return (
              <article key={group.key} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="flex gap-4 max-lg:flex-col">
                  <button onClick={() => setSelectedProviderKey(group.key)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-start gap-3">
                      <ProviderLogo name={group.providerName} website={group.providerWebsite} size="md" className="mt-0.5 h-9 w-9 rounded-[8px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${isOutgoing ? "bg-[#EEF2FF] text-[#4F46E5]" : `${cfg.bg} ${cfg.color}`}`}>{isOutgoing ? "Sent by us" : cfg.label}</span>
                          <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]">
                            <CheckCircle2 className="h-3 w-3" /> {group.providerName}
                          </span>
                          <span className="rounded-[5px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#4B5563]">{group.emails.length} emails</span>
                          <span className="text-[12px] text-[#9CA3AF]">{timeAgo(latest.date)}</span>
                        </div>
                        <h2 className="mt-2 truncate text-[15px] font-bold text-[#111827]">{group.providerName}</h2>
                        <p className="mt-1 text-[12px] font-semibold text-[#374151]">Latest: {latest.subject}</p>
                        <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{group.receivedCount} received / {group.sentCount} sent</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {group.sourceEmails.map((source) => (
                        <span key={source} className="rounded-[5px] bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">{source}</span>
                      ))}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#6B7280]">{latest.bodyPreview || "No readable preview available."}</p>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-start gap-2 lg:justify-end">
                    <button onClick={() => setSelectedProviderKey(group.key)} className="inline-flex h-[32px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3 text-[12px] font-semibold text-white">
                      Open Conversation
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {selectedGroup && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full justify-end bg-black/20">
          <div className="h-full w-full max-w-[760px] overflow-y-auto border-l border-[#E5E7EB] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProviderLogo name={selectedGroup.providerName} website={selectedGroup.providerWebsite} size="md" className="h-9 w-9 rounded-[8px]" />
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-bold text-[#111827]">{selectedGroup.providerName}</h2>
                  <p className="mt-0.5 text-[12px] text-[#6B7280]">
                    {selectedGroup.emails.length} emails · {selectedGroup.receivedCount} received · {selectedGroup.sentCount} sent
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedProviderKey(null)} className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[#6B7280] hover:bg-[#F3F4F6]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {selectedGroup.emails.map((email) => {
                const isOutgoing = email.direction === "outgoing";
                const cfg = responseConfig(email.responseType);
                return (
                  <article key={`${email.sourceEmail || "mailbox"}-${email.mailbox}-${email.uid}`} className={`rounded-[10px] border p-4 ${isOutgoing ? "border-[#C7D2FE] bg-[#F8FAFF]" : "border-[#E5E7EB] bg-white"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${isOutgoing ? "bg-[#EEF2FF] text-[#4F46E5]" : `${cfg.bg} ${cfg.color}`}`}>
                            {isOutgoing ? "Sent by us" : cfg.label}
                          </span>
                          <span className="rounded-[5px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#4B5563]">{email.mailbox || (isOutgoing ? "Sent" : "INBOX")}</span>
                          <span className="rounded-[5px] bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">{email.sourceLabel || email.sourceEmail || "Mailbox"}</span>
                        </div>
                        <h3 className="mt-2 text-[14px] font-bold text-[#111827]">{email.subject}</h3>
                        <p className="mt-1 text-[12px] text-[#374151]">From: {email.from || "—"}</p>
                        <p className="mt-0.5 text-[12px] text-[#374151]">To: {email.to || email.toAddresses?.join(", ") || "—"}</p>
                      </div>
                      <p className="text-[12px] font-medium text-[#6B7280]">{new Date(email.date).toLocaleString()}</p>
                    </div>
                    <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#E5E7EB] bg-white p-3 text-[12px] leading-5 text-[#374151]">{email.bodyText || email.bodyPreview || "No readable body."}</pre>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button onClick={() => handleApply(email, false)} disabled={!email.matchedProviderId || actionLoading === `apply-${email.uid}`} className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3 text-[12px] font-semibold text-white disabled:opacity-50">
                        {actionLoading === `apply-${email.uid}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Save to Provider
                      </button>
                      <button onClick={() => handleMailboxAction(email, "archive")} disabled={isOutgoing || actionLoading === `archive-${email.uid}`} className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] disabled:opacity-50">Archive</button>
                      <button onClick={() => handleMailboxAction(email, "delete")} disabled={isOutgoing || actionLoading === `delete-${email.uid}`} className="h-[30px] rounded-[7px] border border-[#FECACA] bg-white px-3 text-[12px] font-semibold text-[#DC2626] disabled:opacity-50">Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>IMAP Accounts</DialogTitle>
            <DialogDescription>Add every mailbox used to contact providers. Sync scans provider-matched inbox and sent mail only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {accounts.length > 0 && (
              <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                <p className="mb-2 text-[12px] font-semibold uppercase text-[#6B7280]">Configured Mailboxes</p>
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.email} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#111827]">{account.label || account.email}</p>
                        <p className="truncate text-[12px] text-[#6B7280]">{account.email} · {account.host}:{account.port}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-[#4F46E5]">{account.assignedUserName ? `Assigned to ${account.assignedUserName}` : "Unassigned"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <select
                          value={account.assignedUserId || ""}
                          onChange={(event) => handleAssignAccount(account.email, event.target.value)}
                          disabled={testing}
                          className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#374151] disabled:opacity-50"
                        >
                          <option value="">Unassigned</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                          ))}
                        </select>
                        <button onClick={() => handleRemoveAccount(account.email)} disabled={testing} className="h-[30px] rounded-[7px] border border-[#FECACA] px-3 text-[12px] font-semibold text-[#DC2626] disabled:opacity-50">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              Account Label
              <input value={configForm.label} onChange={(e) => setConfigForm({ ...configForm, label: e.target.value })} placeholder="Sales inbox, Support inbox..." className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              IMAP Host *
              <input value={configForm.host} onChange={(e) => setConfigForm({ ...configForm, host: e.target.value })} placeholder="imap.gmail.com" className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              Port
              <input value={configForm.port} onChange={(e) => setConfigForm({ ...configForm, port: e.target.value })} placeholder="993" className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              Email *
              <input type="email" value={configForm.email} onChange={(e) => setConfigForm({ ...configForm, email: e.target.value })} placeholder="your-email@gmail.com" className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              Assigned User
              <select
                value={configForm.assignedUserId}
                onChange={(e) => setConfigForm({ ...configForm, assignedUserId: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-[13px] font-medium text-[#374151]">
              App Password *
              <input type="password" value={configForm.password} onChange={(e) => setConfigForm({ ...configForm, password: e.target.value })} placeholder="Google App Password" className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20" />
            </label>
          </div>
          <DialogFooter>
            <button onClick={() => setShowConfig(false)} className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]">Cancel</button>
            <button onClick={handleTestConfig} disabled={testing || !configForm.email || !configForm.password} className="flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3.5 text-[13px] font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
              {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {testing ? "Testing..." : "Test & Add Mailbox"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
