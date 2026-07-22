"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Inbox, LineChart, Mail, RefreshCw, Server, Target, TrendingUp, UserRound } from "lucide-react";

interface DashboardStats {
  providers: {
    total: number;
    byContactStatus: Record<string, number>;
    byResponseStatus?: Record<string, number>;
    byDecision: Record<string, number>;
    owned: number;
  };
  tasks: { byStatus: Record<string, number> };
  outreach: { byChannel: Record<string, number> };
  sending: { totalSends: number; totalBounces: number; totalSuccessful: number; totalComplaints: number };
  sendingOverTime: { date: string; totalSends: number; successfulSends: number; bounces: number }[];
  serverUtilization: { serverId: string; serverName: string; providerId: string; status: string; lastSendDate: string | null; totalSends: number }[];
  servers: { total: number; active: number };
  campaigns: { total: number; active: number };
}

interface ServerOption {
  id: string;
  name: string;
  providerName: string | null;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  status?: string;
}

interface ServerTrackingReport {
  server: {
    id: string;
    name: string;
    status: string;
    providerName: string | null;
  };
  totals: {
    planned: number;
    sent: number;
    successful: number;
    bounces: number;
    complaints: number;
    unsubscribes: number;
  };
  daily: Array<{
    date: string;
    planned: number;
    sent: number;
    successful: number;
    bounces: number;
    complaints: number;
    unsubscribes: number;
  }>;
}

const STAGE_COLORS: Record<string, string> = {
  "Not Contacted": "#94A3B8",
  Contacted: "#4F46E5",
  "Awaiting Reply": "#60A5FA",
  Replied: "#8B5CF6",
  Accepted: "#22C55E",
  Denied: "#EF4444",
  Prohibited: "#EA580C",
};

function fmt(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(numerator: number, denominator: number, precision = 1) {
  if (!denominator) return Number(0).toFixed(precision);
  return ((numerator / denominator) * 100).toFixed(precision);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "green" | "orange" | "violet";
}) {
  const colors = {
    blue: "bg-[#EFF6FF] text-[#2563EB]",
    green: "bg-[#ECFDF5] text-[#16A34A]",
    orange: "bg-[#FFF7ED] text-[#EA580C]",
    violet: "bg-[#F5F3FF] text-[#7C3AED]",
  }[tone];

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colors}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-[#6B7280]">{label}</p>
          <p className="mt-1 text-[24px] font-bold leading-none text-[#111827]">{value}</p>
          <p className="mt-2 text-[11px] font-semibold text-[#16A34A]">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
        <h3 className="text-[14px] font-bold text-[#111827]">{title}</h3>
        <span className="rounded-[6px] border border-[#E5E7EB] px-2 py-1 text-[11px] font-medium text-[#6B7280]">Live data</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const isAdmin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingReport, setTrackingReport] = useState<ServerTrackingReport | null>(null);
  const [trackingServerId, setTrackingServerId] = useState("");
  const [trackingStart, setTrackingStart] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return date.toISOString().split("T")[0];
  });
  const [trackingEnd, setTrackingEnd] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (isAdmin && selectedUserId !== "all") params.set("userId", selectedUserId);
    const query = params.toString();
    fetch(`/api/dashboard/stats${query ? `?${query}` : ""}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((json) => setStats(json))
      .finally(() => setLoading(false));
  }, [isAdmin, selectedUserId]);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "500", sortBy: "name", sortOrder: "asc" });
    if (isAdmin && selectedUserId !== "all") params.set("assignedUserId", selectedUserId);
    fetch(`/api/servers?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch servers");
        return res.json();
      })
      .then((json) => {
        const rows = json.data ?? [];
        setServers(rows);
        setTrackingServerId("all");
        setTrackingReport(null);
      })
      .catch(() => setServers([]));
  }, [isAdmin, selectedUserId]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/users?all=1&status=active")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json();
      })
      .then((json) => setUsers(json.data || []))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  const fetchTrackingReport = useCallback(async () => {
    setTrackingLoading(true);
    try {
      const params = new URLSearchParams({
        serverId: trackingServerId || "all",
        start: trackingStart,
        end: trackingEnd,
      });
      if (isAdmin && selectedUserId !== "all") params.set("userId", selectedUserId);
      const res = await fetch(`/api/reports/server-tracking?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch tracking report");
      setTrackingReport(await res.json());
    } finally {
      setTrackingLoading(false);
    }
  }, [isAdmin, selectedUserId, trackingEnd, trackingServerId, trackingStart]);

  const providerFunnel = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Not Contacted", value: stats.providers.byContactStatus.not_contacted ?? 0 },
      { name: "Contacted", value: stats.providers.byContactStatus.contacted ?? 0 },
      { name: "Awaiting Reply", value: (stats.providers.byResponseStatus?.no_response ?? 0) + (stats.providers.byResponseStatus?.needs_follow_up ?? 0) },
      { name: "Replied", value: stats.providers.byResponseStatus?.replied ?? 0 },
      { name: "Accepted", value: stats.providers.byDecision.accepted ?? 0 },
      { name: "Denied", value: stats.providers.byDecision.denied ?? 0 },
      { name: "Prohibited", value: stats.providers.byDecision.prohibited_sending ?? 0 },
    ];
  }, [stats]);

  const decisionData = stats ? Object.entries(stats.providers.byDecision).map(([name, value]) => ({ name: fmt(name), value })) : [];
  const channelData = stats ? Object.entries(stats.outreach.byChannel).map(([name, count]) => ({ name: fmt(name), count })) : [];
  const taskData = stats ? Object.entries(stats.tasks.byStatus).map(([name, value]) => ({ name: fmt(name), value })) : [];
  const deliveryRate = stats ? pct(stats.sending.totalSuccessful, stats.sending.totalSends, 1) : "0.0";
  const bounceRate = stats ? pct(stats.sending.totalBounces, stats.sending.totalSends, 2) : "0.00";
  const acceptanceRate = stats ? pct(stats.providers.byDecision.accepted ?? 0, stats.providers.total, 1) : "0.0";
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const reportScope = isAdmin ? selectedUser?.name || "All users" : "My report";

  const chartTooltipStyle = {
    borderRadius: "8px",
    border: "1px solid #E5E7EB",
    background: "#fff",
    fontSize: "12px",
    boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[#111827]">Reports</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">Operational analytics for provider pipeline, server statistics, and server utilization.</p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#4B5563]">
            <UserRound className="h-3.5 w-3.5 text-[#4F46E5]" />
            {reportScope}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-2 rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] font-semibold text-[#374151]">
              <UserRound className="h-4 w-4 text-[#6B7280]" />
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="min-w-[180px] bg-transparent text-[13px] font-semibold text-[#111827] outline-none"
              >
                <option value="all">All users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a href="/api/export?entity=sending_logs" className="inline-flex h-[38px] items-center gap-2 rounded-[8px] border border-[#E5E7EB] bg-white px-4 text-[13px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
            <Download className="h-4 w-4" />
            Export Server Stats CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Provider Acceptance" value={`${acceptanceRate}%`} sub={`${stats?.providers.byDecision.accepted ?? 0} accepted`} icon={Target} tone="green" />
        <Kpi label="Total Volume" value={compact(stats?.sending.totalSends ?? 0)} sub={`${deliveryRate}% successful`} icon={Mail} tone="blue" />
        <Kpi label="Bounce Rate" value={`${bounceRate}%`} sub={`${stats?.sending.totalBounces ?? 0} bounces`} icon={TrendingUp} tone="orange" />
        <Kpi label="Active Servers" value={`${stats?.servers.active ?? 0}/${stats?.servers.total ?? 0}`} sub="server inventory" icon={Server} tone="violet" />
      </div>

      <Panel title="Manual Server Tracking">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1 space-y-1.5 text-[12px] font-semibold text-[#374151]">
            Server
            <select
              value={trackingServerId}
              onChange={(event) => {
                setTrackingServerId(event.target.value);
                setTrackingReport(null);
              }}
              className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            >
              <option value="all">
                {isAdmin && selectedUserId === "all" ? "All existing servers" : "All assigned servers"}
              </option>
              {servers.length === 0 ? (
                <option value="">No servers found</option>
              ) : (
                servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}{server.providerName ? ` - ${server.providerName}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="space-y-1.5 text-[12px] font-semibold text-[#374151]">
            Start Date
            <input
              type="date"
              value={trackingStart}
              onChange={(event) => {
                setTrackingStart(event.target.value);
                setTrackingReport(null);
              }}
              className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            />
          </label>
          <label className="space-y-1.5 text-[12px] font-semibold text-[#374151]">
            End Date
            <input
              type="date"
              value={trackingEnd}
              onChange={(event) => {
                setTrackingEnd(event.target.value);
                setTrackingReport(null);
              }}
              className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            />
          </label>
          <button
            onClick={fetchTrackingReport}
            disabled={servers.length === 0 || trackingLoading}
            className="inline-flex h-[36px] items-center gap-2 rounded-[7px] bg-[#4F46E5] px-4 text-[13px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${trackingLoading ? "animate-spin" : ""}`} />
            Run Report
          </button>
        </div>

        {trackingReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              {[
                ["Planned", trackingReport.totals.planned],
                ["Sent", trackingReport.totals.sent],
                ["Successful", trackingReport.totals.successful],
                ["Bounces", trackingReport.totals.bounces],
                ["Complaints", trackingReport.totals.complaints],
                ["Unsubscribes", trackingReport.totals.unsubscribes],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.03em] text-[#6B7280]">{label}</p>
                  <p className="mt-1 text-[20px] font-bold text-[#111827]">{compact(Number(value))}</p>
                </div>
              ))}
            </div>

            {trackingReport.daily.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trackingReport.daily} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="manualSentFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={42} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="sent" name="Sent" stroke="#4F46E5" strokeWidth={2} fill="url(#manualSentFill)" dot={{ r: 3, fill: "#fff", stroke: "#4F46E5", strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="successful" name="Successful" stroke="#16A34A" strokeWidth={2} fill="transparent" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>

                <div className="overflow-x-auto rounded-[8px] border border-[#E5E7EB]">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                        {["Date", "Planned", "Sent", "Successful", "Bounces", "Complaints", "Unsubs", "Delivery"].map((header) => (
                          <th key={header} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.03em] text-[#4B5563]">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trackingReport.daily.map((row) => (
                        <tr key={row.date} className="border-b border-[#F1F5F9] last:border-0">
                          <td className="px-3 py-2 text-[13px] font-semibold text-[#111827]">{row.date}</td>
                          <td className="px-3 py-2 text-[13px] text-[#374151]">{row.planned}</td>
                          <td className="px-3 py-2 text-[13px] text-[#374151]">{row.sent}</td>
                          <td className="px-3 py-2 text-[13px] text-[#16A34A]">{row.successful}</td>
                          <td className="px-3 py-2 text-[13px] text-[#EA580C]">{row.bounces}</td>
                          <td className="px-3 py-2 text-[13px] text-[#DC2626]">{row.complaints}</td>
                          <td className="px-3 py-2 text-[13px] text-[#6B7280]">{row.unsubscribes}</td>
                          <td className="px-3 py-2 text-[13px] font-semibold text-[#111827]">{pct(row.successful, row.sent, 1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="grid h-[220px] place-items-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[13px] text-[#6B7280]">
                No statistics found for this server and date range.
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-[180px] place-items-center rounded-[8px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[13px] text-[#6B7280]">
            Select a server and date range to generate a manual tracking report.
          </div>
        )}
      </Panel>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[320px] animate-pulse rounded-[10px] border border-[#E5E7EB] bg-white" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="Provider Funnel">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={providerFunnel} margin={{ top: 10, right: 12, left: 0, bottom: 20 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={42}>
                  {providerFunnel.map((item) => <Cell key={item.name} fill={STAGE_COLORS[item.name] ?? "#4F46E5"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Server Statistics">
            {stats.sendingOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={stats.sendingOverTime} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="successfulSends" name="Successful" stroke="#4F46E5" strokeWidth={2} fill="url(#sentFill)" dot={{ r: 3, fill: "#fff", stroke: "#4F46E5", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-[13px] text-[#9CA3AF]"><Inbox className="mr-2 h-7 w-7" /> No server statistics yet</div>
            )}
          </Panel>

          <Panel title="Provider Decisions">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={decisionData} innerRadius={56} outerRadius={86} paddingAngle={3} dataKey="value" stroke="none">
                  {decisionData.map((item, index) => <Cell key={item.name} fill={["#22C55E", "#EF4444", "#F59E0B", "#94A3B8", "#4F46E5"][index % 5]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-3">
              {decisionData.map((item) => <span key={item.name} className="text-[12px] text-[#6B7280]"><strong className="text-[#111827]">{item.value}</strong> {item.name}</span>)}
            </div>
          </Panel>

          <Panel title="Outreach & Tasks">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={channelData} layout="vertical">
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={taskData} layout="vertical">
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="value" fill="#22C55E" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Server Utilization">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.serverUtilization.slice(0, 12)} layout="vertical">
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="serverName" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={135} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="totalSends" fill="#7C3AED" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Report Notes">
            <div className="grid h-[300px] place-items-center rounded-[8px] bg-[#F8FAFC] p-6 text-center">
              <div>
                <LineChart className="mx-auto mb-3 h-8 w-8 text-[#4F46E5]" />
                <p className="text-[14px] font-bold text-[#111827]">Reports now use live operational data.</p>
                <p className="mt-1 max-w-md text-[13px] text-[#6B7280]">Provider response status, server statistics, server utilization, outreach channels, and tasks are all pulled from the current CRM database.</p>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
