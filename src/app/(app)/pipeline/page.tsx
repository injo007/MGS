"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProviderLogo } from "@/components/shared/provider-logo";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe2,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";

interface Provider {
  id: string;
  name: string;
  website: string | null;
  country: string | null;
  contactStatus: string;
  responseStatus: string | null;
  decision: string;
  mailServerAllowed: boolean | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastContactDate: string | null;
}

const STAGES = [
  { key: "not_contacted", label: "Not Contacted", color: "#94A3B8" },
  { key: "ready_to_contact", label: "Ready", color: "#2563EB" },
  { key: "contacted", label: "Contacted", color: "#4F46E5" },
  { key: "awaiting_reply", label: "Awaiting Reply", color: "#60A5FA" },
  { key: "replied", label: "Replied", color: "#8B5CF6" },
  { key: "negotiating", label: "Negotiating", color: "#F59E0B" },
  { key: "accepted", label: "Accepted", color: "#22C55E" },
  { key: "denied", label: "Denied", color: "#EF4444" },
  { key: "prohibited", label: "Prohibited", color: "#EA580C" },
];

const STAGE_GROUPS = [
  { key: "all", label: "All Pipeline", description: "Every provider in one focused list", stages: STAGES.map((stage) => stage.key), color: "#4F46E5" },
  { key: "research", label: "Research", description: "Not contacted and ready targets", stages: ["not_contacted", "ready_to_contact"], color: "#2563EB" },
  { key: "outreach", label: "Outreach", description: "Already contacted providers", stages: ["contacted"], color: "#4F46E5" },
  { key: "waiting", label: "Waiting", description: "Follow-up and no-response work", stages: ["awaiting_reply"], color: "#60A5FA" },
  { key: "evaluation", label: "Evaluation", description: "Replies and negotiation", stages: ["replied", "negotiating"], color: "#8B5CF6" },
  { key: "final", label: "Final Decisions", description: "Accepted, denied, or prohibited", stages: ["accepted", "denied", "prohibited"], color: "#16A34A" },
];

function isReady(provider: Provider) {
  return provider.contactStatus === "not_contacted" && provider.decision === "pending" && provider.mailServerAllowed !== false && !provider.assignedUserId;
}

function pipelineStage(provider: Provider) {
  if (provider.decision === "accepted") return "accepted";
  if (provider.decision === "denied" || provider.decision === "not_suitable") return "denied";
  if (provider.decision === "prohibited_sending" || provider.mailServerAllowed === false) return "prohibited";
  if (provider.responseStatus === "replied") return "replied";
  if (provider.responseStatus === "needs_follow_up" || provider.contactStatus === "follow_up_due") return "awaiting_reply";
  if (isReady(provider)) return "ready_to_contact";
  if (provider.contactStatus === "contacted") return "contacted";
  if (provider.contactStatus === "ready_to_contact") return "negotiating";
  return "not_contacted";
}

function stageLabel(stageKey: string) {
  return STAGES.find((stage) => stage.key === stageKey)?.label ?? stageKey.replace(/_/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "No contact yet";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function providerDomain(provider: Provider) {
  return provider.website?.replace(/^https?:\/\//, "").replace(/^www\./, "") || provider.country || "No website";
}

export default function PipelinePage() {
  const { data: session, status } = useSession();
  const admin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageGroup, setStageGroup] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");

  useEffect(() => {
    if (status !== "authenticated" || !admin) return;
    async function fetchProviders() {
      try {
        const res = await fetch("/api/providers?pageSize=500&sortBy=createdAt&sortOrder=desc");
        if (!res.ok) throw new Error("Failed to fetch providers");
        const data = await res.json();
        setProviders(data.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    fetchProviders();
  }, [admin, status]);

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(STAGES.map((stage) => [stage.key, 0]));
    for (const provider of providers) counts[pipelineStage(provider)] += 1;
    return counts;
  }, [providers]);

  const groupCounts = useMemo(() => {
    return Object.fromEntries(
      STAGE_GROUPS.map((group) => [group.key, group.stages.reduce((sum, stage) => sum + (stageCounts[stage] ?? 0), 0)])
    );
  }, [stageCounts]);

  const activeGroup = STAGE_GROUPS.find((group) => group.key === stageGroup) ?? STAGE_GROUPS[0];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((provider) => {
      const stage = pipelineStage(provider);
      if (!activeGroup.stages.includes(stage)) return false;
      if (ownershipFilter === "owned" && !provider.assignedUserId) return false;
      if (ownershipFilter === "unowned" && provider.assignedUserId) return false;
      if (!q) return true;
      return [provider.name, provider.website, provider.country, provider.assignedUserName].some((value) => value?.toLowerCase().includes(q));
    });
  }, [activeGroup.stages, ownershipFilter, providers, search]);

  const accepted = providers.filter((provider) => provider.decision === "accepted").length;
  const prohibited = providers.filter((provider) => provider.decision === "prohibited_sending" || provider.mailServerAllowed === false).length;
  const denied = providers.filter((provider) => provider.decision === "denied").length;
  const waiting = providers.filter((provider) => ["no_response", "needs_follow_up"].includes(provider.responseStatus || "") || provider.contactStatus === "follow_up_due").length;
  const needsOwner = providers.filter((provider) => !provider.assignedUserId && !["accepted", "denied", "prohibited"].includes(pipelineStage(provider))).length;

  if (status === "loading") {
    return <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-6 text-[13px] text-[#6B7280]">Loading...</div>;
  }

  if (!admin) {
    return (
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-6">
        <h1 className="text-[18px] font-bold text-[#111827]">Pipeline is admin-only</h1>
        <p className="mt-1 text-[13px] text-[#6B7280]">Provider pipeline management is restricted to administrators.</p>
      </div>
    );
  }
  const conversionRate = providers.length ? ((accepted / providers.length) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[#111827]">Pipeline</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">A focused view of provider outreach, replies, ownership, and final decisions.</p>
        </div>
        <Link href="/providers/new" className="inline-flex h-[38px] items-center gap-2 rounded-[8px] bg-[#4F46E5] px-4 text-[13px] font-semibold text-white hover:bg-[#4338CA]">
          <Plus className="h-4 w-4" />
          Add Provider
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total", value: providers.length, sub: "providers", icon: Globe2, color: "#4F46E5", bg: "#EEF2FF" },
          { label: "Waiting", value: waiting, sub: "needs follow-up", icon: Clock, color: "#2563EB", bg: "#EFF6FF" },
          { label: "Accepted", value: accepted, sub: `${conversionRate}% conversion`, icon: CheckCircle2, color: "#16A34A", bg: "#ECFDF5" },
          { label: "Blocked", value: prohibited + denied, sub: "denied/prohibited", icon: XCircle, color: "#DC2626", bg: "#FEF2F2" },
          { label: "Unowned", value: needsOwner, sub: "need assignment", icon: AlertTriangle, color: "#EA580C", bg: "#FFF7ED" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: item.bg, color: item.color }}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#6B7280]">{item.label}</p>
                  <p className="mt-1 text-[23px] font-bold leading-none text-[#111827]">{item.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-[#6B7280]">{item.sub}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] p-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search providers, domain, country, owner..."
              className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            />
          </div>
          <select value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value)} className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151]">
            <option value="all">All Ownership</option>
            <option value="owned">Owned</option>
            <option value="unowned">Unowned</option>
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr]">
          <aside className="border-b border-[#E5E7EB] bg-[#FBFCFE] p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3">
              <h2 className="text-[13px] font-bold text-[#111827]">Focus Area</h2>
              <p className="mt-1 text-[12px] text-[#6B7280]">Choose one workflow to reduce noise.</p>
            </div>
            <div className="space-y-2">
              {STAGE_GROUPS.map((group) => {
                const active = group.key === stageGroup;
                return (
                  <button
                    key={group.key}
                    onClick={() => setStageGroup(group.key)}
                    className={`w-full rounded-[8px] border p-3 text-left transition ${
                      active ? "border-[#C7D2FE] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)]" : "border-transparent hover:border-[#E5E7EB] hover:bg-white"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
                        <span className="text-[13px] font-bold text-[#111827]">{group.label}</span>
                      </span>
                      <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#4F46E5]">{groupCounts[group.key] ?? 0}</span>
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-[#6B7280]">{group.description}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#111827]">{activeGroup.label}</h2>
                <p className="mt-1 text-[12px] text-[#6B7280]">{filtered.length} providers shown</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeGroup.stages.map((stage) => (
                  <span key={stage} className="rounded-[6px] bg-[#F3F4F6] px-2 py-1 text-[11px] font-semibold text-[#4B5563]">
                    {stageLabel(stage)}: {stageCounts[stage] ?? 0}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_140px_140px_170px_90px] gap-3 rounded-[7px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.03em] text-[#4B5563] md:grid">
              <span>Provider</span>
              <span>Pipeline Stage</span>
              <span>Final Decision</span>
              <span>Owner / Last Contact</span>
              <span className="text-right">Action</span>
            </div>

            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[84px] animate-pulse rounded-[8px] bg-[#F8FAFC]" />)
              ) : filtered.length === 0 ? (
                <div className="grid h-[260px] place-items-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-center">
                  <div>
                    <ShieldCheck className="mx-auto h-8 w-8 text-[#94A3B8]" />
                    <p className="mt-3 text-[13px] font-semibold text-[#111827]">No providers in this focus area</p>
                    <p className="mt-1 text-[12px] text-[#6B7280]">Try another stage group or clear the search.</p>
                  </div>
                </div>
              ) : (
                filtered.map((provider) => {
                  const stage = pipelineStage(provider);
                  return (
                    <Link key={provider.id} href={`/providers/${provider.id}`} className="block rounded-[8px] border border-[#E5E7EB] bg-white p-3 transition hover:border-[#C7D2FE] hover:bg-[#F8FAFC]">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_170px_90px] md:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <ProviderLogo name={provider.name} website={provider.website} size="md" className="h-9 w-9 rounded-[8px]" />
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-bold text-[#111827]">{provider.name}</p>
                            <p className="mt-1 truncate text-[12px] text-[#6B7280]">{providerDomain(provider)}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.03em] text-[#6B7280] md:hidden">Pipeline Stage</p>
                          <StatusBadge value={stage} label={stageLabel(stage)} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.03em] text-[#6B7280] md:hidden">Final Decision</p>
                          <StatusBadge value={provider.decision} />
                        </div>
                        <div className="min-w-0 text-[12px] text-[#6B7280]">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.03em] text-[#6B7280] md:hidden">Owner / Last Contact</p>
                          {provider.assignedUserName ? (
                            <span className="inline-flex max-w-full items-center gap-1.5 truncate">
                              <UsersRound className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{provider.assignedUserName}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[#EA580C]">
                              <UserRound className="h-3.5 w-3.5" />
                              Unassigned
                            </span>
                          )}
                          <p className="mt-1">Last: {formatDate(provider.lastContactDate)}</p>
                        </div>
                        <span className="inline-flex items-center justify-end gap-1 text-[12px] font-semibold text-[#4F46E5]">
                          Open
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
