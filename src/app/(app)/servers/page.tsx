"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ProviderLogo } from "@/components/shared/provider-logo";
import { SERVER_STATUSES } from "@/lib/constants";
import { BLACKLIST_PROVIDER_OPTIONS, type BlacklistProvider } from "@/lib/blacklist-providers";
import {
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Filter,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Server,
  Square,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";

interface AssignedUser {
  id: string;
  name: string;
  email: string;
}

interface BlacklistFinding {
  source?: string;
  listed?: boolean;
  name?: string;
}

interface ServerIp {
  id: string;
  address: string;
  location?: string | null;
  intelligence?: {
    geo?: {
      city?: string;
      region?: string;
      country?: string;
      isp?: string;
      success?: boolean;
    } | null;
    blacklist?: {
      listed?: boolean;
      listedCount?: number;
      checkedCount?: number;
      provider?: string;
      findings?: BlacklistFinding[];
    };
    checkedAt?: string;
  } | null;
}

interface ServerRow {
  id: string;
  name: string;
  providerId: string;
  providerName: string | null;
  providerWebsite: string | null;
  plan: string | null;
  location: string | null;
  operatingSystem: string | null;
  status: string;
  purchaseDate: string | null;
  activationDate: string | null;
  expirationDate: string | null;
  monthlyCost: string | null;
  billingMethod: string | null;
  currency: string | null;
  notes: string | null;
  dailySendLimit: number | null;
  createdAt: string;
  updatedAt: string;
  totalSends: number;
  totalSuccessful: number;
  totalBounces: number;
  lastSendDate: string | null;
  todaySends: number;
  ipCount: number;
  ips?: ServerIp[];
  assignedUsers: AssignedUser[];
  providerContactedUsers?: AssignedUser[];
}

interface ProviderOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All Servers" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "pending", label: "Pending Setup" },
  { key: "archived", label: "Archived" },
];

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function serverRowTone(status: string, selected: boolean) {
  if (selected) return "border-l-4 border-l-[#4F46E5] bg-[#F8FAFC] shadow-[inset_8px_0_14px_-16px_rgba(79,70,229,0.6)] hover:bg-[#F8FAFC]";
  switch (status) {
    case "active":
      return "border-l-4 border-l-[#22C55E] bg-white shadow-[inset_8px_0_14px_-16px_rgba(34,197,94,0.55)] hover:bg-[#F8FAFC]";
    case "pending":
      return "border-l-4 border-l-[#F59E0B] bg-white shadow-[inset_8px_0_14px_-16px_rgba(245,158,11,0.5)] hover:bg-[#F8FAFC]";
    case "paused":
      return "border-l-4 border-l-[#94A3B8] bg-white shadow-[inset_8px_0_14px_-16px_rgba(100,116,139,0.4)] hover:bg-[#F8FAFC]";
    case "public":
      return "border-l-4 border-l-[#3B82F6] bg-white shadow-[inset_8px_0_14px_-16px_rgba(59,130,246,0.5)] hover:bg-[#F8FAFC]";
    case "port_closed":
      return "border-l-4 border-l-[#F97316] bg-white shadow-[inset_8px_0_14px_-16px_rgba(249,115,22,0.5)] hover:bg-[#F8FAFC]";
    case "ts04_error":
    case "tss09_error":
    case "bounce":
    case "complaint":
      return "border-l-4 border-l-[#F43F5E] bg-white shadow-[inset_8px_0_14px_-16px_rgba(244,63,94,0.5)] hover:bg-[#F8FAFC]";
    case "suspended":
    case "cancelled":
    case "expired":
    case "down":
      return "border-l-4 border-l-[#EF4444] bg-white shadow-[inset_8px_0_14px_-16px_rgba(239,68,68,0.5)] hover:bg-[#F8FAFC]";
    default:
      return "border-l-4 border-l-transparent bg-white hover:bg-[#F8FAFC]";
  }
}

function dateLabel(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function serverType(server: ServerRow) {
  const text = `${server.plan ?? ""} ${server.operatingSystem ?? ""}`.toLowerCase();
  if (text.includes("dedicated")) return "Dedicated";
  if (text.includes("storage")) return "Storage";
  if (text.includes("smtp")) return "SMTP";
  if (text.includes("vps")) return "VPS";
  if (text.includes("cloud")) return "Cloud";
  return server.plan || "Cloud";
}

function uptime(server: ServerRow) {
  if (server.status !== "active") return "0.00%";
  const bounces = Number(server.totalBounces || 0);
  const total = Number(server.totalSends || 0);
  if (total === 0) return "99.90%";
  return `${Math.max(0, 100 - (bounces / total) * 100).toFixed(2)}%`;
}

function purposeTags(server: ServerRow) {
  const tags: string[] = [];
  const notes = (server.notes || "").toLowerCase();
  if (notes.includes("backup")) tags.push("Backup");
  if (notes.includes("api")) tags.push("API");
  if (notes.includes("mail") || notes.includes("smtp")) tags.push("Mail Server");
  if (notes.includes("database")) tags.push("Database");
  if (server.dailySendLimit) tags.push("Tracked");
  if (tags.length === 0) tags.push(server.status === "active" ? "Production" : "Operations");
  return tags.slice(0, 2);
}

function ipMeta(ip?: ServerIp) {
  if (!ip) return null;
  const geo = ip.intelligence?.geo;
  const geoLabel = geo?.success ? [geo.city, geo.region, geo.country].filter(Boolean).slice(0, 2).join(", ") : null;
  const listed = ip.intelligence?.blacklist?.listed;
  const sources = blacklistSourceNames(ip.intelligence?.blacklist?.findings);
  return {
    geoLabel,
    listed,
    listedLabel: listed ? sources.slice(0, 2).join(", ") || `${ip.intelligence?.blacklist?.listedCount || 0} blacklist hits` : ip.intelligence ? "Blacklist clean" : "Not checked",
  };
}

function detectedRegion(server: ServerRow) {
  const ip = server.ips?.[0];
  const geo = ip?.intelligence?.geo;
  if (server.location) return server.location;
  if (ip?.location) return ip.location;
  if (geo?.success) return [geo.city, geo.region, geo.country].filter(Boolean).join(", ");
  return null;
}

function blacklistCompanyName(value?: string) {
  const source = (value || "").toLowerCase();
  if (source.includes("spamhaus")) return "Spamhaus";
  if (source.includes("spamcop")) return "SpamCop";
  if (source.includes("barracuda")) return "Barracuda";
  if (source.includes("sorbs")) return "SORBS";
  if (source.includes("surriel") || source.includes("psbl")) return "PSBL";
  if (source.includes("mxtoolbox")) return "MxToolbox";
  return value?.replace(/^dnsbl\./, "").replace(/\.$/, "") || "Blacklist";
}

function blacklistSourceNames(findings?: BlacklistFinding[]) {
  if (!findings) return [];
  return Array.from(
    new Set(
      findings
        .filter((finding) => finding.listed)
        .map((finding) => blacklistCompanyName(finding.name || finding.source))
        .filter(Boolean)
    )
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ComponentType<{ className?: string }>;
  tone: "violet" | "green" | "amber" | "blue";
}) {
  const toneClass = {
    violet: "bg-[#F5F3FF] text-[#7C3AED]",
    green: "bg-[#ECFDF5] text-[#16A34A]",
    amber: "bg-[#FFF7ED] text-[#EA580C]",
    blue: "bg-[#EFF6FF] text-[#2563EB]",
  }[tone];

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#6B7280]">{label}</p>
          <p className="mt-1 text-[26px] font-bold leading-none tracking-tight text-[#111827]">{value}</p>
          <p className="mt-2 text-[12px] font-medium text-[#16A34A]">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function ServersPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const admin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const providerFilter = searchParams.get("providerId") || "all";
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingStatuses, setSavingStatuses] = useState<Record<string, boolean>>({});
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [savingLimits, setSavingLimits] = useState<Record<string, boolean>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState<Record<string, boolean>>({});
  const [deletingServers, setDeletingServers] = useState<Record<string, boolean>>({});
  const [detectingRegions, setDetectingRegions] = useState(false);
  const [checkingBlacklist, setCheckingBlacklist] = useState(false);
  const [blacklistProvider, setBlacklistProvider] = useState<BlacklistProvider>("hetrixtools");
  const [deletingStatistics, setDeletingStatistics] = useState(false);
  const [form, setForm] = useState({
    providerId: "",
    name: "",
    plan: "",
    location: "",
    operatingSystem: "",
    status: "pending",
    monthlyCost: "",
    currency: "USD",
    billingMethod: "monthly",
    dailySendLimit: "",
    purchaseDate: "",
    activationDate: "",
    expirationDate: "",
    ipAddresses: "",
    notes: "",
    assignedUserId: "",
    contactedByUserId: "",
  });

  const parseIpAddresses = (value: string) =>
    Array.from(
      new Set(
        value
          .split(/[\n,]+/)
          .map((ip) => ip.trim())
          .filter(Boolean)
      )
    );

  const updateProviderFilter = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("providerId");
    else params.set("providerId", value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        pageSize: "200",
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (providerFilter !== "all") params.set("providerId", providerFilter);
      if (admin && assignedFilter !== "all") params.set("assignedUserId", assignedFilter);

      const res = await fetch(`/api/servers?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load servers");
      const json = await res.json();
      const rows = json.data ?? [];
      setServers(rows);
      setLimitDrafts(Object.fromEntries(rows.map((server: ServerRow) => [server.id, String(server.dailySendLimit ?? "")])));
      setAssignmentDrafts(Object.fromEntries(rows.map((server: ServerRow) => [server.id, server.assignedUsers?.[0]?.id ?? ""])));
      if (!admin) {
        const assignedUsers = rows.flatMap((server: ServerRow) => server.assignedUsers || []);
        const sessionUser = session?.user
          ? [{
              id: String((session.user as Record<string, unknown>).id || ""),
              name: String(session.user.name || "Me"),
              email: String(session.user.email || ""),
            }]
          : [];
        const byId = new Map([...sessionUser, ...assignedUsers].filter((user) => user.id).map((user) => [user.id, user]));
        setUsers(Array.from(byId.values()));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, [admin, assignedFilter, providerFilter, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchServers();
    Promise.all([
      fetch("/api/providers?pageSize=1000&sortBy=name&sortOrder=asc").then((r) => r.json()),
      admin ? fetch("/api/users?all=1").then((r) => r.json()) : Promise.resolve({ data: [] }),
      fetch("/api/ip-intelligence/run").then((r) => r.json()),
    ])
      .then(([providerJson, userJson, blacklistJson]) => {
        setProviders(providerJson.data ?? []);
        setUsers(userJson.data ?? []);
        if (blacklistJson.provider === "mxtoolbox" || blacklistJson.provider === "hetrixtools") {
          setBlacklistProvider(blacklistJson.provider);
        }
      })
      .catch(() => {});
  }, [admin, fetchServers]);

  useEffect(() => {
    const refreshBlacklistResult = (event: Event) => {
      const notification = (event as CustomEvent<{ relatedEntityType?: string }>).detail;
      if (notification?.relatedEntityType === "server") fetchServers();
    };
    window.addEventListener("cloudops:notification", refreshBlacklistResult);
    return () => window.removeEventListener("cloudops:notification", refreshBlacklistResult);
  }, [fetchServers]);

  const regions = useMemo(() => Array.from(new Set(servers.map((s) => detectedRegion(s)).filter(Boolean))) as string[], [servers]);
  const types = useMemo(() => Array.from(new Set(servers.map(serverType).filter(Boolean))), [servers]);
  const billingCycles = useMemo(() => Array.from(new Set(servers.map((s) => s.billingMethod).filter(Boolean))) as string[], [servers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((server) => {
      const renewalDays = daysUntil(server.expirationDate);
      if (activeTab === "expiring" && !(renewalDays !== null && renewalDays <= 45)) return false;
      if (activeTab === "pending" && server.status !== "pending") return false;
      if (activeTab === "archived" && !["cancelled", "expired", "suspended"].includes(server.status)) return false;
      if (providerFilter !== "all" && server.providerId !== providerFilter) return false;
      if (statusFilter !== "all" && server.status !== statusFilter) return false;
      const region = detectedRegion(server);
      if (regionFilter !== "all" && region !== regionFilter) return false;
      if (typeFilter !== "all" && serverType(server) !== typeFilter) return false;
      if (billingFilter !== "all" && server.billingMethod !== billingFilter) return false;
      if (assignedFilter !== "all" && !server.assignedUsers.some((user) => user.id === assignedFilter)) return false;
      if (!q) return true;
      return [server.name, server.providerName, region, server.plan, server.notes].some((value) =>
        value?.toLowerCase().includes(q)
      );
    });
  }, [activeTab, assignedFilter, billingFilter, providerFilter, regionFilter, search, servers, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setSelected([]);
  }, [activeTab, providerFilter, statusFilter, regionFilter, typeFilter, billingFilter, assignedFilter, search]);

  const activeCount = servers.filter((server) => server.status === "active").length;
  const pendingRenewals = servers.filter((server) => {
    const days = daysUntil(server.expirationDate);
    return days !== null && days <= 45;
  }).length;
  const monthlyCost = servers.reduce((sum, server) => sum + Number(server.monthlyCost || 0), 0);

  const tabCount = (key: string) => {
    if (key === "all") return servers.length;
    if (key === "expiring") return pendingRenewals;
    if (key === "pending") return servers.filter((server) => server.status === "pending").length;
    return servers.filter((server) => ["cancelled", "expired", "suspended"].includes(server.status)).length;
  };

  const toggleRow = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const togglePage = () => {
    const pageIds = paginated.map((server) => server.id);
    const allSelected = pageIds.every((id) => selected.includes(id));
    setSelected((current) =>
      allSelected ? current.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...current, ...pageIds]))
    );
  };

  const bulkUpdateStatus = async (status: string) => {
    if (selected.length === 0) return;
    try {
      await Promise.all(
        selected.map((id) =>
          fetch(`/api/servers/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      toast.success("Servers updated");
      setSelected([]);
      fetchServers();
    } catch {
      toast.error("Bulk update failed");
    }
  };

  const deleteServer = async (server: ServerRow) => {
    if (!window.confirm(`Delete server "${server.name}"? This will also remove its daily statistics and IP assignments.`)) return;
    setDeletingServers((state) => ({ ...state, [server.id]: true }));
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Server deleted");
      setSelected((current) => current.filter((id) => id !== server.id));
      fetchServers();
    } catch {
      toast.error("Failed to delete server");
    } finally {
      setDeletingServers((state) => ({ ...state, [server.id]: false }));
    }
  };

  const deleteSelectedServers = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} selected server${selected.length === 1 ? "" : "s"}? This will also remove their daily statistics and IP assignments.`)) return;
    const confirmation = window.prompt(`Type DELETE ${selected.length} to confirm deleting the selected server${selected.length === 1 ? "" : "s"}.`);
    if (confirmation !== `DELETE ${selected.length}`) {
      toast.info("Server deletion cancelled");
      return;
    }
    try {
      await Promise.all(
        selected.map(async (id) => {
          const res = await fetch(`/api/servers/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(await res.text());
        })
      );
      toast.success("Selected servers deleted");
      setSelected([]);
      fetchServers();
    } catch {
      toast.error("Failed to delete selected servers");
    }
  };

  const deleteSelectedStatistics = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete statistics for ${selected.length} selected server${selected.length === 1 ? "" : "s"}? The servers and IPs will stay, but daily statistics will be removed.`)) return;
    const confirmation = window.prompt(`Type DELETE STATS ${selected.length} to confirm removing statistics.`);
    if (confirmation !== `DELETE STATS ${selected.length}`) {
      toast.info("Statistics deletion cancelled");
      return;
    }
    setDeletingStatistics(true);
    try {
      const res = await fetch("/api/servers/statistics", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverIds: selected }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to delete statistics");
      toast.success(`Deleted ${result.deletedLogs ?? 0} statistics record${result.deletedLogs === 1 ? "" : "s"}`);
      setSelected([]);
      fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected statistics");
    } finally {
      setDeletingStatistics(false);
    }
  };

  const saveLimit = async (server: ServerRow, value: string) => {
    const normalized = value.trim();
    const current = server.dailySendLimit != null ? String(server.dailySendLimit) : "";
    if (normalized === current) return;
    setSavingLimits((state) => ({ ...state, [server.id]: true }));
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailySendLimit: normalized ? Number(normalized) : null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Daily volume limit saved");
      fetchServers();
    } catch {
      toast.error("Failed to save daily volume limit");
      setLimitDrafts((state) => ({ ...state, [server.id]: current }));
    } finally {
      setSavingLimits((state) => ({ ...state, [server.id]: false }));
    }
  };

  const saveAssignment = async (server: ServerRow, userId: string) => {
    const current = server.assignedUsers?.[0]?.id ?? "";
    if (userId === current) return;

    setSavingAssignments((state) => ({ ...state, [server.id]: true }));
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedUserIds: userId ? [userId] : [] }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(userId ? "Server assigned" : "Server unassigned");
      fetchServers();
    } catch {
      toast.error("Failed to update server assignment");
      setAssignmentDrafts((state) => ({ ...state, [server.id]: current }));
    } finally {
      setSavingAssignments((state) => ({ ...state, [server.id]: false }));
    }
  };

  const resetForm = () => {
    setForm({
      providerId: providerFilter !== "all" ? providerFilter : "",
      name: "",
      plan: "",
      location: "",
      operatingSystem: "",
      status: "pending",
      monthlyCost: "",
      currency: "USD",
      billingMethod: "monthly",
      dailySendLimit: "",
      purchaseDate: "",
      activationDate: "",
      expirationDate: "",
      ipAddresses: "",
      notes: "",
      assignedUserId: "",
      contactedByUserId: "",
    });
  };

  const openCreate = () => {
    setEditingServer(null);
    resetForm();
    setShowCreate(true);
  };

  const openEdit = (server: ServerRow) => {
    setEditingServer(server);
    setForm({
      providerId: server.providerId,
      name: server.name,
      plan: server.plan || "",
      location: server.location || "",
      operatingSystem: server.operatingSystem || "",
      status: server.status,
      monthlyCost: server.monthlyCost || "",
      currency: server.currency || "USD",
      billingMethod: server.billingMethod || "monthly",
      dailySendLimit: server.dailySendLimit != null ? String(server.dailySendLimit) : "",
      purchaseDate: server.purchaseDate ? server.purchaseDate.slice(0, 10) : "",
      activationDate: server.activationDate ? server.activationDate.slice(0, 10) : "",
      expirationDate: server.expirationDate ? server.expirationDate.slice(0, 10) : "",
      ipAddresses: (server.ips || []).map((ip) => ip.address).join("\n"),
      notes: server.notes || "",
      assignedUserId: server.assignedUsers?.[0]?.id ?? "",
      contactedByUserId: server.providerContactedUsers?.[0]?.id ?? "",
    });
    setShowCreate(true);
  };

  const saveStatus = async (server: ServerRow, status: string) => {
    if (status === server.status) return;
    setSavingStatuses((state) => ({ ...state, [server.id]: true }));
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Server status updated");
      fetchServers();
    } catch {
      toast.error("Failed to update server status");
    } finally {
      setSavingStatuses((state) => ({ ...state, [server.id]: false }));
    }
  };

  const showBlacklistWarnings = (warnings: Array<{ message?: string }>) => {
    if (warnings.length === 0) return;
    const providerWarnings = warnings.filter((warning) => {
      const message = String(warning.message || "").toLowerCase();
      return message.includes("mxtoolbox") || message.includes("hetrixtools");
    });
    const sample = providerWarnings[0] || warnings[0];
    toast.warning(providerWarnings.length > 0 ? "Blacklist provider issue" : "Blacklist check warning", {
      description: `${warnings.length} warning${warnings.length === 1 ? "" : "s"}. ${sample.message || "Review blacklist check settings."}`,
      duration: 12000,
    });
  };

  const runBlacklistCheck = async (serverIds = selected, successLabel = "Blacklist check complete") => {
    const targetServerIds = Array.from(new Set(serverIds));
    if (targetServerIds.length === 0) {
      toast.error("Select at least one server to check blacklist status");
      return;
    }

    setCheckingBlacklist(true);
    try {
      const res = await fetch("/api/ip-intelligence/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, serverIds: targetServerIds, provider: blacklistProvider }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const providerLabel = BLACKLIST_PROVIDER_OPTIONS.find((option) => option.value === blacklistProvider)?.label || blacklistProvider;
      toast.success(`${successLabel} with ${providerLabel}: ${result.checked ?? 0} IPs checked, ${result.listed ?? 0} listed`);
      const warnings = Array.isArray(result.blacklistWarnings) ? result.blacklistWarnings : [];
      showBlacklistWarnings(warnings);
      fetchServers();
    } catch {
      toast.error("Failed to run blacklist check");
    } finally {
      setCheckingBlacklist(false);
    }
  };

  const runRegionDetection = async () => {
    setDetectingRegions(true);
    try {
      const res = await fetch("/api/ip-intelligence/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast.success(`Region detection complete: ${result.checked ?? 0} IPs checked, ${result.detected ?? 0} regions detected`);
      fetchServers();
    } catch {
      toast.error("Failed to detect server regions");
    } finally {
      setDetectingRegions(false);
    }
  };

  const saveServer = async () => {
    if (!form.name.trim() || !form.providerId) {
      toast.error("Server name and provider are required");
      return;
    }
    setSaving(true);
    try {
      const url = editingServer ? `/api/servers/${editingServer.id}` : "/api/servers";
      const existingContactedByUserId = editingServer?.providerContactedUsers?.[0]?.id ?? "";
      const manualContactedByUserId = form.contactedByUserId && form.contactedByUserId !== existingContactedByUserId
        ? form.contactedByUserId
        : null;
      const res = await fetch(url, {
        method: editingServer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: form.providerId,
          name: form.name.trim(),
          plan: form.plan || null,
          location: form.location || null,
          operatingSystem: form.operatingSystem || null,
          status: form.status,
          monthlyCost: form.monthlyCost || null,
          currency: form.currency || "USD",
          billingMethod: form.billingMethod || null,
          dailySendLimit: form.dailySendLimit ? Number(form.dailySendLimit) : null,
          purchaseDate: form.purchaseDate || null,
          activationDate: form.activationDate || null,
          expirationDate: form.expirationDate || null,
          ipAddresses: parseIpAddresses(form.ipAddresses),
          notes: form.notes || null,
          assignedUserIds: form.assignedUserId ? [form.assignedUserId] : [],
          manualContactedByUserId,
        }),
      });
      if (!res.ok) throw new Error(editingServer ? "Failed to update server" : "Failed to create server");
      await res.json();
      toast.success(editingServer ? "Server updated" : "Server created", {
        description: !editingServer && parseIpAddresses(form.ipAddresses).length > 0
          ? "HetrixTools is checking the new server IPs in the background. You will receive a notification when it finishes."
          : undefined,
      });
      setShowCreate(false);
      setEditingServer(null);
      resetForm();
      fetchServers();
    } catch {
      toast.error(editingServer ? "Failed to update server" : "Failed to create server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="text-[24px] font-bold leading-tight tracking-tight text-[#111827]">Servers</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">Manage all servers across your providers.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex h-[38px] items-center gap-2 rounded-[8px] bg-[#4F46E5] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4338CA]"
        >
          <Plus className="h-4 w-4" />
          Add Server
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Servers" value={String(servers.length)} sub="+ real inventory" icon={Server} tone="violet" />
        <KpiCard label="Active Servers" value={String(activeCount)} sub={`${servers.length ? ((activeCount / servers.length) * 100).toFixed(1) : "0.0"}% active`} icon={CheckSquare} tone="green" />
        <KpiCard label="Pending Renewals" value={String(pendingRenewals)} sub="within 45 days" icon={CalendarClock} tone="amber" />
        <KpiCard label="Monthly Cost" value={money(monthlyCost)} sub={`${servers.length} tracked servers`} icon={Wallet} tone="blue" />
      </div>

      <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex overflow-x-auto border-b border-[#E5E7EB] px-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex h-[48px] items-center gap-2 px-3 text-[13px] font-semibold transition-colors ${
                activeTab === tab.key ? "text-[#4F46E5]" : "text-[#4B5563] hover:text-[#111827]"
              }`}
            >
              {tab.label}
              <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">{tabCount(tab.key)}</span>
              {activeTab === tab.key && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#4F46E5]" />}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] p-4">
          <select value={providerFilter} onChange={(e) => updateProviderFilter(e.target.value)} className="h-[34px] min-w-[150px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:w-full">
            <option value="all">All Providers</option>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-[34px] min-w-[140px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
            <option value="all">All Statuses</option>
            {SERVER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className="h-[34px] min-w-[130px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
            <option value="all">All Regions</option>
            {regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-[34px] min-w-[120px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
            <option value="all">All Types</option>
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)} className="h-[34px] min-w-[150px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
            <option value="all">All Billing Cycles</option>
            {billingCycles.map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}
          </select>
          {admin && (
            <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="h-[34px] min-w-[130px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] max-sm:flex-1">
              <option value="all">All Users</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          )}
          <div className="relative min-w-[220px] flex-1 max-sm:min-w-full">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search servers..."
              className="h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[12px] text-[#111827] outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
            />
          </div>
          <button className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
          {admin && (
            <>
              <Link href="/api/export?entity=servers" className="ml-auto inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB] max-sm:ml-0">
                <Download className="h-3.5 w-3.5" />
                Export
              </Link>
              <button
                onClick={runRegionDetection}
                disabled={detectingRegions}
                className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#BBF7D0] bg-[#ECFDF5] px-3 text-[12px] font-semibold text-[#15803D] hover:bg-[#DCFCE7] disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${detectingRegions ? "animate-spin" : ""}`} />
                {detectingRegions ? "Detecting..." : "Detect regions"}
              </button>
            </>
          )}
          <select
            value={blacklistProvider}
            onChange={(event) => setBlacklistProvider(event.target.value as BlacklistProvider)}
            disabled={checkingBlacklist}
            aria-label="Blacklist provider"
            className={`${admin ? "" : "ml-auto"} h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#374151] disabled:opacity-60`}
          >
            {BLACKLIST_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>{provider.label}</option>
            ))}
          </select>
          <button
            onClick={() => runBlacklistCheck()}
            disabled={checkingBlacklist || selected.length === 0}
            className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#C7D2FE] bg-[#EEF2FF] px-3 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#E0E7FF] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingBlacklist ? "animate-spin" : ""}`} />
            {checkingBlacklist ? "Checking..." : selected.length > 0 ? `Check blacklist (${selected.length})` : "Check blacklist"}
          </button>
          <button className="flex h-[34px] w-[34px] items-center justify-center rounded-[7px] border border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5]">
            <List className="h-4 w-4" />
          </button>
          <button className="flex h-[34px] w-[34px] items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#94A3B8]">
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] px-4 py-3">
          <button onClick={togglePage} className="flex items-center gap-2 text-[12px] font-medium text-[#374151]">
            {paginated.length > 0 && paginated.every((server) => selected.includes(server.id)) ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}
            {selected.length} selected
          </button>
          {filtered.length > paginated.length && selected.length < filtered.length && (
            <button
              onClick={() => setSelected(filtered.map((server) => server.id))}
              className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#F9FAFB]"
            >
              Select all filtered ({filtered.length})
            </button>
          )}
          <select
            disabled={selected.length === 0}
            onChange={(e) => {
              if (e.target.value) bulkUpdateStatus(e.target.value);
              e.currentTarget.value = "";
            }}
            className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] disabled:opacity-50"
          >
            <option value="">Bulk actions</option>
            <option value="active">Mark active</option>
            <option value="paused">Pause</option>
            <option value="suspended">Suspend</option>
            <option value="ts04_error">Mark TSS04</option>
            <option value="tss09_error">Mark TSS09</option>
            <option value="bounce">Mark Bounce</option>
          </select>
          <button
            disabled={selected.length === 0 || deletingStatistics}
            onClick={deleteSelectedStatistics}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-[#FED7AA] bg-white px-3 text-[12px] font-semibold text-[#EA580C] disabled:opacity-50"
          >
            {deletingStatistics ? "Deleting..." : "Delete selected statistics"}
          </button>
          <button
            disabled={selected.length === 0}
            onClick={deleteSelectedServers}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-[#FECACA] bg-white px-3 text-[12px] font-semibold text-[#DC2626] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete selected
          </button>
        </div>

        <div className="space-y-3 p-4 xl:hidden">
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-[10px] border border-[#E5E7EB] bg-white p-4">
                <div className="h-5 w-36 animate-pulse rounded bg-gray-100" />
                <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100" />
              </div>
            ))
          ) : error ? (
            <div className="rounded-[10px] border border-[#FECACA] bg-white p-5 text-center text-[13px] font-medium text-red-600">{error}</div>
          ) : paginated.length === 0 ? (
            <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-6 text-center text-[13px] text-[#6B7280]">No servers match the current filters.</div>
          ) : (
            paginated.map((server) => {
              const selectedRow = selected.includes(server.id);
              const primaryIp = server.ips?.[0];
              const meta = ipMeta(primaryIp);
              const region = detectedRegion(server);
              return (
                <article key={server.id} className={`rounded-[10px] border border-[#E5E7EB] p-4 ${serverRowTone(server.status, selectedRow)}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleRow(server.id)} className="mt-0.5">
                      {selectedRow ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-[#2563EB]">{server.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <ProviderLogo name={server.providerName || "Provider"} website={server.providerWebsite} size="sm" className="h-5 w-5 rounded-[5px]" />
                            <span className="truncate text-[12px] font-medium text-[#374151]">{server.providerName ?? "-"}</span>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-[5px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#2563EB]">{serverType(server)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-[5px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#4B5563]">{server.status}</span>
                        {primaryIp?.address && <span className="rounded-[5px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#4B5563]">{primaryIp.address}</span>}
                        {meta?.listedLabel && (
                          <span className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${meta.listed ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#ECFDF5] text-[#15803D]"}`}>
                            {meta.listedLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Region</p>
                      <p className="mt-1 truncate font-medium text-[#111827]">{region ?? "-"}</p>
                    </div>
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Cost</p>
                      <p className="mt-1 font-medium text-[#111827]">{money(Number(server.monthlyCost || 0), server.currency || "USD")}</p>
                    </div>
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Limit</p>
                      <input
                        value={limitDrafts[server.id] ?? ""}
                        placeholder="Not set"
                        onChange={(e) => setLimitDrafts({ ...limitDrafts, [server.id]: e.target.value })}
                        onBlur={(e) => saveLimit(server, e.target.value)}
                        className="mt-1 h-[30px] w-full rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827]"
                      />
                    </div>
                    <div className="rounded-[8px] bg-[#F8FAFC] p-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#64748B]">Uptime</p>
                      <p className="mt-1 font-medium text-[#111827]">{uptime(server)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-[12px] text-[#6B7280]">
                      Assigned: <span className="font-semibold text-[#111827]">{server.assignedUsers?.[0]?.name || "Unassigned"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(server)} className="inline-flex h-8 items-center gap-1 rounded-[7px] border border-[#C7D2FE] px-2.5 text-[12px] font-semibold text-[#4F46E5]">
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => deleteServer(server)} disabled={deletingServers[server.id]} className="inline-flex h-8 items-center gap-1 rounded-[7px] border border-[#FECACA] px-2.5 text-[12px] font-semibold text-[#DC2626] disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[1220px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-white">
                <th className="w-10 px-4 py-3"></th>
                {["Server", "Provider", "Type", "Region", "Status", "Daily Volume Limit", "Monthly Cost", "Start Date", "Renewal Date", "Assigned To", "Uptime", "Purpose / Tags", "Actions"].map((header) => (
                  <th key={header} className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-[0.03em] text-[#4B5563]">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-b border-[#F1F5F9]">
                    {Array.from({ length: 14 }).map((__, cell) => (
                      <td key={cell} className="px-3 py-3">
                        <div className="h-4 rounded bg-[#F1F5F9] animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-[13px] font-medium text-red-600">{error}</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-[13px] text-[#6B7280]">No servers match the current filters.</td>
                </tr>
              ) : (
                paginated.map((server) => {
                  const renewalDays = daysUntil(server.expirationDate);
                  const selectedRow = selected.includes(server.id);
                  const primaryIp = server.ips?.[0];
                  const meta = ipMeta(primaryIp);
                  const region = detectedRegion(server);
                  return (
                    <tr key={server.id} className={`border-b border-[#F1F5F9] transition-colors ${serverRowTone(server.status, selectedRow)}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleRow(server.id)}>
                          {selectedRow ? <CheckSquare className="h-4 w-4 text-[#4F46E5]" /> : <Square className="h-4 w-4 text-[#CBD5E1]" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-[#2563EB]">{server.name}</p>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">{primaryIp?.address ?? server.location ?? "-"}</p>
                          {primaryIp && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {meta?.geoLabel && <span className="rounded-[5px] bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#4B5563]">{meta.geoLabel}</span>}
                              <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold ${meta?.listed ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#ECFDF5] text-[#15803D]"}`}>
                                {meta?.listedLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] font-medium text-[#111827]">
                        <div className="flex items-center gap-2">
                          <ProviderLogo name={server.providerName || "Provider"} website={server.providerWebsite} size="sm" className="h-6 w-6 rounded-[5px]" />
                          <span>{server.providerName ?? "-"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-[5px] border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#2563EB]">{serverType(server)}</span>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-[#374151]">{region ?? "-"}</td>
                      <td className="px-3 py-3">
                        <select
                          value={server.status}
                          onChange={(e) => saveStatus(server, e.target.value)}
                          disabled={savingStatuses[server.id]}
                          className="h-[30px] rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#374151] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                        >
                          {SERVER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            value={limitDrafts[server.id] ?? ""}
                            placeholder="Not set"
                            onChange={(e) => setLimitDrafts({ ...limitDrafts, [server.id]: e.target.value })}
                            onBlur={(e) => saveLimit(server, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") {
                                setLimitDrafts({ ...limitDrafts, [server.id]: server.dailySendLimit != null ? String(server.dailySendLimit) : "" });
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={savingLimits[server.id]}
                            className="h-[30px] w-[86px] rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827] outline-none placeholder:text-[#9CA3AF] focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                          />
                          {limitDrafts[server.id] !== (server.dailySendLimit != null ? String(server.dailySendLimit) : "") && (
                            <button
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => saveLimit(server, limitDrafts[server.id] ?? "")}
                              disabled={savingLimits[server.id]}
                              className="rounded-[6px] bg-[#4F46E5] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                            >
                              {savingLimits[server.id] ? "..." : "Save"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-[#111827]">{money(Number(server.monthlyCost || 0), server.currency || "USD")}</td>
                      <td className="px-3 py-3 text-[13px] text-[#374151]">{dateLabel(server.activationDate || server.purchaseDate || server.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div className="text-[13px] text-[#374151]">
                          <p>{dateLabel(server.expirationDate)}</p>
                          {renewalDays !== null && (
                            <p className={`text-[11px] ${renewalDays <= 30 ? "text-[#EA580C]" : "text-[#6B7280]"}`}>{renewalDays < 0 ? "Expired" : `in ${renewalDays} days`}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-bold text-[#4F46E5]">
                            {server.assignedUsers?.[0]?.name?.charAt(0) ?? <UserRound className="h-3.5 w-3.5" />}
                          </span>
                          {admin ? (
                            <select
                              value={assignmentDrafts[server.id] ?? ""}
                              onChange={(e) => {
                                const userId = e.target.value;
                                setAssignmentDrafts((state) => ({ ...state, [server.id]: userId }));
                                saveAssignment(server, userId);
                              }}
                              disabled={savingAssignments[server.id]}
                              className="h-[30px] w-[150px] rounded-[6px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#374151] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15 disabled:opacity-60"
                            >
                              <option value="">Unassigned</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex h-[30px] items-center rounded-[6px] bg-[#F8FAFC] px-2 text-[12px] font-semibold text-[#374151] ring-1 ring-[#E5E7EB]">
                              {server.assignedUsers?.[0]?.id === (session?.user as Record<string, unknown> | undefined)?.id ? "Me" : server.assignedUsers?.[0]?.name || "Me"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${server.status === "active" ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
                          <span className={`h-2 w-2 rounded-full ${server.status === "active" ? "bg-[#16A34A]" : "bg-[#EF4444]"}`} />
                          {uptime(server)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {purposeTags(server).map((tag) => (
                            <span key={tag} className="rounded-[5px] bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5]">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => openEdit(server)}
                          className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#4F46E5] hover:bg-[#EEF2FF]"
                          title="Edit server"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteServer(server)}
                          disabled={deletingServers[server.id]}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50"
                          title="Delete server"
                        >
                          {deletingServers[server.id] ? <MoreHorizontal className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[12px] text-[#6B7280]">Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} servers</p>
          <div className="flex items-center gap-1">
            <button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => (
              <button key={number} onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-[7px] px-2 text-[12px] font-semibold ${page === number ? "bg-[#4F46E5] text-white" : "border border-[#E5E7EB] bg-white text-[#374151]"}`}>{number}</button>
            ))}
            <button disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-[#E5E7EB] bg-white text-[#6B7280] disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setEditingServer(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>{editingServer ? "Edit Server" : "Add Server"}</DialogTitle>
          <div className="grid grid-cols-2 gap-3 py-2">
            <label className="col-span-2 space-y-1.5 text-[13px] font-medium text-[#374151]">
              Server Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px] outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Provider
              <select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value, contactedByUserId: "" })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]">
                <option value="">Select provider</option>
                {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]">
                {SERVER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Type / Plan
              <input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Operating System
              <input value={form.operatingSystem} onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Region
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Monthly Cost
              <input type="number" min="0" value={form.monthlyCost} onChange={(e) => setForm({ ...form, monthlyCost: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Currency
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Daily Volume Limit
              <input type="number" min="0" value={form.dailySendLimit} onChange={(e) => setForm({ ...form, dailySendLimit: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Billing Method
              <select value={form.billingMethod} onChange={(e) => setForm({ ...form, billingMethod: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]">
                <option value="">Select...</option>
                <option value="hourly">Hourly</option>
                <option value="monthly">Monthly</option>
                <option value="annually">Annually</option>
                <option value="one_time">One Time</option>
                <option value="free">Free</option>
              </select>
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Purchase Date
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Activation Date
              <input type="date" value={form.activationDate} onChange={(e) => setForm({ ...form, activationDate: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="space-y-1.5 text-[13px] font-medium text-[#374151]">
              Renewal / Expiration Date
              <input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]" />
            </label>
            <label className="col-span-2 space-y-1.5 text-[13px] font-medium text-[#374151]">
              IP Addresses
              <textarea
                value={form.ipAddresses}
                onChange={(e) => setForm({ ...form, ipAddresses: e.target.value })}
                rows={3}
                placeholder="One IP per line, or comma separated"
                className="w-full rounded-[7px] border border-[#E5E7EB] px-3 py-2 text-[13px] outline-none placeholder:text-[#9CA3AF] focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/15"
              />
              <span className="block text-[11px] font-normal text-[#6B7280]">These IPs will be linked to this server and used for geo and blacklist checks.</span>
            </label>
            <label className="col-span-2 space-y-1.5 text-[13px] font-medium text-[#374151]">
              Assigned User
              <select value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]">
                <option value="">Unassigned</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 space-y-1.5 text-[13px] font-medium text-[#374151]">
              Contacted By
              <select value={form.contactedByUserId} onChange={(e) => setForm({ ...form, contactedByUserId: e.target.value })} className="h-[36px] w-full rounded-[7px] border border-[#E5E7EB] px-3 text-[13px]">
                <option value="">{editingServer?.providerContactedUsers?.length ? "Keep current contacted user" : "Not contacted manually"}</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <span className="block text-[11px] font-normal text-[#6B7280]">
                Use this when the provider was contacted through a website form or ticket instead of email. Saving a changed value records a manual provider conversation.
              </span>
            </label>
            <label className="col-span-2 space-y-1.5 text-[13px] font-medium text-[#374151]">
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full rounded-[7px] border border-[#E5E7EB] px-3 py-2 text-[13px]" />
            </label>
          </div>
          <DialogFooter>
            <button onClick={() => { setShowCreate(false); setEditingServer(null); }} disabled={saving} className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-4 text-[13px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">Cancel</button>
            <button onClick={saveServer} disabled={saving} className="h-[36px] rounded-[7px] bg-[#4F46E5] px-4 text-[13px] font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">{saving ? "Saving..." : "Save Server"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ServersPage() {
  return (
    <Suspense fallback={<div className="h-[320px] animate-pulse rounded-[10px] border border-[#E5E7EB] bg-white" />}>
      <ServersPageContent />
    </Suspense>
  );
}
