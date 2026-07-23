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
  Mail,
  Send,
  Trophy,
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
  userRankings: {
    weekStart: string;
    lastInboxSync: string | null;
    providerContacts: {
      userId: string;
      userName: string;
      userEmail: string;
      providerCount: number;
      emailCount: number;
      mailboxCount: number;
      lastContactAt: string | null;
      source: string;
    }[];
    weeklySending: {
      userId: string;
      userName: string;
      userEmail: string;
      totalSends: number;
      serverCount: number;
      daysActive: number;
    }[];
  };
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
  notes: string | null;
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
  return provider.notes || provider.abusePolicyNotes || provider.sendingRestrictions || "-";
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actionProviders, setActionProviders] = useState<ProviderRow[]>([]);
  const [dashboardServers, setDashboardServers] = useState<DashboardServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, providersRes, serversRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/providers?pageSize=100&sortBy=lastContactDate&sortOrder=asc"),
          fetch("/api/servers?pageSize=200&sortBy=createdAt&sortOrder=desc"),
        ]);

        if (!statsRes.ok) throw new Error("Failed to load dashboard stats");
        if (!providersRes.ok) throw new Error("Failed to load providers");
        if (!serversRes.ok) throw new Error("Failed to load servers");

        const statsData = await statsRes.json();
        const providersData = await providersRes.json();
        const serversData = await serversRes.json();

        const providerRows = providersData.data ?? [];
        setStats(statsData);
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

  const userSendingChart = useMemo(() => userSendingWeeks(stats?.userSendingOverTime ?? []), [stats?.userSendingOverTime]);
  const providerContactLeaders = stats?.userRankings?.providerContacts ?? [];
  const weeklySendingLeaders = stats?.userRankings?.weeklySending ?? [];
  const maxProviderContacts = Math.max(1, ...providerContactLeaders.map((user) => user.providerCount));
  const maxWeeklySends = Math.max(1, ...weeklySendingLeaders.map((user) => user.totalSends));
  const totalRankedProviders = providerContactLeaders.reduce((sum, user) => sum + user.providerCount, 0);
  const totalRankedSends = weeklySendingLeaders.reduce((sum, user) => sum + user.totalSends, 0);
  const displayedDashboardServers = dashboardServers.slice(0, 3);
  const totalDashboardServers = stats?.servers.total ?? dashboardServers.length;
  const remainingDashboardServers = Math.max(0, totalDashboardServers - displayedDashboardServers.length);
  const serverStatusColors: Record<string, string> = {
    active: "#22C55E",
    pending: "#F59E0B",
    paused: "#8B5CF6",
    cancelled: "#EF4444",
    canceled: "#EF4444",
    archived: "#64748B",
    expired: "#EF4444",
    unknown: "#94A3B8",
  };
  const serverStatusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const server of dashboardServers) {
      const status = server.status || "unknown";
      counts.set(status, (counts.get(status) || 0) + 1);
    }
    const preferred = ["active", "pending", "paused", "cancelled", "archived", "expired", "unknown"];
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => {
        const aIndex = preferred.indexOf(a.status);
        const bIndex = preferred.indexOf(b.status);
        if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
        return b.count - a.count;
      });
  }, [dashboardServers]);
  const maxServerStatusCount = Math.max(1, ...serverStatusBreakdown.map((item) => item.count));

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
      <div className="grid grid-cols-1 items-start gap-4 min-[2000px]:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
        {/* Providers Requiring Action */}
        <div className="min-w-0 rounded-[10px] border border-[#E5E7EB] bg-white">
          <div className="flex flex-col gap-3 px-5 pb-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[#111827]">Providers Requiring Action</h3>
              <Info className="h-4 w-4 text-[#9CA3AF]" />
              <span className="inline-flex items-center justify-center h-[22px] min-w-[22px] rounded-full bg-[#EEF2FF] px-1.5 text-[11px] font-semibold text-[#4F46E5]">
                {actionProviders.length}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/providers" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
                View All Providers
              </Link>
              <button className="h-[30px] w-[30px] rounded-[7px] border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] transition-colors">
                <Filter className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="space-y-2 border-t border-[#E5E7EB] p-3 lg:hidden">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-[8px] border border-[#F1F5F9] bg-white p-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-gray-100" />
                </div>
              ))
            ) : actionProviders.length === 0 ? (
              <div className="rounded-[8px] border border-[#F1F5F9] bg-[#F8FAFC] p-6 text-center text-[13px] text-[#6B7280]">
                No providers currently require action.
              </div>
            ) : (
              actionProviders.map((p) => (
                <Link
                  key={p.id}
                  href={`/providers/${p.id}`}
                  className="block rounded-[8px] border border-[#F1F5F9] bg-white p-3 transition-colors hover:border-[#C7D2FE]"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded bg-[#EEF2FF] text-[10px] font-semibold text-[#4F46E5]">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-[#111827]">{p.name}</p>
                        <StatusBadge value={displayProviderStatus(p)} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] text-[#6B7280]">{providerNote(p)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="min-w-0 rounded-[7px] bg-[#F8FAFC] p-2">
                      <p className="font-semibold uppercase tracking-[0.03em] text-[#64748B]">Owned</p>
                      <p className="mt-1 font-bold text-[#111827]">{p.assignedUserId ? "Yes" : "No"}</p>
                    </div>
                    <div className="min-w-0 rounded-[7px] bg-[#F8FAFC] p-2">
                      <p className="font-semibold uppercase tracking-[0.03em] text-[#64748B]">Assigned</p>
                      <p className="mt-1 truncate font-bold text-[#111827]">{p.assignedUserName || "-"}</p>
                    </div>
                    <div className="min-w-0 rounded-[7px] bg-[#F8FAFC] p-2">
                      <p className="font-semibold uppercase tracking-[0.03em] text-[#64748B]">Contact</p>
                      <p className="mt-1 truncate font-bold text-[#111827]">
                        {p.lastContactDate
                          ? new Date(p.lastContactDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "Never"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[860px]">
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

        {/* Servers */}
        <div className="flex min-w-0 flex-col rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-[#111827]">Servers</h3>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">Recent server inventory across your providers.</p>
            </div>
            <Link href="/servers" className="shrink-0 text-[13px] font-medium text-[#4F46E5] hover:underline">
              View All Servers
            </Link>
          </div>
          <div className="border-t border-[#E5E7EB] px-5 py-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between">
                      <div className="h-3.5 w-24 animate-pulse rounded bg-gray-100" />
                      <div className="h-3.5 w-8 animate-pulse rounded bg-gray-100" />
                    </div>
                    <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : dashboardServers.length === 0 ? (
              <div className="flex h-[160px] items-center justify-center text-center text-[13px] text-[#6B7280]">
                No servers available yet.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] min-[2000px]:grid-cols-1">
                <div className="min-w-0 space-y-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="min-w-0 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Total</p>
                      <p className="mt-1 text-[18px] font-bold leading-none text-[#111827]">{totalDashboardServers}</p>
                    </div>
                    <div className="min-w-0 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Active</p>
                      <p className="mt-1 text-[18px] font-bold leading-none text-[#111827]">{stats?.servers.active ?? 0}</p>
                    </div>
                    <div className="min-w-0 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Other</p>
                      <p className="mt-1 text-[18px] font-bold leading-none text-[#111827]">{Math.max(0, totalDashboardServers - (stats?.servers.active ?? 0))}</p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {serverStatusBreakdown.map((item) => {
                      const label = item.status.replace(/_/g, " ");
                      const color = serverStatusColors[item.status] || "#4F46E5";
                      const width = `${Math.max(8, (item.count / maxServerStatusCount) * 100)}%`;
                      return (
                        <div key={item.status}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                              <span className="truncate text-[12px] font-semibold capitalize text-[#374151]">{label}</span>
                            </div>
                            <span className="text-[12px] font-bold text-[#111827]">{item.count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
                            <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-0 rounded-[8px] border border-[#E5E7EB]">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] px-3 py-2">
                    <p className="text-[12px] font-semibold text-[#111827]">Latest Servers</p>
                    {remainingDashboardServers > 0 && (
                      <span className="text-[11px] font-medium text-[#6B7280]">+{remainingDashboardServers} more</span>
                    )}
                  </div>
                  <div className="divide-y divide-[#F1F5F9]">
                    {displayedDashboardServers.slice(0, 2).map((server) => (
                      <div key={server.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <Link href="/servers" className="block truncate text-[12px] font-bold text-[#2563EB] hover:underline">
                            {server.name}
                          </Link>
                          <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
                            {server.providerName ?? "No provider"} · {money(server.monthlyCost, server.currency ?? "USD")}
                          </p>
                        </div>
                        <StatusBadge value={server.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Performance Rankings */}
        <div className="xl:col-span-2 flex min-w-0 flex-col rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#4F46E5]" />
                <h3 className="text-[15px] font-semibold text-[#111827]">User Performance Rankings</h3>
              </div>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Provider contacts from saved email conversations and sends from this week.
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-[999px] border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
              Week of {stats?.userRankings?.weekStart ? new Date(stats.userRankings.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "now"}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Visible Users</p>
              <p className="mt-1 text-[22px] font-bold leading-none text-[#111827]">{loading ? "..." : compactNumber(Math.max(providerContactLeaders.length, weeklySendingLeaders.length))}</p>
            </div>
            <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Ranked Providers</p>
              <p className="mt-1 text-[22px] font-bold leading-none text-[#111827]">{loading ? "..." : compactNumber(totalRankedProviders)}</p>
            </div>
            <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Weekly Sends</p>
              <p className="mt-1 text-[22px] font-bold leading-none text-[#111827]">{loading ? "..." : compactNumber(totalRankedSends)}</p>
            </div>
            <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Inbox Sync</p>
              <p className="mt-1 truncate text-[13px] font-semibold text-[#111827]">
                {stats?.userRankings?.lastInboxSync
                  ? new Date(stats.userRankings.lastInboxSync).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "Not synced"}
              </p>
            </div>
          </div>

          <div className="grid flex-1 content-start gap-4 2xl:grid-cols-2">
            <div className="min-w-0 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#0891B2]" />
                  <p className="text-[13px] font-semibold text-[#111827]">Provider Contacts</p>
                </div>
                <Link href="/email-inbox" className="text-[12px] font-medium text-[#4F46E5] hover:underline">
                  Inbox
                </Link>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[62px] rounded-[8px] border border-[#E5E7EB] bg-white p-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                      <div className="mt-3 h-2 w-full animate-pulse rounded bg-gray-100" />
                    </div>
                  ))
                ) : providerContactLeaders.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-8 text-center">
                    <p className="text-[13px] font-medium text-[#475569]">No sent provider conversations found</p>
                    <p className="mt-1 text-[12px] text-[#94A3B8]">Sync sent mailboxes or apply saved emails to providers.</p>
                  </div>
                ) : providerContactLeaders.map((user, index) => (
                  <div key={user.userId} className="rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECFEFF] text-[10px] font-bold text-[#0891B2]">
                        {index + 1}
                      </span>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[11px] font-bold text-[#4F46E5]">
                        {initials(user.userName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#111827]">{user.userName}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div className="h-full rounded-full bg-[#0891B2]" style={{ width: `${Math.max(6, (user.providerCount / maxProviderContacts) * 100)}%` }} />
                        </div>
                        <p className="mt-1 truncate text-[11px] text-[#6B7280]">
                          {compactNumber(user.emailCount)} emails · {user.source}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-bold text-[#111827]">{user.providerCount}</p>
                        <p className="text-[10px] uppercase tracking-[0.03em] text-[#94A3B8]">providers</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-[#16A34A]" />
                  <p className="text-[13px] font-semibold text-[#111827]">Weekly Sending</p>
                </div>
                <Link href="/reports" className="text-[12px] font-medium text-[#4F46E5] hover:underline">
                  Reports
                </Link>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[62px] rounded-[8px] border border-[#E5E7EB] bg-white p-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                      <div className="mt-3 h-2 w-full animate-pulse rounded bg-gray-100" />
                    </div>
                  ))
                ) : weeklySendingLeaders.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-6 text-center">
                    <p className="text-[13px] font-medium text-[#475569]">No sending numbers for this week</p>
                    <p className="mt-1 text-[12px] text-[#94A3B8]">Add server statistics to populate the ranking.</p>
                  </div>
                ) : weeklySendingLeaders.map((user, index) => (
                  <div key={user.userId} className="rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[10px] font-bold text-[#15803D]">
                        {index + 1}
                      </span>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0FDF4] text-[11px] font-bold text-[#15803D]">
                        {initials(user.userName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[#111827]">{user.userName}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${Math.max(6, (user.totalSends / maxWeeklySends) * 100)}%` }} />
                        </div>
                        <p className="mt-1 truncate text-[11px] text-[#6B7280]">
                          {user.serverCount} server{user.serverCount === 1 ? "" : "s"} · {user.daysActive} active day{user.daysActive === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-bold text-[#111827]">{compactNumber(user.totalSends)}</p>
                        <p className="text-[10px] uppercase tracking-[0.03em] text-[#94A3B8]">sent</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
