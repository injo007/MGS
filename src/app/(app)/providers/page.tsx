"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProviderLogo } from "@/components/shared/provider-logo";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  X,
  Edit,
  Trash2,
  Globe2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useCallback, useRef } from "react";
import { getCountryFlagUrl } from "@/lib/provider-utils";

interface Provider {
  id: string;
  name: string;
  website: string | null;
  supportEmail: string | null;
  salesEmail: string | null;
  contactFormUrl: string | null;
  country: string | null;
  region: string | null;
  category: string | null;
  contactStatus: string;
  responseStatus: string;
  decision: string;
  dateFirstContacted: string | null;
  nextFollowUpDate: string | null;
  port25Status: string | null;
  ptrStatus: string | null;
  ipv4Available: boolean | null;
  ipv6Available: boolean | null;
  mailServerAllowed: boolean | null;
  sendingRestrictions: string | null;
  abusePolicyNotes: string | null;
  notes: string | null;
  dailyLimit: number | null;
  hourlyLimit: number | null;
  startingPrice: string | null;
  currency: string | null;
  billingMethod: string | null;
  paymentMethod: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  assignedUsers: Array<{
    id: string;
    name: string;
    email: string;
    source: "provider" | "contact" | "server" | "creator";
  }>;
  contactedUsers: Array<{
    id: string;
    name: string;
    email: string;
    source: "inbox" | "outreach" | "fallback";
  }>;
  lastContactDate: string | null;
  totalServers: number;
  activeServers: number;
  totalSends: number;
  totalSuccessful: number;
  score: number;
}

interface ProvidersResponse {
  data: Provider[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}

function formatMoney(value: string | null, currency = "USD") {
  const amount = Number(value || 0);
  if (!amount) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function providerRowTone(provider: Provider) {
  if (provider.totalServers > 0) {
    return "border-l-4 border-l-[#22C55E] bg-white shadow-[inset_8px_0_14px_-16px_rgba(34,197,94,0.55)] hover:bg-[#F8FAFC]";
  }
  if (provider.contactStatus === "contacted" || provider.responseStatus === "replied") {
    return "border-l-4 border-l-[#6366F1] bg-white shadow-[inset_8px_0_14px_-16px_rgba(99,102,241,0.5)] hover:bg-[#F8FAFC]";
  }
  if (provider.contactStatus === "follow_up_due" || provider.responseStatus === "needs_follow_up") {
    return "border-l-4 border-l-[#F59E0B] bg-white shadow-[inset_8px_0_14px_-16px_rgba(245,158,11,0.5)] hover:bg-[#F8FAFC]";
  }
  if (provider.contactStatus === "not_contacted" || provider.contactStatus === "ready_to_contact") {
    return "border-l-4 border-l-[#CBD5E1] bg-white shadow-[inset_8px_0_14px_-16px_rgba(100,116,139,0.35)] hover:bg-[#F8FAFC]";
  }
  return "border-l-4 border-l-transparent bg-white hover:bg-[#F8FAFC]";
}

function providerNote(provider: Provider) {
  return provider.notes || provider.abusePolicyNotes || provider.sendingRestrictions || "—";
}

function assignedUserChipClass(source: Provider["assignedUsers"][number]["source"]) {
  if (source === "contact") return "bg-[#ECFEFF] text-[#0891B2]";
  if (source === "server") return "bg-[#ECFDF5] text-[#15803D]";
  return "bg-[#EEF2FF] text-[#4F46E5]";
}

function contactedUserChipClass(source: Provider["contactedUsers"][number]["source"]) {
  if (source === "inbox") return "bg-[#ECFEFF] text-[#0891B2]";
  if (source === "outreach") return "bg-[#EEF2FF] text-[#4F46E5]";
  return "bg-[#F3F4F6] text-[#4B5563]";
}

export default function ProvidersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingProviders, setDeletingProviders] = useState<Record<string, boolean>>({});
  const [detectingCountries, setDetectingCountries] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProviders = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (contactFilter !== "all") params.set("contactStatus", contactFilter);
    if (decisionFilter !== "all") params.set("decision", decisionFilter);
    params.set("sortBy", "score");
    params.set("sortOrder", "desc");

    try {
      const res = await fetch(`/api/providers?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch providers");
      const json: ProvidersResponse = await res.json();
      setProviders(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, contactFilter, decisionFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProviders();
  }, [fetchProviders]);

  const toggleAll = () => {
    if (selectedIds.length === providers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(providers.map((p) => p.id));
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDecisionFilter("all");
    setContactFilter("all");
    setPage(1);
  };

  const deleteProvider = async (provider: Provider) => {
    if (!window.confirm(`Delete provider "${provider.name}"? This will also remove linked servers and daily statistics.`)) return;
    setDeletingProviders((state) => ({ ...state, [provider.id]: true }));
    try {
      const res = await fetch(`/api/providers/${provider.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Provider deleted");
      setSelectedIds((current) => current.filter((id) => id !== provider.id));
      fetchProviders();
    } catch {
      toast.error("Failed to delete provider");
    } finally {
      setDeletingProviders((state) => ({ ...state, [provider.id]: false }));
    }
  };

  const deleteSelectedProviders = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected provider${selectedIds.length === 1 ? "" : "s"}? This will also remove linked servers and daily statistics.`)) return;
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(await res.text());
        })
      );
      toast.success("Selected providers deleted");
      setSelectedIds([]);
      fetchProviders();
    } catch {
      toast.error("Failed to delete selected providers");
    }
  };

  const detectCountries = async () => {
    setDetectingCountries(true);
    try {
      const res = await fetch("/api/providers/detect-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds.length > 0 ? selectedIds : undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast.success(`Detected country for ${result.updated ?? 0} provider${result.updated === 1 ? "" : "s"}`);
      fetchProviders();
    } catch {
      toast.error("Failed to detect provider countries");
    } finally {
      setDetectingCountries(false);
    }
  };

  const hasActiveFilters = decisionFilter !== "all" || contactFilter !== "all" || search;
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Providers</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Manage your VPS and cloud provider pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:flex-wrap">
          <Link
            href="/imports"
            className="flex items-center gap-1.5 h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors max-sm:flex-1 max-sm:justify-center max-sm:text-[12px]"
          >
            Import
          </Link>
          <Link
            href="/exports"
            className="flex items-center gap-1.5 h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors max-sm:flex-1 max-sm:justify-center max-sm:text-[12px]"
          >
            Export
          </Link>
          <button
            onClick={detectCountries}
            disabled={detectingCountries}
            className="flex h-[34px] items-center gap-1.5 rounded-[7px] border border-[#C7D2FE] bg-[#EEF2FF] px-3 text-[13px] font-medium text-[#4F46E5] transition-colors hover:bg-[#E0E7FF] disabled:opacity-60 max-sm:flex-1 max-sm:justify-center max-sm:text-[12px]"
          >
            <Globe2 className={`h-3.5 w-3.5 ${detectingCountries ? "animate-spin" : ""}`} />
            {selectedIds.length > 0 ? "Detect Selected" : "Detect Countries"}
          </button>
          <Link
            href="/providers/new"
            className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors max-sm:flex-1 max-sm:justify-center max-sm:text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Provider
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
          <input
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
          />
        </div>
        <select
          value={decisionFilter}
          onChange={(e) => { setDecisionFilter(e.target.value); setPage(1); }}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] max-sm:text-[12px]"
        >
          <option value="all">All Decisions</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="denied">Denied</option>
          <option value="prohibited_sending">Prohibited</option>
        </select>
        <select
          value={contactFilter}
          onChange={(e) => { setContactFilter(e.target.value); setPage(1); }}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] max-sm:text-[12px]"
        >
          <option value="all">All Statuses</option>
          <option value="not_contacted">Not Contacted</option>
          <option value="ready_to_contact">Ready to Contact</option>
          <option value="contacted">Contacted</option>
          <option value="follow_up_due">Follow-up Due</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-[34px] px-3 text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
        <div className="ml-auto text-[12px] text-[#6B7280]">
          {!loading && total > 0 && `${total} providers`}
        </div>
      </div>

      {/* Selected count */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg">
          <span className="text-[12px] font-medium text-[#4F46E5]">{selectedIds.length} selected</span>
          <button className="text-[12px] font-medium text-[#4F46E5] hover:underline">Bulk Update</button>
          <button onClick={deleteSelectedProviders} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#DC2626] hover:underline">
            <Trash2 className="h-3 w-3" />
            Delete selected
          </button>
          <button className="text-[12px] text-[#6B7280] hover:text-[#111827]" onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {/* Mobile provider cards */}
      <div className="space-y-3 xl:hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
              <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-100" />
            </div>
          ))
        ) : error ? (
          <div className="rounded-[10px] border border-[#FECACA] bg-white p-5 text-center">
            <p className="text-[13px] font-medium text-red-600">{error}</p>
            <button onClick={fetchProviders} className="mt-3 h-[32px] rounded-[7px] border border-[#E5E7EB] px-3 text-[12px] font-medium">
              Try Again
            </button>
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-6 text-center">
            <p className="text-[13px] text-[#6B7280]">No providers found</p>
          </div>
        ) : (
          providers.map((provider) => (
            <article key={provider.id} className={`rounded-[10px] border border-[#E5E7EB] p-4 ${providerRowTone(provider)}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(provider.id)}
                  onChange={() => setSelectedIds(prev => prev.includes(provider.id) ? prev.filter(id => id !== provider.id) : [...prev, provider.id])}
                  className="mt-1 h-3.5 w-3.5 rounded border-[#D1D5DB]"
                />
                <ProviderLogo name={provider.name} website={provider.website} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/providers/${provider.id}`} className="block truncate text-[14px] font-bold text-[#111827]">
                    {provider.name}
                  </Link>
                  <p className="mt-0.5 truncate text-[12px] text-[#6B7280]">
                    {provider.website?.replace("https://", "").replace("http://", "") || provider.supportEmail || provider.salesEmail || "No website"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <button className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] text-[#6B7280]" />
                  }>
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem render={<Link href={`/providers/${provider.id}`} className="flex items-center gap-2" />}>
                      <Eye className="h-3.5 w-3.5 text-[#6B7280]" /> View details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem render={<Link href={`/providers/${provider.id}?edit=1`} className="flex items-center gap-2" />}>
                      <Edit className="h-3.5 w-3.5 text-[#6B7280]" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={deletingProviders[provider.id]}
                      onClick={() => deleteProvider(provider)}
                      className="flex items-center gap-2 text-[#DC2626] focus:text-[#DC2626]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatusBadge value={provider.contactStatus} />
                <StatusBadge value={provider.responseStatus} />
                <StatusBadge value={provider.decision} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Country</p>
                  <p className="mt-1 truncate font-medium text-[#111827]">{provider.country || "—"}</p>
                </div>
                <Link href={`/servers?providerId=${encodeURIComponent(provider.id)}`} className="rounded-[8px] bg-[#F8FAFC] p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Servers</p>
                  <p className="mt-1 font-medium text-[#2563EB]">{provider.activeServers} active / {provider.totalServers} total</p>
                </Link>
                <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Stats</p>
                  <p className="mt-1 font-medium text-[#111827]">{formatNumber(provider.totalSends)} sent</p>
                </div>
                <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Last Contact</p>
                  <p className="mt-1 font-medium text-[#111827]">{formatDate(provider.lastContactDate)}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-[12px]">
                <p className="line-clamp-2 text-[#374151]">
                  <span className="font-semibold text-[#111827]">Note:</span> {providerNote(provider)}
                </p>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Contacted By</p>
                  {provider.contactedUsers?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {provider.contactedUsers.slice(0, 3).map((user) => (
                        <span key={user.id} className={`inline-flex items-center rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${contactedUserChipClass(user.source)}`}>
                          {user.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[#9CA3AF]">—</span>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Data Table */}
      <div className="hidden overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white xl:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px]">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left w-10 px-5 py-2.5">
                  <input
                    type="checkbox"
                    checked={!loading && providers.length > 0 && selectedIds.length === providers.length}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-[#D1D5DB]"
                  />
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Provider
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Contact
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Country
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Response
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Decision
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Port / PTR
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Note
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Contacted By
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Servers
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Server Stats
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Billing
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Assigned / Usage
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Last / Next
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Score
                </th>
                <th className="text-right text-[11px] font-semibold text-[#374151] px-5 py-2.5 uppercase tracking-wider w-10">
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-t border-[#F1F5F9]">
                    <td className="px-5 py-3"><div className="h-3.5 w-3.5 bg-gray-100 rounded animate-pulse" /></td>
                    {Array.from({ length: 16 }).map((__, cell) => (
                      <td key={cell} className="px-3 py-3">
                        <div className="h-4 rounded bg-gray-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={17} className="px-5 py-12 text-center">
                    <p className="text-[13px] font-medium text-red-600 mb-2">{error}</p>
                    <button
                      onClick={fetchProviders}
                      className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
                    >
                      Try Again
                    </button>
                  </td>
                </tr>
              ) : providers.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-5 py-12 text-center">
                    <p className="text-[13px] text-[#6B7280] mb-3">No providers found</p>
                    <Link
                      href="/providers/new"
                      className="inline-flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Provider
                    </Link>
                  </td>
                </tr>
              ) : (
                providers.map((provider) => (
                  <tr
                    key={provider.id}
                    className={`group border-t border-[#F1F5F9] transition-colors ${providerRowTone(provider)}`}
                  >
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(provider.id)}
                        onChange={() => setSelectedIds(prev => prev.includes(provider.id) ? prev.filter(id => id !== provider.id) : [...prev, provider.id])}
                        className="h-3.5 w-3.5 rounded border-[#D1D5DB]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/providers/${provider.id}`} className="flex items-center gap-2.5 group">
                        <ProviderLogo name={provider.name} website={provider.website} size="sm" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#111827] group-hover:text-[#4F46E5] transition-colors truncate">
                            {provider.name}
                          </p>
                          <p className="text-[11px] text-[#9CA3AF] truncate">
                            {provider.website?.replace("https://", "").replace("http://", "") || "—"}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="max-w-[180px] space-y-0.5">
                        <p className="truncate text-[12px] font-medium text-[#111827]">
                          {provider.supportEmail || provider.salesEmail || "—"}
                        </p>
                        <p className="truncate text-[11px] text-[#9CA3AF]">
                          {provider.contactFormUrl ? "Contact form" : provider.salesEmail && provider.supportEmail ? "Support / Sales" : provider.category || "Provider"}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {getCountryFlagUrl(provider.country) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getCountryFlagUrl(provider.country)!}
                            alt=""
                            className="h-3.5 w-[21px] rounded-sm object-cover"
                          />
                        )}
                        <span className="text-[13px] text-[#374151]">{provider.country || "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={provider.contactStatus} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={provider.responseStatus} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={provider.decision} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1 text-[11px]">
                        <span className={`inline-flex rounded-[5px] px-2 py-0.5 font-semibold ${provider.port25Status === "available" ? "bg-[#ECFDF5] text-[#15803D]" : provider.port25Status === "blocked" ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#F3F4F6] text-[#4B5563]"}`}>
                          P25 {provider.port25Status || "unknown"}
                        </span>
                        <span className={`ml-1 inline-flex rounded-[5px] px-2 py-0.5 font-semibold ${provider.ptrStatus === "configured" ? "bg-[#ECFDF5] text-[#15803D]" : "bg-[#F3F4F6] text-[#4B5563]"}`}>
                          PTR {provider.ptrStatus || "unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="max-w-[170px] truncate text-[12px] font-medium text-[#374151]" title={providerNote(provider)}>
                        {providerNote(provider)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {provider.contactedUsers?.length ? (
                        <div className="flex max-w-[170px] flex-wrap gap-1">
                          {provider.contactedUsers.slice(0, 3).map((user) => (
                            <span
                              key={user.id}
                              title={`${user.name} · ${user.source === "inbox" ? "synced inbox" : user.source === "outreach" ? "outreach/contact log" : "contacted status fallback"}`}
                              className={`inline-flex items-center gap-1 rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${contactedUserChipClass(user.source)}`}
                            >
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px]">
                                {user.name.charAt(0)}
                              </span>
                              <span className="max-w-[92px] truncate">{user.name}</span>
                            </span>
                          ))}
                          {provider.contactedUsers.length > 3 && (
                            <span className="inline-flex rounded-[999px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#6B7280]">
                              +{provider.contactedUsers.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/servers?providerId=${encodeURIComponent(provider.id)}`}
                        className="group inline-flex flex-col rounded-[6px] px-2 py-1 transition-colors hover:bg-[#EEF2FF]"
                        title={`View ${provider.name} servers`}
                      >
                        <span className="text-[12px] font-semibold text-[#2563EB] group-hover:text-[#4F46E5]">{provider.activeServers} active</span>
                        <span className="text-[11px] text-[#6B7280]">{provider.totalServers} total</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-[#111827]">{formatNumber(provider.totalSends)}</p>
                      <p className="text-[11px] text-[#15803D]">{percent(provider.totalSuccessful, provider.totalSends)} delivered</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-[#111827]">{formatMoney(provider.startingPrice, provider.currency || "USD")}</p>
                      <p className="text-[11px] text-[#6B7280]">{provider.billingMethod || provider.paymentMethod || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      {(provider.assignedUsers?.length || provider.assignedUserName) ? (
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {(provider.assignedUsers?.length ? provider.assignedUsers : [{ id: provider.assignedUserId || "assigned", name: provider.assignedUserName || "Assigned", email: provider.assignedUserEmail || "", source: "provider" as const }]).slice(0, 3).map((user) => (
                            <span key={user.id} title={`${user.name}${user.source === "provider" ? " · provider assigned" : user.source === "contact" ? " · contacted provider" : user.source === "server" ? " · assigned to server" : " · created server"}`} className={`inline-flex items-center gap-1 rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${assignedUserChipClass(user.source)}`}>
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px]">
                                {user.name.charAt(0)}
                              </span>
                              <span className="max-w-[86px] truncate">{user.name}</span>
                            </span>
                          ))}
                          {(provider.assignedUsers?.length || 0) > 3 && (
                            <span className="inline-flex rounded-[999px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#6B7280]">
                              +{provider.assignedUsers.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12px] font-medium text-[#374151]">{formatDate(provider.lastContactDate)}</p>
                      <p className="text-[11px] text-[#6B7280]">Next {formatDate(provider.nextFollowUpDate)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${Math.min(provider.score || 0, 100)}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold text-[#111827]">{provider.score || 0}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button className="h-6 w-6 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F1F5F9] transition-colors opacity-0 group-hover:opacity-100" />
                        }>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem render={<Link href={`/providers/${provider.id}`} className="flex items-center gap-2" />}>
                            <Eye className="h-3.5 w-3.5 text-[#6B7280]" /> View details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem render={<Link href={`/providers/new?edit=${provider.id}`} className="flex items-center gap-2" />}>
                            <Edit className="h-3.5 w-3.5 text-[#6B7280]" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={deletingProviders[provider.id]}
                            onClick={() => deleteProvider(provider)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#E5E7EB]">
            <p className="text-[11px] text-[#6B7280]">
              Showing {startRow}–{endRow} of {total}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                  setSelectedIds([]);
                }}
                className="h-7 rounded border border-[#E5E7EB] bg-white px-2 text-[11px] font-medium text-[#374151]"
              >
                <option value={20}>20 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={500}>500 rows</option>
              </select>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 rounded border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`h-7 w-7 rounded text-[12px] font-medium flex items-center justify-center transition-colors ${
                      pageNum === page
                        ? "bg-[#4F46E5] text-white"
                        : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 w-7 rounded border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
