"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Activity, ExternalLink, RefreshCw, Terminal, X } from "lucide-react";
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

function levelForAction(action: string) {
  if (["delete", "failed", "error"].some((word) => action.toLowerCase().includes(word))) return "WARN";
  if (["create", "update", "login"].some((word) => action.toLowerCase().includes(word))) return "INFO";
  return "LOG";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogRow({ item, isNew }: { item: LiveLogItem; isNew: boolean }) {
  const level = levelForAction(item.action);
  return (
    <div className={cn("whitespace-pre-wrap break-words px-4 py-1.5 font-mono text-[12px] leading-relaxed", isNew && "bg-[#13213B]")}>
      <span className="text-[#64748B]">[{formatTime(item.createdAt)}]</span>{" "}
      <span className={cn(
        "font-bold",
        level === "WARN" ? "text-[#FBBF24]" : level === "INFO" ? "text-[#22C55E]" : "text-[#93C5FD]",
      )}>
        {level}
      </span>{" "}
      <span className="text-[#A78BFA]">{item.userName || "system"}</span>
      <span className="text-[#64748B]"> :: </span>
      <span className="text-[#E5E7EB]">{describeLog(item)}</span>
      {item.entityId ? <span className="text-[#64748B]"> id={item.entityId}</span> : null}
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
        <div className="fixed bottom-40 right-4 z-[69] flex max-h-[calc(100vh-11rem)] w-[calc(100vw-2rem)] max-w-[560px] flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#020617] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 sm:right-6">
          <div className="flex items-center justify-between border-b border-[#1E293B] bg-[#0F172A] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Terminal className="size-5 text-[#22C55E]" />
              <div>
                <p className="font-mono text-sm font-semibold leading-none">live-app.log</p>
                <p className="mt-1 font-mono text-[11px] text-white/60">backend audit stream</p>
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

          <div className="flex items-center justify-between border-b border-[#1E293B] bg-[#020617] px-4 py-2">
            <span className="font-mono text-[12px] text-[#64748B]">$ tail -f backend/audit.log</span>
            <Link href="/audit" className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-[#93C5FD] hover:underline">
              open audit <ExternalLink className="size-3" />
            </Link>
          </div>

          <div className="min-h-[320px] flex-1 overflow-y-auto bg-[#020617] py-2">
            {error ? (
              <div className="p-4 font-mono text-[12px] font-medium text-[#F87171]">[ERROR] failed to load live log: {error}</div>
            ) : logs.length === 0 ? (
              <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-[#64748B]">
                <Terminal className="size-8" />
                <p className="font-mono text-[13px] font-medium">waiting for backend events...</p>
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
