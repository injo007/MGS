"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  AlertTriangle,
  Activity,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Inbox,
  Mail,
  MoreHorizontal,
  Pause,
  Search,
  Settings2,
  ShieldAlert,
  Square,
  Target,
  Upload,
  X,
} from "lucide-react";
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

interface AssignedUser {
  id: string;
  name: string;
  email: string;
}

interface ServerIp {
  id: string;
  address: string;
}

interface ServerRow {
  id: string;
  name: string;
  providerId: string;
  providerName: string | null;
  plan: string | null;
  location: string | null;
  status: string;
  dailySendLimit: number | null;
  notes: string | null;
  todaySends: number;
  totalSends: number;
  totalSuccessful: number;
  totalBounces: number;
  lastSendDate: string | null;
  dailyHistory: { date: string; label: string; sends: number; successful: number; bounces: number }[];
  assignedUsers: AssignedUser[];
  ips?: ServerIp[];
}

interface SendingItem {
  id: string;
  date: string;
  mailerId: string | null;
  mailerName?: string | null;
  serverId: string | null;
  serverName: string | null;
  providerName: string | null;
  actualSends: number | null;
  successfulSends: number | null;
  bounces: number | null;
  complaints: number | null;
  unsubscribes: number | null;
  operationalStatus: string | null;
  deliveryNotes: string | null;
}

const PAGE_SIZE = 10;
const BASE_TABS = [
  { key: "all", label: "All Servers" },
  { key: "active", label: "Active Servers" },
  { key: "attention", label: "Needs Attention" },
  { key: "paused", label: "Paused" },
];
const WARMUP_TAB = { key: "warmup", label: "Warmup" };
const USER_CHART_COLORS = ["#4F46E5", "#16A34A", "#EA580C", "#0891B2", "#8B5CF6", "#DC2626"];
type AlertFilter = "all" | "bounce" | "ts04" | "capacity" | null;
type StatsRangeKey = "week" | "currentMonth" | "lastMonth" | "custom";

type DrawerTextKey =
  | "dailyLimit"
  | "hourlyCap"
  | "warmupIncrement"
  | "maxParallel"
  | "fromAccounts"
  | "bounceThreshold"
  | "ts04Threshold"
  | "complaintThreshold"
  | "deferralThreshold";

const LIMIT_FIELDS: { label: string; key: DrawerTextKey }[] = [
  { label: "Daily Volume Limit", key: "dailyLimit" },
  { label: "Hourly Volume Cap", key: "hourlyCap" },
  { label: "Warmup Increment / Day", key: "warmupIncrement" },
  { label: "Max Parallel Activity", key: "maxParallel" },
  { label: "Tracked Accounts", key: "fromAccounts" },
];

const GUARDRAIL_FIELDS: { label: string; key: DrawerTextKey }[] = [
  { label: "Bounce Threshold %", key: "bounceThreshold" },
  { label: "TSS04 Threshold %", key: "ts04Threshold" },
  { label: "Complaint Threshold %", key: "complaintThreshold" },
  { label: "Deferral Threshold %", key: "deferralThreshold" },
];

function pct(numerator: number, denominator: number, precision = 1) {
  if (!denominator) return Number(0).toFixed(precision);
  return ((numerator / denominator) * 100).toFixed(precision);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function dateKey(date: Date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
}

function dayRange(startKey: string, endKey: string) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const days: { key: string; label: string; dateLabel: string }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push({
      key: dateKey(cursor),
      label: cursor.toLocaleDateString("en-US", { weekday: "short" }),
      dateLabel: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function weekStartKey(value: Date) {
  const date = new Date(value);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function warmupStage(server: ServerRow) {
  const limit = server.dailySendLimit || 0;
  if (server.status === "paused" || server.status === "suspended") return "Paused";
  if (limit >= 2000 || server.totalSends > 10000) return "Mature";
  if (limit >= 1200) return "Stage 3";
  if (limit >= 700) return "Stage 2";
  return "Stage 1";
}

function sendingStatus(server: ServerRow, bounceRate: number, ts04Rate: number) {
  if (["paused", "cancelled", "expired"].includes(server.status)) return "paused";
  if (["suspended", "down", "port_closed", "ts04_error", "bounce", "complaint"].includes(server.status)) return "restricted";
  if (bounceRate > 3 || ts04Rate > 1) return "restricted";
  if (warmupStage(server).startsWith("Stage")) return "warmup";
  return "active";
}

function rateClass(value: number, warn: number, danger: number) {
  if (value >= danger) return "bg-[#FEF2F2] text-[#DC2626]";
  if (value >= warn) return "bg-[#FFF7ED] text-[#EA580C]";
  return "text-[#15803D]";
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "violet" | "orange" | "blue" | "green" | "red" | "slate";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    violet: "bg-[#F5F3FF] text-[#7C3AED]",
    orange: "bg-[#FFF7ED] text-[#EA580C]",
    blue: "bg-[#EFF6FF] text-[#2563EB]",
    green: "bg-[#ECFDF5] text-[#16A34A]",
    red: "bg-[#FEF2F2] text-[#DC2626]",
    slate: "bg-[#F1F5F9] text-[#64748B]",
  }[tone];

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6B7280]">{label}</p>
          <p className="mt-1 text-[24px] font-bold leading-none tracking-tight text-[#111827]">{value}</p>
          <p className="mt-2 text-[11px] font-semibold text-[#16A34A]">{sub}</p>
        </div>
      </div>
    </div>
  );
}

export default function SendingPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [logs, setLogs] = useState<SendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [warmupFilter, setWarmupFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState<AlertFilter>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [drawerServerId, setDrawerServerId] = useState<string | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [sentDrafts, setSentDrafts] = useState<Record<string, string>>({});
  const [savingLimits, setSavingLimits] = useState<Record<string, boolean>>({});
  const [savingSentToday, setSavingSentToday] = useState<Record<string, boolean>>({});
  const [savingWeeklyStats, setSavingWeeklyStats] = useState<Record<string, boolean>>({});
  const [statsRange, setStatsRange] = useState<StatsRangeKey>("week");
  const [statsCustomRange, setStatsCustomRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [statsLogs, setStatsLogs] = useState<SendingItem[]>([]);
  const [loadingStatsLogs, setLoadingStatsLogs] = useState(false);
  const [rangeDailyDrafts, setRangeDailyDrafts] = useState<Record<string, string>>({});
  const [warmupEnabled, setWarmupEnabled] = useState(false);
  const [autoThrottle, setAutoThrottle] = useState<Record<string, boolean>>({});
  const [drawerForm, setDrawerForm] = useState({
    dailyLimit: "",
    hourlyCap: "200",
    warmupIncrement: "200",
    maxParallel: "50",
    fromAccounts: "8",
    bounceThreshold: "3.0",
    ts04Threshold: "2.0",
    complaintThreshold: "0.10",
    deferralThreshold: "10.0",
    sendingWindow: "07:00 - 22:00",
    timezone: "Europe/Berlin (UTC+2)",
    notes: "",
    monitoring: true,
    autoPause: true,
    retryDeferred: true,
    spamTrapProtection: true,
    weekendSending: false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [serversRes, sendingRes] = await Promise.all([
        fetch("/api/servers?pageSize=200&sortBy=createdAt&sortOrder=desc"),
        fetch("/api/sending?pageSize=1000"),
      ]);
      const serversJson = serversRes.ok ? await serversRes.json() : { data: [] };
      const sendingJson = sendingRes.ok ? await sendingRes.json() : { data: [] };
      const serverRows: ServerRow[] = serversJson.data ?? [];
      setServers(serverRows);
      setLogs(sendingJson.data ?? []);
      setLimitDrafts(Object.fromEntries(serverRows.map((server) => [server.id, String(server.dailySendLimit ?? "")])));
      setSentDrafts(Object.fromEntries(serverRows.map((server) => [server.id, String(server.todaySends ?? 0)])));
      setAutoThrottle((current) => ({
        ...Object.fromEntries(serverRows.map((server) => [server.id, !["paused", "suspended", "cancelled"].includes(server.status)])),
        ...current,
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const logAgg = useMemo(() => {
    const byServer: Record<string, { complaints: number; unsubscribes: number; ts04: number; lastUpdated: string | null }> = {};
    for (const log of logs) {
      if (!log.serverId) continue;
      if (!byServer[log.serverId]) byServer[log.serverId] = { complaints: 0, unsubscribes: 0, ts04: 0, lastUpdated: null };
      byServer[log.serverId].complaints += Number(log.complaints || 0);
      byServer[log.serverId].unsubscribes += Number(log.unsubscribes || 0);
      const deliveryNotes = log.deliveryNotes?.toLowerCase() || "";
      if (log.operationalStatus === "watch" || deliveryNotes.includes("ts04") || deliveryNotes.includes("tss04")) {
        byServer[log.serverId].ts04 += Math.max(1, Math.round(Number(log.bounces || 0) * 0.4));
      }
      if (!byServer[log.serverId].lastUpdated || new Date(log.date) > new Date(byServer[log.serverId].lastUpdated!)) {
        byServer[log.serverId].lastUpdated = log.date;
      }
    }
    return byServer;
  }, [logs]);

  const enriched = useMemo(() => {
    return servers.map((server) => {
      const agg = logAgg[server.id] ?? { complaints: 0, unsubscribes: 0, ts04: 0, lastUpdated: server.lastSendDate };
      const actual = Number(server.totalSends || 0);
      const delivered = Number(server.totalSuccessful || 0);
      const bounceRate = Number(pct(Number(server.totalBounces || 0), actual, 2));
      const complaintRate = Number(pct(agg.complaints, actual, 2));
      const ts04Rate = Number(pct(agg.ts04, actual, 2));
      const derivedStatus = sendingStatus(server, bounceRate, ts04Rate);
      const status = !warmupEnabled && derivedStatus === "warmup" ? "active" : derivedStatus;
      const limit = Number(limitDrafts[server.id] || server.dailySendLimit || 0);
      const capacity = limit ? (Number(server.todaySends || 0) / limit) * 100 : 0;
      return { ...server, delivered, bounceRate, complaintRate, ts04Rate, status, limit, capacity, agg };
    });
  }, [limitDrafts, logAgg, servers, warmupEnabled]);

  const providers = useMemo(() => Array.from(new Map(servers.map((s) => [s.providerId, s.providerName || "Unknown"])).entries()), [servers]);
  const regions = useMemo(() => Array.from(new Set(servers.map((s) => s.location).filter(Boolean))) as string[], [servers]);
  const users = useMemo(() => {
    const map = new Map<string, AssignedUser>();
    for (const server of servers) for (const user of server.assignedUsers || []) map.set(user.id, user);
    return Array.from(map.values());
  }, [servers]);
  const selectedServers = useMemo(() => enriched.filter((server) => selected.includes(server.id)), [enriched, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((server) => {
      if (activeTab === "active" && server.status !== "active") return false;
      if (activeTab === "warmup" && warmupEnabled && server.status !== "warmup") return false;
      if (activeTab === "attention" && server.status !== "restricted" && server.bounceRate <= 3 && server.ts04Rate <= 1 && server.capacity < 90) return false;
      if (activeTab === "paused" && server.status !== "paused") return false;
      if (alertFilter === "bounce" && server.bounceRate <= 3) return false;
      if (alertFilter === "ts04" && server.ts04Rate <= 1) return false;
      if (alertFilter === "capacity" && server.capacity < 90) return false;
      if (alertFilter === "all" && server.status !== "restricted" && server.bounceRate <= 3 && server.ts04Rate <= 1 && server.capacity < 90) return false;
      if (providerFilter !== "all" && server.providerId !== providerFilter) return false;
      if (statusFilter !== "all" && server.status !== statusFilter) return false;
      if (regionFilter !== "all" && server.location !== regionFilter) return false;
      if (warmupEnabled && warmupFilter !== "all" && warmupStage(server) !== warmupFilter) return false;
      if (assignedFilter !== "all" && !server.assignedUsers.some((user) => user.id === assignedFilter)) return false;
      if (!q) return true;
      return [server.name, server.providerName, server.location, server.notes].some((value) => value?.toLowerCase().includes(q));
    });
  }, [activeTab, alertFilter, assignedFilter, enriched, providerFilter, regionFilter, search, statusFilter, warmupEnabled, warmupFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setSelected([]);
  }, [activeTab, alertFilter, providerFilter, statusFilter, regionFilter, warmupFilter, assignedFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  let selectedStatsAnchorId: string | null = null;
  for (let index = paginated.length - 1; index >= 0; index--) {
    if (selected.includes(paginated[index].id)) {
      selectedStatsAnchorId = paginated[index].id;
      break;
    }
  }
  const drawerServer = enriched.find((server) => server.id === drawerServerId) ?? null;
  const statsRangeWindow = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    let start = addDays(today, -6);
    let end = today;
    let label = "This week";

    if (statsRange === "currentMonth") {
      start = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      end = today;
      label = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else if (statsRange === "lastMonth") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
      end = new Date(today.getFullYear(), today.getMonth(), 0, 12);
      label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else if (statsRange === "custom") {
      start = statsCustomRange.startDate ? dateFromKey(statsCustomRange.startDate) : start;
      end = statsCustomRange.endDate ? dateFromKey(statsCustomRange.endDate) : end;
      label = statsCustomRange.startDate && statsCustomRange.endDate ? "Custom range" : "Choose custom dates";
    }

    const startKey = dateKey(start);
    const endKey = dateKey(end);
    return {
      startKey,
      endKey,
      label,
      days: dayRange(startKey, endKey),
    };
  }, [statsCustomRange.endDate, statsCustomRange.startDate, statsRange]);

  useEffect(() => {
    if (!drawerServer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerForm((current) => ({
      ...current,
      dailyLimit: String(drawerServer.dailySendLimit ?? ""),
      notes: drawerServer.notes ?? "",
      monitoring: autoThrottle[drawerServer.id] ?? true,
    }));
  }, [autoThrottle, drawerServer]);

  useEffect(() => {
    const serverIds = selectedServers.map((server) => server.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRangeDailyDrafts({});
    if (serverIds.length === 0 || statsRangeWindow.days.length === 0) {
      setStatsLogs([]);
      return;
    }

    let cancelled = false;
    setLoadingStatsLogs(true);
    const params = new URLSearchParams({
      pageSize: "5000",
      sortBy: "date",
      sortOrder: "asc",
      serverIds: serverIds.join(","),
      startDate: statsRangeWindow.startKey,
      endDate: statsRangeWindow.endKey,
    });

    fetch(`/api/sending?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setStatsLogs(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setStatsLogs([]);
          toast.error("Failed to load selected server statistics");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStatsLogs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedServers, statsRangeWindow.days.length, statsRangeWindow.endKey, statsRangeWindow.startKey]);

  const totals = useMemo(() => {
    const actual = enriched.reduce((sum, server) => sum + Number(server.totalSends || 0), 0);
    const planned = enriched.reduce((sum, server) => sum + Number(server.dailySendLimit || 0), 0);
    const sentToday = enriched.reduce((sum, server) => sum + Number(server.todaySends || 0), 0);
    const delivered = enriched.reduce((sum, server) => sum + Number(server.delivered || 0), 0);
    const bounces = enriched.reduce((sum, server) => sum + Number(server.totalBounces || 0), 0);
    const complaints = enriched.reduce((sum, server) => sum + Number(server.agg.complaints || 0), 0);
    const ts04 = enriched.reduce((sum, server) => sum + Number(server.agg.ts04 || 0), 0);
    return { actual, planned, sentToday, delivered, bounces, complaints, ts04 };
  }, [enriched]);

  const errorBreakdown = [
    { name: "Bounce", value: totals.bounces, color: "#EF4444", rate: pct(totals.bounces, totals.actual, 2) },
    { name: "TSS04", value: totals.ts04, color: "#F97316", rate: pct(totals.ts04, totals.actual, 2) },
    { name: "Complaints", value: totals.complaints, color: "#8B5CF6", rate: pct(totals.complaints, totals.actual, 2) },
    { name: "Deferrals", value: Math.round(totals.bounces * 0.2), color: "#2563EB", rate: pct(Math.round(totals.bounces * 0.2), totals.actual, 2) },
  ];

  const weeklyStats = useMemo(() => {
    const serverIds = selectedServers.map((server) => server.id);
    const rows = statsRangeWindow.days.map((day) => ({
      ...day,
      sent: 0,
      delivered: 0,
      bounces: 0,
      complaints: 0,
      unsubscribes: 0,
      valuesByServer: Object.fromEntries(serverIds.map((serverId) => [serverId, 0])) as Record<string, number>,
    }));
    const byDate = new Map(rows.map((day) => [day.key, day]));

    for (const log of statsLogs) {
      if (!log.serverId) continue;
      const key = dateKey(new Date(log.date));
      const bucket = byDate.get(key);
      if (!bucket) continue;
      const actualSends = Number(log.actualSends || 0);
      bucket.sent += actualSends;
      bucket.delivered += Number(log.successfulSends || 0);
      bucket.bounces += Number(log.bounces || 0);
      bucket.complaints += Number(log.complaints || 0);
      bucket.unsubscribes += Number(log.unsubscribes || 0);
      bucket.valuesByServer[log.serverId] = (bucket.valuesByServer[log.serverId] || 0) + actualSends;
    }

    return rows;
  }, [selectedServers, statsLogs, statsRangeWindow.days]);

  const weeklyTotals = useMemo(() => {
    return weeklyStats.reduce(
      (sum, day) => ({
        sent: sum.sent + day.sent,
        delivered: sum.delivered + day.delivered,
        bounces: sum.bounces + day.bounces,
        complaints: sum.complaints + day.complaints,
        unsubscribes: sum.unsubscribes + day.unsubscribes,
      }),
      { sent: 0, delivered: 0, bounces: 0, complaints: 0, unsubscribes: 0 }
    );
  }, [weeklyStats]);

  const trend = useMemo(
    () =>
      weeklyStats.map((day) => ({
        date: day.dateLabel,
        sent: day.sent,
        delivered: day.delivered,
      })),
    [weeklyStats]
  );

  const currentMonthUserChart = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const weeks: Record<string, string | number>[] = [];
    const cursor = new Date(monthStart);
    const seenWeeks = new Set<string>();

    while (cursor <= monthEnd) {
      const key = weekStartKey(cursor);
      if (!seenWeeks.has(key)) {
        seenWeeks.add(key);
        weeks.push({
          key,
          week: new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const byWeek = new Map(weeks.map((week) => [String(week.key), week]));
    const users = new Map<string, string>();
    const month = now.getMonth();
    const year = now.getFullYear();

    for (const log of logs) {
      const date = new Date(log.date);
      if (date.getMonth() !== month || date.getFullYear() !== year) continue;
      const userName = log.mailerName || "Unassigned";
      users.set(userName, userName);
      const bucket = byWeek.get(weekStartKey(date));
      if (bucket) bucket[userName] = Number(bucket[userName] || 0) + Number(log.actualSends || 0);
    }

    return {
      weeks,
      users: Array.from(users.keys()).slice(0, 6),
      label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }, [logs]);

  const tabCount = (key: string) => {
    if (key === "all") return enriched.length;
    if (key === "active") return enriched.filter((server) => server.status === "active").length;
    if (key === "warmup") return enriched.filter((server) => server.status === "warmup").length;
    if (key === "attention") return enriched.filter((server) => server.status === "restricted" || server.bounceRate > 3 || server.ts04Rate > 1 || server.capacity >= 90).length;
    return enriched.filter((server) => server.status === "paused").length;
  };

  const tabs = warmupEnabled ? [BASE_TABS[0], BASE_TABS[1], WARMUP_TAB, BASE_TABS[2], BASE_TABS[3]] : BASE_TABS;
  const tableColumnCount = warmupEnabled ? 15 : 14;

  const toggleRow = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const togglePage = () => {
    const ids = paginated.map((server) => server.id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected((current) => (allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))));
  };

  const saveLimit = async (serverId: string, value: string) => {
    const server = servers.find((item) => item.id === serverId);
    const normalized = value.trim();
    const current = server?.dailySendLimit != null ? String(server.dailySendLimit) : "";
    if (normalized === current) return;
    setSavingLimits((state) => ({ ...state, [serverId]: true }));
    try {
      const res = await fetch(`/api/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailySendLimit: normalized ? Number(normalized) : null }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Daily volume limit saved");
      fetchData();
    } catch {
      toast.error("Failed to save limit");
      setLimitDrafts((state) => ({ ...state, [serverId]: current }));
    } finally {
      setSavingLimits((state) => ({ ...state, [serverId]: false }));
    }
  };

  const saveDailyVolume = async (server: ServerRow, dayKey: string, value: string, currentValue: number, options?: { today?: boolean }) => {
    const normalized = value.trim();
    const current = String(currentValue ?? 0);
    if (normalized === current) return;

    const nextValue = normalized ? Number(normalized) : 0;
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      toast.error("Daily volume must be a positive number");
      return;
    }

    const savingKey = `${server.id}:${dayKey}`;
    if (options?.today) setSavingSentToday((state) => ({ ...state, [server.id]: true }));
    else setSavingWeeklyStats((state) => ({ ...state, [savingKey]: true }));

    try {
      const res = await fetch("/api/sending/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: server.id,
          date: dayKey,
          actualSends: nextValue,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(options?.today ? "Today volume saved" : "Daily volume saved");
      fetchData();
    } catch {
      toast.error(options?.today ? "Failed to save today volume" : "Failed to save daily volume");
      if (options?.today) setSentDrafts((state) => ({ ...state, [server.id]: current }));
    } finally {
      if (options?.today) setSavingSentToday((state) => ({ ...state, [server.id]: false }));
      else setSavingWeeklyStats((state) => ({ ...state, [savingKey]: false }));
    }
  };

  const saveRangeDayVolume = async (dayKey: string, value: string, currentLabel: string) => {
    const serverIds = selectedServers.map((server) => server.id);
    const actualSends = Number(value);
    if (serverIds.length === 0) {
      toast.error("Select at least one server first");
      return;
    }
    if (!Number.isFinite(actualSends) || actualSends < 0) {
      toast.error("Daily volume must be a positive number");
      return;
    }
    if (serverIds.length > 1 && !window.confirm(`Set ${formatNumber(actualSends)} sent on ${currentLabel} for each of the ${serverIds.length} selected servers? Existing records for that day will be overwritten.`)) return;

    setSavingWeeklyStats((state) => ({ ...state, [`range:${dayKey}`]: true }));
    try {
      const res = await fetch("/api/sending/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverIds,
          date: dayKey,
          actualSends,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(result.error || "Failed to save daily statistics");
      const failures = Number(result.failed || 0);
      toast.success(`Daily statistics saved for ${result.updated || 0} server${result.updated === 1 ? "" : "s"}`, {
        description: failures ? `${failures} records could not be saved. Check selected servers have IPs.` : result.removedDuplicates ? `${result.removedDuplicates} duplicate record${result.removedDuplicates === 1 ? "" : "s"} collapsed.` : undefined,
      });
      setRangeDailyDrafts((state) => {
        const next = { ...state };
        delete next[dayKey];
        return next;
      });
      fetchData();
      const params = new URLSearchParams({
        pageSize: "5000",
        sortBy: "date",
        sortOrder: "asc",
        serverIds: serverIds.join(","),
        startDate: statsRangeWindow.startKey,
        endDate: statsRangeWindow.endKey,
      });
      const refreshed = await fetch(`/api/sending?${params.toString()}`);
      if (refreshed.ok) {
        const json = await refreshed.json();
        setStatsLogs(json.data ?? []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save daily statistics");
    } finally {
      setSavingWeeklyStats((state) => ({ ...state, [`range:${dayKey}`]: false }));
    }
  };

  const saveSentToday = async (server: ServerRow, value: string) => {
    const normalized = value.trim();
    const current = String(server.todaySends ?? 0);
    if (normalized === current) return;
    await saveDailyVolume(server, dateKey(new Date()), normalized, server.todaySends ?? 0, { today: true });
  };

  const updateStatus = async (ids: string[], status: string) => {
    if (ids.length === 0) return;
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/servers/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      toast.success("Server status updated");
      setSelected([]);
      fetchData();
    } catch {
      toast.error("Failed to update server status");
    }
  };

  const showAlertFilter = (filter: AlertFilter) => {
    setActiveTab("attention");
    setAlertFilter(filter);
  };

  const saveDrawer = async () => {
    if (!drawerServer) return;
    try {
      const res = await fetch(`/api/servers/${drawerServer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailySendLimit: drawerForm.dailyLimit ? Number(drawerForm.dailyLimit) : null,
          notes: drawerForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Server tracking settings saved");
      setAutoThrottle((state) => ({ ...state, [drawerServer.id]: drawerForm.monitoring }));
      setDrawerServerId(null);
      fetchData();
    } catch {
      toast.error("Failed to save server tracking settings");
    }
  };

  const toggleDrawerFlag = (key: "monitoring" | "autoPause" | "retryDeferred" | "spamTrapProtection" | "weekendSending") => {
    setDrawerForm((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[#111827]">Server Statistics Center</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">Track daily server volumes, provider state, TSS04 flags, bounce issues, and operational notes.</p>
        </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setWarmupEnabled((enabled) => !enabled);
                if (warmupEnabled) {
                  setWarmupFilter("all");
                  if (activeTab === "warmup") setActiveTab("all");
                }
              }}
              className={`h-[38px] rounded-[8px] border px-3 text-[13px] font-semibold transition ${
                warmupEnabled
                  ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5]"
                  : "border-[#E5E7EB] bg-white text-[#475569] hover:bg-[#F9FAFB]"
              }`}
            >
              {warmupEnabled ? "Warmup Enabled" : "Enable Warmup"}
            </button>
            <select
          onChange={(e) => {
            if (e.target.value === "pause") updateStatus(selected, "paused");
            if (e.target.value === "active") updateStatus(selected, "active");
            e.currentTarget.value = "";
          }}
          className="h-[38px] rounded-[8px] bg-[#4F46E5] px-4 text-[13px] font-semibold text-white outline-none"
            >
              <option value="">Bulk Update</option>
              <option value="active">Mark selected active</option>
              <option value="pause">Mark selected paused</option>
            </select>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Tracked Servers" value={String(enriched.length)} sub={`${tabCount("active")} active`} icon={Activity} tone="violet" />
        <KpiCard label="Daily Capacity" value={formatNumber(totals.planned)} sub="+ current tracked capacity" icon={Target} tone="orange" />
        <KpiCard label="Today Volume" value={formatNumber(totals.sentToday)} sub={`${pct(totals.sentToday, totals.planned, 1)}% capacity`} icon={Activity} tone="blue" />
        <KpiCard label="Successful" value={formatNumber(totals.delivered)} sub={`${pct(totals.delivered, totals.actual, 1)}% rate`} icon={Mail} tone="green" />
        <KpiCard label="Bounce Rate" value={`${pct(totals.bounces, totals.actual, 2)}%`} sub={`${totals.bounces} bounces`} icon={Target} tone="orange" />
        <KpiCard label="TSS04" value={`${pct(totals.ts04, totals.actual, 2)}%`} sub={`${totals.ts04} flagged`} icon={AlertTriangle} tone="red" />
        <KpiCard label="Complaint Rate" value={`${pct(totals.complaints, totals.actual, 2)}%`} sub={`${totals.complaints} complaints`} icon={ShieldAlert} tone="violet" />
        <KpiCard label="Paused Servers" value={String(tabCount("paused"))} sub="manual or automatic" icon={Pause} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_220px]">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className={`flex items-center justify-between rounded-[8px] border px-4 py-3 text-[13px] font-semibold text-[#92400E] ${alertFilter === "bounce" ? "border-[#F97316] bg-[#FFEDD5] ring-2 ring-[#F97316]/15" : "border-[#FED7AA] bg-[#FFF7ED]"}`}>
              <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {enriched.filter((s) => s.bounceRate > 3).length} servers exceed bounce threshold</span>
              <button onClick={() => showAlertFilter("bounce")} className="text-[#4F46E5] hover:underline">View</button>
            </div>
            <div className={`flex items-center justify-between rounded-[8px] border px-4 py-3 text-[13px] font-semibold text-[#991B1B] ${alertFilter === "ts04" ? "border-[#DC2626] bg-[#FEE2E2] ring-2 ring-[#DC2626]/15" : "border-[#FECACA] bg-[#FEF2F2]"}`}>
              <span>{enriched.filter((s) => s.ts04Rate > 1).length} servers flagged TSS04</span>
              <button onClick={() => showAlertFilter("ts04")} className="text-[#4F46E5] hover:underline">View</button>
            </div>
            <div className={`flex items-center justify-between rounded-[8px] border px-4 py-3 text-[13px] font-semibold text-[#92400E] ${alertFilter === "all" ? "border-[#F97316] bg-[#FFEDD5] ring-2 ring-[#F97316]/15" : "border-[#FED7AA] bg-[#FFF7ED]"}`}>
              <span>{enriched.filter((s) => s.capacity >= 90).length} servers are nearing daily capacity</span>
              <button onClick={() => showAlertFilter("all")} className="text-[#4F46E5] hover:underline">View all alerts</button>
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex overflow-x-auto border-b border-[#E5E7EB] px-4">
              {tabs.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`relative flex h-[46px] items-center gap-2 px-3 text-[13px] font-semibold ${activeTab === tab.key ? "text-[#4F46E5]" : "text-[#4B5563]"}`}>
                  {tab.label}
                  <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] text-[#4F46E5]">{tabCount(tab.key)}</span>
                  {activeTab === tab.key && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#4F46E5]" />}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] p-4">
              <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="h-[34px] min-w-[150px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:w-full">
                <option value="all">All Providers</option>
                {providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[34px] min-w-[140px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                {warmupEnabled && <option value="warmup">Warmup</option>}
                <option value="restricted">Restricted</option>
                <option value="paused">Paused</option>
              </select>
              <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="h-[34px] min-w-[130px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
                <option value="all">All Regions</option>
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
              {warmupEnabled && (
                <select value={warmupFilter} onChange={(e) => setWarmupFilter(e.target.value)} className="h-[34px] min-w-[150px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
                  <option value="all">All Warmup Stages</option>
                  {["Stage 1", "Stage 2", "Stage 3", "Mature", "Paused"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              )}
              <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="h-[34px] min-w-[140px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
                <option value="all">All Assigned</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <div className="relative min-w-[220px] flex-1 max-sm:min-w-full">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search servers..." className="h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[12px] text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15" />
              </div>
              <button className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
                <Filter className="h-3.5 w-3.5" /> Filters
              </button>
              <Link href="/imports" className="ml-auto inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB] max-sm:ml-0">
                <Upload className="h-3.5 w-3.5" /> Import
              </Link>
              <Link href="/api/export?entity=sending_logs" className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
                <Download className="h-3.5 w-3.5" /> Export
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] px-4 py-3">
              <button onClick={togglePage} className="inline-flex items-center gap-2 text-[12px] font-medium text-[#374151]">
                {paginated.length > 0 && paginated.every((server) => selected.includes(server.id)) ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}
                {selected.length} selected
              </button>
              <select disabled={selected.length === 0} onChange={(e) => { if (e.target.value === "paused") updateStatus(selected, "paused"); if (e.target.value === "active") updateStatus(selected, "active"); e.currentTarget.value = ""; }} className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] disabled:opacity-50">
                <option value="">Bulk Actions</option>
                <option value="active">Mark active</option>
                <option value="paused">Mark paused</option>
              </select>
              <button disabled={selected.length === 0} className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] disabled:opacity-50">Apply Template</button>
              <button disabled={selected.length === 0} className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] disabled:opacity-50">Toggle Monitoring</button>
              <button disabled={selected.length === 0} onClick={() => setDrawerServerId(selected[0])} className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] disabled:opacity-50">Edit Limits</button>
              <button disabled={selected.length === 0} onClick={() => updateStatus(selected, "paused")} className="h-[30px] rounded-[7px] border border-[#FECACA] bg-white px-3 text-[12px] font-semibold text-[#DC2626] disabled:opacity-50">Mark Paused</button>
              {selected.length > 0 && <button onClick={() => setSelected([])} className="ml-auto text-[12px] font-medium text-[#4F46E5]">Clear selection</button>}
            </div>

            {alertFilter && (
              <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2">
                <p className="text-[12px] font-semibold text-[#374151]">
                  Showing {alertFilter === "bounce" ? "servers over bounce threshold" : alertFilter === "ts04" ? "servers flagged TSS04" : alertFilter === "capacity" ? "servers near daily capacity" : "all servers needing attention"}
                </p>
                <button
                  onClick={() => setAlertFilter(null)}
                  className="text-[12px] font-semibold text-[#4F46E5] hover:underline"
                >
                  Clear alert filter
                </button>
              </div>
            )}

            <div className="space-y-3 p-4 xl:hidden">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
                    <div className="h-5 w-36 animate-pulse rounded bg-gray-100" />
                    <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100" />
                  </div>
                ))
              ) : paginated.length === 0 ? (
                <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-6 text-center text-[13px] text-[#6B7280]">No tracked servers match the current filters.</div>
              ) : (
                paginated.map((server) => (
                  <article key={server.id} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleRow(server.id)} className="mt-0.5">
                        {selected.includes(server.id) ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}
                      </button>
                      <button onClick={() => setDrawerServerId(server.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[14px] font-bold text-[#2563EB]">{server.name}</p>
                        <p className="mt-0.5 truncate text-[12px] text-[#6B7280]">{server.providerName ?? "-"} · {server.location ?? "-"}</p>
                      </button>
                      <StatusBadge value={server.status} label={server.status === "restricted" ? "Restricted" : server.status === "warmup" ? "Warmup" : server.status === "active" ? "Active" : "Paused"} />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                      <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Daily Limit</p>
                        <input
                          value={limitDrafts[server.id] ?? ""}
                          onChange={(e) => setLimitDrafts({ ...limitDrafts, [server.id]: e.target.value })}
                          onBlur={(e) => saveLimit(server.id, e.target.value)}
                          className="mt-1 h-[30px] w-full rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827]"
                        />
                      </div>
                      <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Today Volume</p>
                        <input
                          value={sentDrafts[server.id] ?? "0"}
                          onChange={(e) => setSentDrafts({ ...sentDrafts, [server.id]: e.target.value })}
                          onBlur={(e) => saveSentToday(server, e.target.value)}
                          className="mt-1 h-[30px] w-full rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827]"
                        />
                      </div>
                      <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Success</p>
                        <p className="mt-1 font-semibold text-[#15803D]">{pct(server.delivered, server.totalSends, 1)}%</p>
                      </div>
                      <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Issues</p>
                        <p className="mt-1 font-semibold text-[#111827]">B {server.bounceRate.toFixed(1)}% · T {server.ts04Rate.toFixed(1)}%</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <span className="text-[#6B7280]">Assigned: <span className="font-semibold text-[#111827]">{server.assignedUsers?.[0]?.name || "-"}</span></span>
                      <button onClick={() => setDrawerServerId(server.id)} className="inline-flex h-8 items-center gap-1 rounded-[7px] border border-[#C7D2FE] px-2.5 font-semibold text-[#4F46E5]">
                        <Settings2 className="h-3.5 w-3.5" /> Edit Rules
                      </button>
                    </div>
                  </article>
                ))
              )}

              {selectedServers.length > 0 && (
                <div className="rounded-[10px] border border-[#DCE3F0] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[15px] font-bold text-[#111827]">Server Statistics</h2>
                      <p className="mt-0.5 text-[12px] text-[#6B7280]">
                        {selectedServers.length === 1 ? selectedServers[0].name : `${selectedServers.length} selected servers`}
                      </p>
                    </div>
                    <select value={statsRange} onChange={(event) => setStatsRange(event.target.value as StatsRangeKey)} className="h-[32px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] text-[#111827]">
                      <option value="week">This week</option>
                      <option value="currentMonth">Current month</option>
                      <option value="lastMonth">Last month</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  {statsRange === "custom" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input type="date" value={statsCustomRange.startDate} onChange={(event) => setStatsCustomRange((current) => ({ ...current, startDate: event.target.value }))} className="h-[32px] rounded-[7px] border border-[#E5E7EB] px-2 text-[12px]" />
                      <input type="date" value={statsCustomRange.endDate} onChange={(event) => setStatsCustomRange((current) => ({ ...current, endDate: event.target.value }))} className="h-[32px] rounded-[7px] border border-[#E5E7EB] px-2 text-[12px]" />
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2"><p className="text-[#6B7280]">Volume</p><p className="text-[18px] font-bold text-[#111827]">{formatNumber(weeklyTotals.sent)}</p></div>
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2"><p className="text-[#6B7280]">Success</p><p className="text-[18px] font-bold text-[#15803D]">{pct(weeklyTotals.delivered, weeklyTotals.sent, 1)}%</p></div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {weeklyStats.map((day) => {
                      const serverValues = selectedServers.map((server) => day.valuesByServer[server.id] ?? 0);
                      const allSame = serverValues.length > 0 && serverValues.every((value) => value === serverValues[0]);
                      const baseValue = allSame ? String(serverValues[0] ?? 0) : "";
                      const draftValue = rangeDailyDrafts[day.key] ?? baseValue;
                      const changed = draftValue.trim() !== "" && (!allSame || draftValue !== baseValue);
                      const savingKey = `range:${day.key}`;
                      return (
                        <div key={day.key} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] border border-[#E5E7EB] p-2">
                          <div>
                            <p className="text-[12px] font-bold text-[#111827]">{day.label}</p>
                            <p className="text-[10px] text-[#6B7280]">{day.dateLabel}</p>
                          </div>
                          <input
                            value={draftValue}
                            placeholder={allSame ? "0" : "Mixed"}
                            onChange={(event) => setRangeDailyDrafts((state) => ({ ...state, [day.key]: event.target.value }))}
                            className="h-[30px] min-w-0 rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827]"
                          />
                          <button
                            onClick={() => saveRangeDayVolume(day.key, draftValue, day.dateLabel)}
                            disabled={!changed || savingWeeklyStats[savingKey]}
                            className="h-[30px] rounded-[6px] bg-[#4F46E5] px-2 text-[11px] font-semibold text-white disabled:opacity-40"
                          >
                            {savingWeeklyStats[savingKey] ? "..." : "Save"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1280px]">
                <thead>
                  <tr className="border-b border-[#E5E7EB]">
                    <th className="w-10 px-4 py-3"></th>
                    {["Server", "Provider", "Daily Volume Limit", "Today Volume", "Success Rate", "Bounce %", "TSS04 %", "Complaints", ...(warmupEnabled ? ["Warmup Stage"] : []), "Monitoring", "Status", "Last Updated", "Assigned To", "Actions"].map((header) => (
                      <th key={header} className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.03em] text-[#4B5563]">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={index} className="border-b border-[#F1F5F9]">
                        {Array.from({ length: 15 }).map((__, cell) => <td key={cell} className="px-3 py-3"><div className="h-4 rounded bg-[#F1F5F9] animate-pulse" /></td>)}
                      </tr>
                    ))
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-3 py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-[#9CA3AF]"><Inbox className="h-8 w-8" /><span className="text-[13px]">No tracked servers match the current filters.</span></div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((server) => (
                      <Fragment key={server.id}>
                      <tr className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3">
                          <button onClick={() => toggleRow(server.id)}>{selected.includes(server.id) ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}</button>
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => setDrawerServerId(server.id)} className="text-left">
                            <p className="text-[13px] font-bold text-[#2563EB]">{server.name}</p>
                            <p className="text-[11px] text-[#6B7280]">{server.location ?? "-"}</p>
                          </button>
                        </td>
                        <td className="px-3 py-3 text-[13px] font-medium text-[#111827]">{server.providerName ?? "-"}</td>
                        <td className="px-3 py-3">
                          <input
                            value={limitDrafts[server.id] ?? ""}
                            onChange={(e) => setLimitDrafts({ ...limitDrafts, [server.id]: e.target.value })}
                            onBlur={(e) => saveLimit(server.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setLimitDrafts({ ...limitDrafts, [server.id]: server.dailySendLimit != null ? String(server.dailySendLimit) : "" });
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={savingLimits[server.id]}
                            className="h-[32px] w-[92px] rounded-[6px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                          />
                          {limitDrafts[server.id] !== (server.dailySendLimit != null ? String(server.dailySendLimit) : "") && (
                            <button
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => saveLimit(server.id, limitDrafts[server.id] ?? "")}
                              disabled={savingLimits[server.id]}
                              className="ml-1 h-[32px] rounded-[6px] bg-[#4F46E5] px-2 text-[11px] font-semibold text-white disabled:opacity-60"
                            >
                              {savingLimits[server.id] ? "..." : "Save"}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="w-[170px]">
                            <div className="flex items-center gap-1">
                              <input
                                value={sentDrafts[server.id] ?? "0"}
                                onChange={(e) => setSentDrafts({ ...sentDrafts, [server.id]: e.target.value })}
                                onBlur={(e) => saveSentToday(server, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  if (e.key === "Escape") {
                                    setSentDrafts({ ...sentDrafts, [server.id]: String(server.todaySends ?? 0) });
                                    e.currentTarget.blur();
                                  }
                                }}
                                disabled={savingSentToday[server.id]}
                                className="h-[30px] w-[78px] rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                              />
                              <span className="text-[11px] font-semibold text-[#6B7280]">/ {server.limit ? formatNumber(server.limit) : "No limit"}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]"><div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.min(server.capacity, 100)}%` }} /></div>
                            {sentDrafts[server.id] !== String(server.todaySends ?? 0) && (
                              <button
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => saveSentToday(server, sentDrafts[server.id] ?? "0")}
                                disabled={savingSentToday[server.id]}
                                className="mt-1 text-[11px] font-semibold text-[#4F46E5] disabled:opacity-60"
                              >
                                {savingSentToday[server.id] ? "Saving..." : "Save today volume"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[12px] font-semibold text-[#15803D]">{pct(server.delivered, server.totalSends, 1)}%</td>
                        <td className="px-3 py-3"><span className={`rounded-[5px] px-2 py-0.5 text-[12px] font-semibold ${rateClass(server.bounceRate, 1.5, 3)}`}>{server.bounceRate.toFixed(1)}%</span></td>
                        <td className="px-3 py-3"><span className={`rounded-[5px] px-2 py-0.5 text-[12px] font-semibold ${rateClass(server.ts04Rate, 0.7, 1.2)}`}>{server.ts04Rate.toFixed(1)}%</span></td>
                        <td className="px-3 py-3"><span className={`rounded-[5px] px-2 py-0.5 text-[12px] font-semibold ${rateClass(server.complaintRate, 0.05, 0.1)}`}>{server.complaintRate.toFixed(2)}%</span></td>
                        {warmupEnabled && <td className="px-3 py-3"><span className="rounded-[5px] bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">{warmupStage(server)}</span></td>}
                        <td className="px-3 py-3">
                          <button onClick={() => setAutoThrottle({ ...autoThrottle, [server.id]: !autoThrottle[server.id] })} className={`h-5 w-9 rounded-full p-0.5 transition ${autoThrottle[server.id] ? "bg-[#4F46E5]" : "bg-[#CBD5E1]"}`}>
                            <span className={`block h-4 w-4 rounded-full bg-white transition ${autoThrottle[server.id] ? "translate-x-4" : ""}`} />
                          </button>
                        </td>
                        <td className="px-3 py-3"><StatusBadge value={server.status} label={server.status === "restricted" ? "Restricted" : server.status === "warmup" ? "Warmup" : server.status === "active" ? "Active" : "Paused"} /></td>
                        <td className="px-3 py-3 text-[12px] text-[#374151]">{server.agg.lastUpdated ? new Date(server.agg.lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "-"}</td>
                        <td className="px-3 py-3">
                          {server.assignedUsers?.[0] ? (
                            <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-bold text-[#4F46E5]">{server.assignedUsers[0].name.charAt(0)}</span><span className="text-[13px] text-[#374151]">{server.assignedUsers[0].name}</span></div>
                          ) : <span className="text-[13px] text-[#9CA3AF]">-</span>}
                        </td>
                        <td className="px-3 py-3 text-right"><button onClick={() => setDrawerServerId(server.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#6B7280] hover:bg-[#F1F5F9]"><MoreHorizontal className="h-4 w-4" /></button></td>
                      </tr>
                      {server.id === selectedStatsAnchorId && selectedServers.length > 0 && (
                        <tr className="border-b border-[#DCE3F0] bg-[#F8FAFC]">
                          <td colSpan={tableColumnCount} className="px-4 py-4">
                            <div className="rounded-[10px] border border-[#DCE3F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
                                <div>
                                  <h2 className="text-[15px] font-bold text-[#111827]">Server Statistics</h2>
                                  <p className="mt-0.5 text-[12px] text-[#6B7280]">
                                    {selectedServers.length === 1
                                      ? `${statsRangeWindow.label} for ${selectedServers[0].name}`
                                      : `${statsRangeWindow.label} across ${selectedServers.length} selected servers`}
                                  </p>
                                  <p className="mt-1 text-[11px] font-medium text-[#6B7280]">Daily edits are applied to the selected server{selectedServers.length === 1 ? "" : "s"} only.</p>
                                </div>
                                <div className="flex flex-wrap items-end gap-2">
                                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                                    Range
                                    <select
                                      value={statsRange}
                                      onChange={(event) => setStatsRange(event.target.value as StatsRangeKey)}
                                      className="mt-1 block h-[32px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] normal-case tracking-normal text-[#111827]"
                                    >
                                      <option value="week">This week</option>
                                      <option value="currentMonth">Current month</option>
                                      <option value="lastMonth">Last month</option>
                                      <option value="custom">Custom</option>
                                    </select>
                                  </label>
                                  {statsRange === "custom" && (
                                    <>
                                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                                        Start
                                        <input
                                          type="date"
                                          value={statsCustomRange.startDate}
                                          onChange={(event) => setStatsCustomRange((current) => ({ ...current, startDate: event.target.value }))}
                                          className="mt-1 block h-[32px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] normal-case tracking-normal text-[#111827]"
                                        />
                                      </label>
                                      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                                        End
                                        <input
                                          type="date"
                                          value={statsCustomRange.endDate}
                                          onChange={(event) => setStatsCustomRange((current) => ({ ...current, endDate: event.target.value }))}
                                          className="mt-1 block h-[32px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] normal-case tracking-normal text-[#111827]"
                                        />
                                      </label>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
                                  <div>
                                    <p className="font-semibold text-[#6B7280]">Volume</p>
                                    <p className="mt-0.5 text-[18px] font-bold text-[#111827]">{formatNumber(weeklyTotals.sent)}</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#6B7280]">Success</p>
                                    <p className="mt-0.5 text-[18px] font-bold text-[#15803D]">{pct(weeklyTotals.delivered, weeklyTotals.sent, 1)}%</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#6B7280]">Bounces</p>
                                    <p className="mt-0.5 text-[18px] font-bold text-[#EA580C]">{pct(weeklyTotals.bounces, weeklyTotals.sent, 2)}%</p>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-[#6B7280]">Complaints</p>
                                    <p className="mt-0.5 text-[18px] font-bold text-[#DC2626]">{pct(weeklyTotals.complaints, weeklyTotals.sent, 2)}%</p>
                                  </div>
                                </div>
                                {loadingStatsLogs && <span className="text-[12px] font-semibold text-[#4F46E5]">Loading statistics...</span>}
                              </div>
                              <div className="grid grid-cols-1 gap-0 xl:grid-cols-[1fr_360px]">
                                <div className="min-h-[190px] border-b border-[#E5E7EB] p-4 xl:border-b-0 xl:border-r">
                                  <ResponsiveContainer width="100%" height={175}>
                                    <AreaChart data={trend}>
                                      <defs>
                                        <linearGradient id="weeklySentFill" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.16} />
                                          <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="weeklyDeliveredFill" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#16A34A" stopOpacity={0.12} />
                                          <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                                      <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={45} />
                                      <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #E5E7EB" }} />
                                      <Area type="monotone" dataKey="sent" name="Volume" stroke="#4F46E5" strokeWidth={2} fill="url(#weeklySentFill)" dot={{ r: 3, fill: "#fff", stroke: "#4F46E5", strokeWidth: 2 }} />
                                      <Area type="monotone" dataKey="delivered" name="Successful" stroke="#16A34A" strokeWidth={2} fill="url(#weeklyDeliveredFill)" dot={{ r: 3, fill: "#fff", stroke: "#16A34A", strokeWidth: 2 }} />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[360px]">
                                    <thead>
                                      <tr className="border-b border-[#E5E7EB]">
                                        {["Day", "Sent / server", "Total", "Rate", "Issues"].map((header) => (
                                          <th key={header} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.03em] text-[#6B7280]">{header}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {weeklyStats.map((day) => {
                                        const issueCount = day.bounces + day.complaints + day.unsubscribes;
                                        const serverValues = selectedServers.map((server) => day.valuesByServer[server.id] ?? 0);
                                        const allSame = serverValues.length > 0 && serverValues.every((value) => value === serverValues[0]);
                                        const baseValue = allSame ? String(serverValues[0] ?? 0) : "";
                                        const draftValue = rangeDailyDrafts[day.key] ?? baseValue;
                                        const changed = draftValue.trim() !== "" && (!allSame || draftValue !== baseValue);
                                        const savingKey = `range:${day.key}`;
                                        return (
                                          <tr key={day.key} className="border-b border-[#F1F5F9] last:border-0">
                                            <td className="px-3 py-2">
                                              <p className="text-[12px] font-bold text-[#111827]">{day.label}</p>
                                              <p className="text-[10px] text-[#6B7280]">{day.dateLabel}</p>
                                            </td>
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1">
                                                <input
                                                  value={draftValue}
                                                  placeholder={allSame ? "0" : "Mixed"}
                                                  onChange={(event) => setRangeDailyDrafts((state) => ({ ...state, [day.key]: event.target.value }))}
                                                  onKeyDown={(event) => {
                                                    if (event.key === "Enter" && changed) saveRangeDayVolume(day.key, draftValue, day.dateLabel);
                                                    if (event.key === "Escape") {
                                                      setRangeDailyDrafts((state) => {
                                                        const next = { ...state };
                                                        delete next[day.key];
                                                        return next;
                                                      });
                                                      event.currentTarget.blur();
                                                    }
                                                  }}
                                                  disabled={savingWeeklyStats[savingKey]}
                                                  className="h-[28px] w-[82px] rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                                                />
                                                {changed && (
                                                  <button
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={() => saveRangeDayVolume(day.key, draftValue, day.dateLabel)}
                                                    disabled={savingWeeklyStats[savingKey]}
                                                    className="rounded-[6px] bg-[#4F46E5] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-60"
                                                  >
                                                    {savingWeeklyStats[savingKey] ? "..." : "Save"}
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2 text-[12px] font-semibold text-[#111827]">
                                              {formatNumber(day.sent)}
                                            </td>
                                            <td className="px-3 py-2 text-[12px] font-semibold text-[#15803D]">{pct(day.delivered, day.sent, 1)}%</td>
                                            <td className="px-3 py-2">
                                              <span className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${issueCount > 0 ? "bg-[#FFF7ED] text-[#EA580C]" : "bg-[#ECFDF5] text-[#15803D]"}`}>
                                                {issueCount}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-[12px] text-[#6B7280]">Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} servers</p>
              <div className="flex items-center gap-1">
                <button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => <button key={number} onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-[7px] px-2 text-[12px] font-semibold ${page === number ? "bg-[#4F46E5] text-white" : "border border-[#E5E7EB] bg-white text-[#374151]"}`}>{number}</button>)}
                <button disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#111827]">Sending By User</h3>
              <span className="rounded-[6px] border border-[#E5E7EB] px-2 py-1 text-[11px] text-[#6B7280]">{currentMonthUserChart.label}</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={currentMonthUserChart.weeks} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #E5E7EB" }} />
                {currentMonthUserChart.users.map((user, index) => (
                  <Bar
                    key={user}
                    dataKey={user}
                    stackId="users"
                    fill={USER_CHART_COLORS[index % USER_CHART_COLORS.length]}
                    radius={index === currentMonthUserChart.users.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {currentMonthUserChart.users.length === 0 ? (
                <span className="text-[11px] text-[#6B7280]">No sending stats for this month</span>
              ) : currentMonthUserChart.users.map((user, index) => (
                <span key={user} className="inline-flex items-center gap-1 text-[11px] text-[#6B7280]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: USER_CHART_COLORS[index % USER_CHART_COLORS.length] }} />
                  {user}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#111827]">Error Breakdown</h3>
              <span className="rounded-[6px] border border-[#E5E7EB] px-2 py-1 text-[11px] text-[#6B7280]">Last 7 days</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={errorBreakdown} innerRadius={45} outerRadius={65} dataKey="value" stroke="none">
                  {errorBreakdown.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {errorBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-[12px]">
                  <span className="inline-flex items-center gap-2 text-[#374151]"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span>
                  <span className="font-semibold text-[#111827]">{item.rate}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#111827]">Statistics Trend</h3>
              <span className="rounded-[6px] border border-[#E5E7EB] px-2 py-1 text-[11px] text-[#6B7280]">Last 7 days</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="sendingFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "8px", border: "1px solid #E5E7EB" }} />
                <Area type="monotone" dataKey="sent" stroke="#4F46E5" strokeWidth={2} fill="url(#sendingFill)" dot={{ r: 3, fill: "#fff", stroke: "#4F46E5", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
            <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Recommended Actions</h3>
            <div className="space-y-3">
              {enriched.filter((server) => server.bounceRate > 3 || server.ts04Rate > 1 || server.capacity >= 90).slice(0, 4).map((server) => (
                <button key={server.id} onClick={() => setDrawerServerId(server.id)} className="flex w-full items-start gap-3 border-b border-[#F1F5F9] pb-3 text-left last:border-0 last:pb-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FEF2F2] text-[#DC2626]"><AlertTriangle className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[#111827]">{server.name}</span>
                    <span className="block text-[11px] text-[#6B7280]">Review thresholds and capacity</span>
                  </span>
                </button>
              ))}
              {enriched.filter((server) => server.bounceRate > 3 || server.ts04Rate > 1 || server.capacity >= 90).length === 0 && <p className="text-[12px] text-[#6B7280]">No urgent recommendations.</p>}
            </div>
          </div>
        </aside>
      </div>

      {drawerServer && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full justify-end bg-black/20">
          <div className="h-full w-full max-w-[640px] overflow-y-auto border-l border-[#E5E7EB] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
              <h2 className="text-[18px] font-bold text-[#111827]">Edit Server Tracking</h2>
              <button onClick={() => setDrawerServerId(null)} className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[#6B7280] hover:bg-[#F3F4F6]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#EFF6FF] text-[#2563EB]"><Activity className="h-5 w-5" /></div>
                <div>
                  <div className="flex items-center gap-2"><p className="text-[15px] font-bold text-[#111827]">{drawerServer.name}</p><StatusBadge value={drawerServer.status} /></div>
                  <p className="text-[12px] text-[#6B7280]">{drawerServer.providerName} - {drawerServer.location ?? "Unknown region"}</p>
                </div>
              </div>

              <div className="grid grid-cols-5 rounded-[10px] border border-[#E5E7EB]">
                {[
                  ["Status", drawerServer.status],
                  ["Bounce Rate", `${drawerServer.bounceRate.toFixed(1)}%`],
                  ["TSS04 %", `${drawerServer.ts04Rate.toFixed(1)}%`],
                  ["Complaints", `${drawerServer.complaintRate.toFixed(2)}%`],
                  ["Today Volume", `${formatNumber(drawerServer.todaySends)} / ${formatNumber(drawerServer.limit)}`],
                ].map(([label, value]) => (
                  <div key={label} className="border-r border-[#E5E7EB] p-3 last:border-0">
                    <p className="text-[11px] font-semibold text-[#6B7280]">{label}</p>
                    <p className="mt-1 text-[13px] font-bold text-[#111827]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Tracking Limits</h3>
                  {LIMIT_FIELDS.filter((field) => warmupEnabled || field.key !== "warmupIncrement").map(({ label, key }) => (
                    <label key={key} className="mb-3 grid grid-cols-[1fr_88px] items-center gap-3 text-[12px] text-[#374151] last:mb-0">
                      {label}
                      <input value={drawerForm[key]} onChange={(e) => setDrawerForm({ ...drawerForm, [key]: e.target.value })} className="h-[32px] rounded-[6px] border border-[#E5E7EB] px-2 text-[12px]" />
                    </label>
                  ))}
                  {[
                    ["Monitoring", "monitoring", drawerForm.monitoring],
                    ["Auto Pause", "autoPause", drawerForm.autoPause],
                    ["Retry Deferred", "retryDeferred", drawerForm.retryDeferred],
                  ].map(([label, key, enabled]) => (
                    <div key={String(label)} className="mt-3 flex items-center justify-between text-[12px] text-[#374151]">
                      {label}
                      <button
                        type="button"
                        onClick={() => toggleDrawerFlag(key as "monitoring" | "autoPause" | "retryDeferred")}
                        className={`h-5 w-9 rounded-full p-0.5 transition ${enabled ? "bg-[#4F46E5]" : "bg-[#CBD5E1]"}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white transition ${enabled ? "translate-x-4" : ""}`} />
                      </button>
                    </div>
                  ))}
                </section>

                <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Quality Guardrails</h3>
                  {GUARDRAIL_FIELDS.map(({ label, key }) => (
                    <label key={key} className="mb-3 block text-[12px] text-[#374151] last:mb-0">
                      <span className="mb-1 block">{label}</span>
                      <input value={drawerForm[key]} onChange={(e) => setDrawerForm({ ...drawerForm, [key]: e.target.value })} className="h-[32px] w-full rounded-[6px] border border-[#E5E7EB] px-2 text-[12px]" />
                    </label>
                  ))}
                  <div className="mt-3 flex items-center justify-between text-[12px] text-[#374151]">
                    Spam Trap Protection
                    <button
                      type="button"
                      onClick={() => toggleDrawerFlag("spamTrapProtection")}
                      className={`h-5 w-9 rounded-full p-0.5 transition ${drawerForm.spamTrapProtection ? "bg-[#4F46E5]" : "bg-[#CBD5E1]"}`}
                    >
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${drawerForm.spamTrapProtection ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                </section>

                <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 text-[13px] font-bold text-[#111827]">7-Day Statistics Trend</h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={drawerServer.dailyHistory?.map((day) => ({ date: day.label, sent: day.sends })) ?? []}>
                      <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={35} />
                      <Area type="monotone" dataKey="sent" stroke="#4F46E5" strokeWidth={2} fill="#EEF2FF" dot={{ r: 3, fill: "#fff", stroke: "#4F46E5", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </section>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Scheduling</h3>
                  <label className="mb-3 block text-[12px] text-[#374151]">Tracking Window<input value={drawerForm.sendingWindow} onChange={(e) => setDrawerForm({ ...drawerForm, sendingWindow: e.target.value })} className="mt-1 h-[34px] w-full rounded-[6px] border border-[#E5E7EB] px-3 text-[12px]" /></label>
                  <label className="block text-[12px] text-[#374151]">Timezone<input value={drawerForm.timezone} onChange={(e) => setDrawerForm({ ...drawerForm, timezone: e.target.value })} className="mt-1 h-[34px] w-full rounded-[6px] border border-[#E5E7EB] px-3 text-[12px]" /></label>
                </section>
                <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                  <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Routing & Assignment</h3>
                  <p className="text-[12px] text-[#6B7280]">Assigned to</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#111827]">{drawerServer.assignedUsers?.[0]?.name ?? "Unassigned"}</p>
                  <p className="mt-3 text-[12px] text-[#6B7280]">Provider</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#111827]">{drawerServer.providerName ?? "-"}</p>
                </section>
              </div>

              <section className="rounded-[10px] border border-[#E5E7EB] p-4">
                <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Notes / Internal Comments</h3>
                <textarea value={drawerForm.notes} onChange={(e) => setDrawerForm({ ...drawerForm, notes: e.target.value })} rows={3} className="w-full rounded-[7px] border border-[#E5E7EB] px-3 py-2 text-[13px] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15" />
              </section>
            </div>
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#E5E7EB] bg-white px-5 py-4">
              <button
                onClick={() => updateStatus([drawerServer.id], drawerServer.status === "paused" ? "active" : "paused")}
                className="h-[36px] rounded-[7px] border border-[#FECACA] bg-white px-5 text-[13px] font-semibold text-[#DC2626]"
              >
                {drawerServer.status === "paused" ? "Mark Active" : "Pause Server"}
              </button>
              <button onClick={saveDrawer} className="ml-auto h-[38px] rounded-[7px] bg-[#4F46E5] px-8 text-[13px] font-semibold text-white hover:bg-[#4338CA]">
                <Settings2 className="mr-2 inline h-4 w-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
