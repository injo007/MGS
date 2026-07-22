"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Globe,
  Server,
  Clock,
  Activity,
  ChevronRight,
  Calendar,
  MoreHorizontal,
  Info,
  Filter,
  CheckCircle2,
  XCircle,
  Ban,
  Shield,
  Eye,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

interface DashboardStats {
  providers: {
    total: number;
    byContactStatus: Record<string, number>;
    byResponseStatus: Record<string, number>;
    byDecision: Record<string, number>;
    owned: number;
  };
  servers: { total: number; active: number };
  ipAddresses: { total: number };
  tasks: { byStatus: Record<string, number> };
  outreach: { byChannel: Record<string, number> };
  sending: {
    totalSends: number;
    totalBounces: number;
    totalSuccessful: number;
    totalComplaints: number;
  };
  campaigns: { total: number; active: number };
  contactsOverTime: { date: string; contacts: number }[];
  recentActivity: {
    id: string;
    user: string;
    action: string;
    entityType: string;
    entityId: string | null;
    time: string;
  }[];
  sendingOverTime: {
    date: string;
    totalSends: number;
    successfulSends: number;
    bounces: number;
  }[];
  userSendingOverTime: {
    date: string;
    userId: string;
    userName: string;
    totalSends: number;
  }[];
  serverUtilization: {
    serverId: string;
    serverName: string;
    providerId: string;
    status: string;
    lastSendDate: string | null;
    totalSends: number;
  }[];
}

interface ProviderRow {
  id: string;
  name: string;
  website: string | null;
  country: string | null;
  contactStatus: string;
  responseStatus: string | null;
  decision: string;
  mailServerAllowed: boolean | null;
  sendingRestrictions: string | null;
  abusePolicyNotes: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastContactDate: string | null;
  createdAt: string;
}

interface DashboardServerRow {
  id: string;
  name: string;
  providerName: string | null;
  plan: string | null;
  location: string | null;
  status: string;
  monthlyCost: string | null;
  currency: string | null;
  activationDate: string | null;
  expirationDate: string | null;
  ipCount: number;
  assignedUsers: { id: string; name: string; email: string }[];
}

const ALL_STATUS_CATEGORIES = [
  { key: "not_contacted", label: "Not Contacted", color: "#9CA3AF" },
  { key: "contacted", label: "Contacted", color: "#4F46E5" },
  { key: "follow_up_due", label: "Awaiting Reply", color: "#60A5FA" },
  { key: "replied", label: "Replied", color: "#8B5CF6" },
  { key: "ready_to_contact", label: "Negotiating", color: "#F59E0B" },
  { key: "accepted", label: "Accepted", color: "#22C55E" },
  { key: "denied", label: "Denied", color: "#EF4444" },
];

const PIPELINE_STAGES = [
  { key: "not_contacted", label: "Not Contacted", color: "#94A3B8" },
  { key: "contacted", label: "Contacted", color: "#4F46E5" },
  { key: "follow_up_due", label: "Awaiting Reply", color: "#60A5FA" },
  { key: "ready_to_contact", label: "Negotiating", color: "#F59E0B" },
  { key: "accepted", label: "Accepted", color: "#22C55E" },
  { key: "denied", label: "Denied", color: "#EF4444" },
];

const KPI_CARDS = [
  { key: "total", label: "Total Providers", icon: Globe, color: "text-[#4F46E5]", bg: "bg-[#EEF2FF]" },
  { key: "not_contacted", label: "Not Contacted", icon: Eye, color: "text-[#6B7280]", bg: "bg-[#F3F4F6]" },
  { key: "awaiting_reply", label: "Awaiting Reply", icon: Clock, color: "text-[#3B82F6]", bg: "bg-[#EFF6FF]" },
  { key: "accepted", label: "Accepted", icon: CheckCircle2, color: "text-[#16A34A]", bg: "bg-[#ECFDF5]" },
  { key: "denied", label: "Denied", icon: XCircle, color: "text-[#DC2626]", bg: "bg-[#FEF2F2]" },
  { key: "prohibited", label: "Prohibited", icon: Ban, color: "text-[#EA580C]", bg: "bg-[#FFF7ED]" },
  { key: "owned", label: "Owned Providers", icon: Shield, color: "text-[#0891B2]", bg: "bg-[#ECFEFF]" },
  { key: "active_servers", label: "Active Servers", icon: Server, color: "text-[#7C3AED]", bg: "bg-[#F5F3FF]" },
];

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getActionIcon(action: string) {
  if (action === "create") return Plus;
  if (action === "update") return Pencil;
  if (action === "delete") return Trash2;
  return Activity;
}

function getActionColor(action: string) {
  if (action === "create") return "text-[#16A34A]";
  if (action === "update") return "text-[#4F46E5]";
  if (action === "delete") return "text-[#DC2626]";
  return "text-[#6B7280]";
}

function formatAction(action: string, entityType: string) {
  const entity = entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (action === "create") return `created a new ${entity}`;
  if (action === "update") return `updated ${entity}`;
  if (action === "delete") return `deleted ${entity}`;
  return `${action} ${entity}`;
}

function weekStartKey(value: Date) {
  const date = new Date(value);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

const USER_CHART_COLORS = ["#4F46E5", "#16A34A", "#EA580C", "#0891B2", "#8B5CF6", "#DC2626"];

function userSendingWeeks(data: DashboardStats["userSendingOverTime"]) {
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (5 - index) * 7);
    const key = weekStartKey(date);
    return {
      key,
      week: new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    } as Record<string, string | number>;
  });
  const byWeek = new Map(weeks.map((week) => [String(week.key), week]));
  const users = new Map<string, string>();

  for (const item of data) {
    const userName = item.userName || "Unassigned";
    users.set(userName, userName);
    const bucket = byWeek.get(weekStartKey(new Date(item.date)));
    if (bucket) bucket[userName] = Number(bucket[userName] || 0) + item.totalSends;
  }

  return {
    weeks,
    users: Array.from(users.keys()).slice(0, 6),
  };
}

function money(value: string | null, currency = "USD") {
  const amount = Number(value || 0);
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function shortDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isReadyToContact(provider: ProviderRow) {
  const contacted = provider.contactStatus !== "not_contacted";
  const prohibited = provider.decision === "prohibited_sending" || provider.mailServerAllowed === false;
  const owned = Boolean(provider.assignedUserId);
  return !contacted && !prohibited && !owned;
}

function providerNeedsAction(provider: ProviderRow) {
  if (provider.decision === "accepted" || provider.decision === "denied" || provider.decision === "prohibited_sending") {
    return false;
  }
  return (
    isReadyToContact(provider) ||
    provider.contactStatus === "follow_up_due" ||
    provider.responseStatus === "replied" ||
    provider.responseStatus === "needs_follow_up"
  );
}

function displayProviderStatus(provider: ProviderRow) {
  if (isReadyToContact(provider)) return "ready_to_contact";
  return provider.contactStatus;
}

function providerNote(provider: ProviderRow) {
  return provider.abusePolicyNotes || provider.sendingRestrictions || "-";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actionProviders, setActionProviders] = useState<ProviderRow[]>([]);
  const [allProviders, setAllProviders] = useState<ProviderRow[]>([]);
  const [dashboardServers, setDashboardServers] = useState<DashboardServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, providersRes, serversRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/providers?pageSize=100&sortBy=lastContactDate&sortOrder=asc"),
          fetch("/api/servers?pageSize=5&sortBy=createdAt&sortOrder=desc"),
        ]);

        if (!statsRes.ok) throw new Error("Failed to load dashboard stats");
        if (!providersRes.ok) throw new Error("Failed to load providers");
        if (!serversRes.ok) throw new Error("Failed to load servers");

        const statsData = await statsRes.json();
        const providersData = await providersRes.json();
        const serversData = await serversRes.json();

        const providerRows = providersData.data ?? [];
        setStats(statsData);
        setAllProviders(providerRows);
        setDashboardServers(serversData.data ?? []);
        const actionRows = providerRows.filter(providerNeedsAction);
        setActionProviders((actionRows.length > 0 ? actionRows : providerRows).slice(0, 7));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const kpiValues: Record<string, number> = {
    total: stats?.providers.total ?? 0,
    not_contacted: stats?.providers.byContactStatus.not_contacted ?? 0,
    awaiting_reply: (stats?.providers.byResponseStatus?.no_response ?? 0) + (stats?.providers.byResponseStatus?.needs_follow_up ?? 0),
    accepted: stats?.providers.byDecision.accepted ?? 0,
    denied: stats?.providers.byDecision.denied ?? 0,
    prohibited: stats?.providers.byDecision.prohibited_sending ?? 0,
    owned: stats?.providers.owned ?? 0,
    active_servers: stats?.servers.active ?? 0,
  };

  const statusChartData = ALL_STATUS_CATEGORIES.map((cat) => ({
    name: cat.label,
    value:
      cat.key === "accepted"
        ? (stats?.providers.byDecision.accepted ?? 0)
        : cat.key === "denied"
        ? (stats?.providers.byDecision.denied ?? 0)
        : cat.key === "replied"
        ? (stats?.providers.byResponseStatus?.replied ?? 0)
        : cat.key === "ready_to_contact"
        ? (stats?.providers.byContactStatus.ready_to_contact ?? 0)
        : cat.key === "follow_up_due"
        ? ((stats?.providers.byContactStatus.follow_up_due ?? 0) + (stats?.providers.byResponseStatus?.no_response ?? 0))
        : (stats?.providers.byContactStatus[cat.key] ?? 0),
    fill: cat.color,
  }));

  const totalProviders = stats?.providers.total ?? 1;

  const userSendingChart = useMemo(() => userSendingWeeks(stats?.userSendingOverTime ?? []), [stats?.userSendingOverTime]);

  const chartTooltipStyle = {
    borderRadius: "8px",
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    fontSize: "12px",
    boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
  };

  const metricDelta = (value: number) => Math.max(0, Math.round(value * 0.08));
  const metricPct = (value: number) => (value > 0 ? "8.3%" : "0.0%");

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[24px] max-sm:text-[20px] font-bold text-[#111827] tracking-tight leading-tight">
            Provider Operations Dashboard
          </h1>
          <p className="text-[14px] max-sm:text-[13px] text-[#6B7280] mt-1">
            Overview of provider outreach, pipeline, and server operations.
          </p>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          <button className="flex items-center gap-2 h-[36px] rounded-[8px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors max-sm:px-2.5 max-sm:text-[12px]">
            <Calendar className="h-4 w-4 text-[#6B7280]" />
            <span className="max-sm:hidden">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <span className="sm:hidden">Today</span>
            <ChevronRight className="h-3.5 w-3.5 text-[#6B7280]" />
          </button>
          <button className="h-[36px] w-[36px] rounded-[8px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        </div>
      )}

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {KPI_CARDS.map((kpi) => {
          const Icon = kpi.icon;
          const value = kpiValues[kpi.key];
          return (
            <div
              key={kpi.key}
              className="min-h-[96px] rounded-[10px] border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-full ${kpi.bg}`}>
                  <Icon className={`h-[17px] w-[17px] ${kpi.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-[#374151]">{kpi.label}</p>
                  <p className="mt-1 text-[24px] font-bold leading-none tracking-tight text-[#111827]">
                    {loading ? (
                      <span className="inline-block h-6 w-12 animate-pulse rounded bg-gray-100" />
                    ) : (
                      value.toLocaleString()
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] font-semibold">
                <span className={value > 0 ? "text-[#16A34A]" : "text-[#9CA3AF]"}>↑ {metricDelta(value)}</span>
                <span className="text-[#475569]">{metricPct(value)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
        {/* Provider Status Distribution */}
        <div className="flex h-[286px] min-w-0 flex-col rounded-[10px] border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[#111827]">Provider Status Distribution</h3>
              <Info className="h-4 w-4 text-[#9CA3AF]" />
            </div>
            <Link href="/providers" className="flex items-center gap-1.5 h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
              All Providers
              <ChevronRight className="h-3 w-3 text-[#6B7280]" />
            </Link>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="h-[220px] bg-gray-50 rounded-lg animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusChartData} barCategoryGap="16%" margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={44}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "#F1F5F9", opacity: 0.5 }} />
                  <Bar dataKey="value" maxBarSize={46} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" position="top" fill="#111827" fontSize={11} fontWeight={700} />
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sending By User */}
        <div className="flex h-[286px] min-w-0 flex-col rounded-[10px] border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#111827]">Sending By User</h3>
            <Link href="/reports" className="flex items-center gap-1.5 h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
              Reports
              <ChevronRight className="h-3 w-3 text-[#6B7280]" />
            </Link>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="h-[220px] bg-gray-50 rounded-lg animate-pulse" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={198}>
                  <BarChart data={userSendingChart.weeks} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    {userSendingChart.users.map((user, index) => (
                      <Bar key={user} dataKey={user} stackId="users" fill={USER_CHART_COLORS[index % USER_CHART_COLORS.length]} radius={index === userSendingChart.users.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  {userSendingChart.users.length === 0 ? (
                    <span className="text-[11px] text-[#6B7280]">No sending stats yet</span>
                  ) : userSendingChart.users.map((user, index) => (
                    <span key={user} className="inline-flex items-center gap-1 text-[11px] text-[#6B7280]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: USER_CHART_COLORS[index % USER_CHART_COLORS.length] }} />
                      {user}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex h-[286px] min-w-0 flex-col rounded-[10px] border border-[#E5E7EB] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#111827]">Recent Activity</h3>
            <Link href="/audit" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
              View all
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-3" style={{ borderBottom: i < 4 ? "1px solid #F1F5F9" : "none" }}>
                  <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : !stats?.recentActivity || stats.recentActivity.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-[13px] text-[#9CA3AF]">
                No activity yet
              </div>
            ) : (
              stats.recentActivity.map((activity, i) => {
                const Icon = getActionIcon(activity.action);
                const color = getActionColor(activity.action);
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 py-2.5"
                    style={{ borderBottom: i < stats.recentActivity.length - 1 ? "1px solid #F1F5F9" : "none" }}
                  >
                    <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#374151] leading-[1.45]">
                        <span className="font-semibold">{activity.user}</span>{" "}
                        {formatAction(activity.action, activity.entityType)}
                      </p>
                    </div>
                    <span className="text-[11px] text-[#9CA3AF] shrink-0 mt-0.5 whitespace-nowrap">
                      {timeAgo(activity.time)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Providers Requiring Action */}
        <div className="bg-white rounded-[10px] border border-[#E5E7EB]">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[#111827]">Providers Requiring Action</h3>
              <Info className="h-4 w-4 text-[#9CA3AF]" />
              <span className="inline-flex items-center justify-center h-[22px] min-w-[22px] rounded-full bg-[#EEF2FF] px-1.5 text-[11px] font-semibold text-[#4F46E5]">
                {actionProviders.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/providers" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
                View All Providers
              </Link>
              <button className="h-[30px] w-[30px] rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
                <Filter className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-t border-[#E5E7EB]">
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-5 py-3 uppercase tracking-[0.03em]">
                    Provider
                  </th>
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-3 py-3 uppercase tracking-[0.03em]">
                    Status
                  </th>
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-3 py-3 uppercase tracking-[0.03em]">
                    Note
                  </th>
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-3 py-3 uppercase tracking-[0.03em]">
                    Owned
                  </th>
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-3 py-3 uppercase tracking-[0.03em]">
                    Assigned To
                  </th>
                  <th className="text-left text-[12px] font-semibold text-[#4B5563] px-3 py-3 uppercase tracking-[0.03em]">
                    Last Contact
                  </th>
                  <th className="text-right text-[12px] font-semibold text-[#4B5563] px-5 py-3 uppercase tracking-[0.03em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-[#F1F5F9]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-6 w-6 rounded bg-gray-100 animate-pulse" />
                          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                        </div>
                      </td>
                      <td className="px-3 py-3.5"><div className="h-[22px] w-20 bg-gray-100 rounded-[5px] animate-pulse" /></td>
                      <td className="px-3 py-3.5"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-3 py-3.5"><div className="h-[22px] w-10 bg-gray-100 rounded-full animate-pulse" /></td>
                      <td className="px-3 py-3.5"><div className="h-4 w-24 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-3 py-3.5"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                      <td className="px-5 py-3.5"><div className="h-4 w-4 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                    </tr>
                  ))
                ) : actionProviders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-[14px] text-[#6B7280]">
                      No providers currently require action.
                    </td>
                  </tr>
                ) : (
                  actionProviders.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors duration-150"
                    >
                      <td className="px-5 py-3">
                        <Link href={`/providers/${p.id}`} className="flex items-center gap-2.5 group">
                          <div className="h-[24px] w-[24px] rounded bg-[#EEF2FF] flex items-center justify-center text-[10px] font-semibold text-[#4F46E5] shrink-0">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-medium text-[#111827] group-hover:text-[#4F46E5] transition-colors truncate max-w-[180px]">
                            {p.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge value={displayProviderStatus(p)} />
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-[160px] truncate text-[13px] font-medium text-[#374151]" title={providerNote(p)}>
                          {providerNote(p)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {p.assignedUserId ? (
                          <span className="inline-flex items-center rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-[#15803D]">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#4B5563]">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {p.assignedUserName ? (
                          <div className="flex items-center gap-2">
                            <div className="h-[22px] w-[22px] rounded-full bg-[#EEF2FF] flex items-center justify-center text-[9px] font-bold text-[#4F46E5]">
                              {p.assignedUserName.charAt(0)}
                            </div>
                            <span className="text-[13px] text-[#374151]">{p.assignedUserName}</span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-[#9CA3AF]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[13px] text-[#6B7280]">
                          {p.lastContactDate
                            ? new Date(p.lastContactDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "Never"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button className="h-7 w-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F1F5F9] transition-colors">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pipeline Overview */}
        <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[#111827]">Pipeline Overview</h3>
            <span className="text-[13px] text-[#6B7280]">
              Total: <span className="font-semibold text-[#111827]">{stats?.providers.total ?? 0}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PIPELINE_STAGES.map((stage) => {
              const count = stage.key === "accepted"
                ? (stats?.providers.byDecision.accepted ?? 0)
                : stage.key === "denied"
                ? (stats?.providers.byDecision.denied ?? 0)
                : (stats?.providers.byContactStatus[stage.key] ?? 0);
              const pct = totalProviders > 0 ? ((count / totalProviders) * 100).toFixed(1) : "0.0";
              const providerNames = allProviders
                .filter((p) => {
                  if (stage.key === "accepted") return p.decision === "accepted";
                  if (stage.key === "denied") return p.decision === "denied";
                  return p.contactStatus === stage.key;
                })
                .slice(0, 3)
                .map((p) => p.name);
              const remaining = count - providerNames.length;

              return (
                <div
                  key={stage.key}
                  className="bg-white rounded-[8px] border border-[#E5E7EB] p-3 flex flex-col min-w-0"
                >
                  <div
                    className="h-[3px] rounded-full mb-2"
                    style={{ background: stage.color }}
                  />
                  <p className="text-[12px] font-semibold text-[#374151] mb-2 truncate">
                    {stage.label}
                  </p>
                  {loading ? (
                    <div className="h-5 w-8 bg-gray-100 rounded animate-pulse mb-1" />
                  ) : (
                    <p className="text-[20px] font-bold text-[#111827] leading-none">
                      {count}
                    </p>
                  )}
                  <p className="text-[11px] text-[#6B7280] mt-1">{pct}%</p>
                  <div className="mt-3 space-y-1.5">
                    {providerNames.length === 0 && !loading ? (
                      <p className="text-[12px] text-[#9CA3AF] italic">No providers</p>
                    ) : (
                      providerNames.map((name) => (
                        <p
                          key={name}
                          className="text-[12px] text-[#374151] leading-tight truncate"
                          title={name}
                        >
                          {name}
                        </p>
                      ))
                    )}
                    {remaining > 0 && (
                      <p className="text-[11px] text-[#9CA3AF]">
                        ...and {remaining} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#111827]">Servers</h3>
            <p className="mt-0.5 text-[12px] text-[#6B7280]">Recent server inventory across your providers.</p>
          </div>
          <Link href="/servers" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
            View All Servers
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead>
              <tr className="border-t border-[#E5E7EB]">
                {["Server", "Provider", "IP Addresses", "Type", "Region", "Status", "Monthly Cost", "Start Date", "Renewal Date", "Assigned To", "Actions"].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.03em] text-[#4B5563]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-t border-[#F1F5F9]">
                    {Array.from({ length: 11 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : dashboardServers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-[13px] text-[#6B7280]">
                    No servers available yet.
                  </td>
                </tr>
              ) : (
                dashboardServers.map((server) => (
                  <tr key={server.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3">
                      <Link href="/servers" className="text-[13px] font-bold text-[#2563EB] hover:underline">
                        {server.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-[#111827]">{server.providerName ?? "-"}</td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{server.ipCount ?? 0}</td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{server.plan ?? "Cloud"}</td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{server.location ?? "-"}</td>
                    <td className="px-4 py-3"><StatusBadge value={server.status} /></td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-[#111827]">{money(server.monthlyCost, server.currency ?? "USD")}</td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{shortDate(server.activationDate)}</td>
                    <td className="px-4 py-3 text-[13px] text-[#374151]">{shortDate(server.expirationDate)}</td>
                    <td className="px-4 py-3">
                      {server.assignedUsers?.[0] ? (
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-bold text-[#4F46E5]">
                            {server.assignedUsers[0].name.charAt(0)}
                          </span>
                          <span className="text-[13px] text-[#374151]">{server.assignedUsers[0].name}</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-[#9CA3AF]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href="/servers" className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#6B7280] hover:bg-[#F1F5F9]">
                        <MoreHorizontal className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
