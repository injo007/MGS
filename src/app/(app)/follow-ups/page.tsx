"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare } from "lucide-react";

interface FollowUpItem {
  id: string;
  name: string;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  assignedUserName: string | null;
  contactStatus: string;
}

export default function FollowUpsPage() {
  const [data, setData] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/providers?contactStatus=follow_up_due&pageSize=100")
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const now = mounted ? new Date() : new Date(0);
  const today = mounted ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(0);

  const overdue = data.filter((item) => {
    if (!item.nextFollowUpDate) return false;
    return new Date(item.nextFollowUpDate) < today;
  }).length;

  const dueToday = data.filter((item) => {
    if (!item.nextFollowUpDate) return false;
    const d = new Date(item.nextFollowUpDate);
    return d >= today && d < new Date(today.getTime() + 86400000);
  }).length;

  const upcoming = data.length - overdue - dueToday;

  function getStatus(item: FollowUpItem): string {
    if (!item.nextFollowUpDate) return "unknown";
    const d = new Date(item.nextFollowUpDate);
    if (d < today) return "overdue";
    if (d < new Date(today.getTime() + 86400000)) return "due_today";
    return "upcoming";
  }

  function daysWaiting(lastContact: string | null): number {
    if (!lastContact) return 0;
    const diff = now.getTime() - new Date(lastContact).getTime();
    return Math.floor(diff / 86400000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Follow-ups</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">Providers requiring follow-up actions</p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <p className="text-[12px] text-[#6B7280]">Overdue</p>
          </div>
          {loading ? (
            <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "32px" }} />
          ) : (
            <p className="text-[26px] font-bold text-[#111827]">{overdue}</p>
          )}
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <p className="text-[12px] text-[#6B7280]">Due Today</p>
          </div>
          {loading ? (
            <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "32px" }} />
          ) : (
            <p className="text-[26px] font-bold text-[#111827]">{dueToday}</p>
          )}
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-[12px] text-[#6B7280]">Upcoming</p>
          </div>
          {loading ? (
            <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "32px" }} />
          ) : (
            <p className="text-[26px] font-bold text-[#111827]">{upcoming}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Provider</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Last Contact</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Days Waiting</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Assigned To</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Next Follow-up</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    {[1,2,3,4,5,6].map((j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: `${50 + j * 15}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-2.5">
                    <EmptyState icon={MessageSquare} title="No follow-ups due" description="All providers are up to date" />
                  </td>
                </tr>
              ) : (
                data.map((item) => {
                  const status = getStatus(item);
                  const waiting = daysWaiting(item.lastContactDate);
                  return (
                    <tr key={item.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-3 py-2.5">
                        <Link href={`/providers/${item.id}`} className="flex items-center gap-2.5 hover:opacity-80">
                          <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-[11px] font-bold text-indigo-600 shrink-0">
                            {item.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-medium text-[#111827]">{item.name}</span>
                        </Link>
                      </td>
                      <td className="text-[13px] text-[#374151] px-3 py-2.5">
                        {item.lastContactDate ? new Date(item.lastContactDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[13px] font-medium ${waiting > 3 ? "text-amber-600" : "text-[#374151]"}`}>
                          {waiting} days
                        </span>
                      </td>
                      <td className="text-[13px] text-[#6B7280] px-3 py-2.5">{item.assignedUserName || "—"}</td>
                      <td className="text-[13px] text-[#374151] px-3 py-2.5">
                        {item.nextFollowUpDate ? new Date(item.nextFollowUpDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        {status === "overdue" && <StatusBadge value="denied" label="Overdue" />}
                        {status === "due_today" && <StatusBadge value="pending" label="Due Today" />}
                        {status === "upcoming" && <StatusBadge value="ready_to_contact" label="Upcoming" />}
                        {status === "unknown" && <StatusBadge value="unknown" />}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
