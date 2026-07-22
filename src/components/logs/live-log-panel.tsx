"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Activity, ExternalLink, RefreshCw, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LiveLogItem {
  id: string;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function titleFromValue(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return String(record.name || record.title || record.email || record.address || record.label || "").trim() || null;
}

function describeLog(item: LiveLogItem) {
  const action = item.action.replace(/_/g, " ");
  const entity = item.entityType.replace(/_/g, " ");
  const target = titleFromValue(item.newValue) || titleFromValue(item.previousValue);
  return `${action} ${entity}${target ? `: ${target}` : ""}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogRow({ item, isNew }: { item: LiveLogItem; isNew: boolean }) {
  return (
    <div className={cn(
      "border-b border-[#E5E7EB] px-4 py-3 last:border-b-0",
      isNew ? "bg-[#EEF2FF]" : "bg-white",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#111827]">{describeLog(item)}</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">
            {item.userName || "System"} · {formatTime(item.createdAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-[5px] bg-[#F3F4F6] px-2 py-1 text-[11px] font-semibold uppercase text-[#4B5563]">
          {item.entityType}
        </span>
      </div>
    </div>
  );
}

export function LiveLogPanel() {
  const { data: session, status } = useSession();
  const isAdmin = String((session?.user as Record<string, unknown> | undefined)?.roleName || "").toLowerCase() === "admin";
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LiveLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const newestSeenRef = useRef<string | null>(null);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!isAdmin) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/audit?pageSize=40&sortBy=createdAt&sortOrder=desc", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const nextLogs = Array.isArray(json.data) ? json.data : [];
      const newestId = nextLogs[0]?.id || null;
      const previousNewestId = newestSeenRef.current;

      if (previousNewestId && newestId && newestId !== previousNewestId) {
        const newItems = nextLogs.findIndex((item: LiveLogItem) => item.id === previousNewestId);
        const count = newItems === -1 ? 1 : newItems;
        if (!isOpen && count > 0) setUnread((value) => Math.min(99, value + count));
      }

      newestSeenRef.current = newestId;
      setLogs(nextLogs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live logs");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAdmin, isOpen]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchLogs(true);
    const interval = window.setInterval(() => fetchLogs(true), 5000);
    return () => window.clearInterval(interval);
  }, [fetchLogs, isAdmin]);

  useEffect(() => {
    if (isOpen) setUnread(0);
  }, [isOpen]);

  const freshIds = useMemo(() => new Set(logs.slice(0, unread).map((item) => item.id)), [logs, unread]);

  if (status === "loading" || !isAdmin) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-40 right-4 z-[69] flex max-h-[calc(100vh-11rem)] w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 sm:right-6">
          <div className="flex items-center justify-between bg-[#0F172A] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Activity className="size-5" />
              <div>
                <p className="text-sm font-semibold leading-none">Live App Log</p>
                <p className="mt-1 text-[11px] text-white/70">Backend audit events</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label="Refresh live app log"
                onClick={() => fetchLogs(false)}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label="Close live app log"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2">
            <span className="text-[12px] font-medium text-[#64748B]">Auto-refresh every 5 seconds</span>
            <Link href="/audit" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4F46E5] hover:underline">
              Full log <ExternalLink className="size-3" />
            </Link>
          </div>

          <div className="min-h-[280px] flex-1 overflow-y-auto">
            {error ? (
              <div className="p-4 text-[13px] font-medium text-[#DC2626]">Failed to load live log: {error}</div>
            ) : logs.length === 0 ? (
              <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-[#94A3B8]">
                <ScrollText className="size-8" />
                <p className="text-[13px] font-medium">No backend events yet</p>
              </div>
            ) : (
              logs.map((item) => <LogRow key={item.id} item={item} isNew={freshIds.has(item.id)} />)
            )}
          </div>
        </div>
      )}

      {!isOpen && (
        <Button
          size="icon-lg"
          onClick={() => setIsOpen(true)}
          type="button"
          aria-label="Open live app log"
          className="fixed bottom-24 right-6 z-[70] size-14 rounded-full bg-[#0F172A] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#111827]"
        >
          <Activity className="size-6" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unread}
            </span>
          )}
        </Button>
      )}
    </>
  );
}
