"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ProviderLogo } from "@/components/shared/provider-logo";
import { Clock3, Edit3, ExternalLink, MessageSquare } from "lucide-react";

interface FollowUpItem {
  id: string;
  name: string;
  website: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  assignedUserName: string | null;
  contactStatus: string;
  responseStatus: string;
  decision: string;
  reason: string;
  priority: "overdue" | "due_today" | "waiting" | "needs_action" | "upcoming";
}

interface ProviderRow {
  id: string;
  name: string;
  website: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  assignedUserName: string | null;
  contactStatus: string;
  responseStatus: string;
  decision: string;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function classifyFollowUp(provider: ProviderRow, today = startOfToday()): FollowUpItem | null {
  const next = provider.nextFollowUpDate ? new Date(provider.nextFollowUpDate) : null;
  const tomorrow = new Date(today.getTime() + 86400000);

  if (next && next < today) {
    return { ...provider, reason: "Follow-up date passed", priority: "overdue" };
  }
  if (next && next < tomorrow) {
    return { ...provider, reason: "Follow-up due today", priority: "due_today" };
  }
  if (provider.responseStatus === "needs_follow_up") {
    return { ...provider, reason: "Provider replied and needs action", priority: "needs_action" };
  }
  if (provider.contactStatus === "follow_up_due") {
    return { ...provider, reason: "Marked for follow-up", priority: "needs_action" };
  }
  if (provider.contactStatus === "contacted" && provider.responseStatus === "no_response") {
    return { ...provider, reason: "Contacted with no response yet", priority: "waiting" };
  }
  if (next) {
    return { ...provider, reason: "Scheduled follow-up", priority: "upcoming" };
  }

  return null;
}

export default function FollowUpsPage() {
  const [data, setData] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/providers?pageSize=500&sortBy=score&sortOrder=desc")
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => {
        const today = startOfToday();
        const followUps = ((json.data || []) as ProviderRow[])
          .map((provider) => classifyFollowUp(provider, today))
          .filter((provider): provider is FollowUpItem => Boolean(provider))
          .sort((a, b) => {
            const rank = { overdue: 0, due_today: 1, needs_action: 2, waiting: 3, upcoming: 4 };
            const rankDiff = rank[a.priority] - rank[b.priority];
            if (rankDiff !== 0) return rankDiff;
            return new Date(b.lastContactDate || 0).getTime() - new Date(a.lastContactDate || 0).getTime();
          });
        setData(followUps);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const now = mounted ? new Date() : new Date(0);
  const today = mounted ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(0);

  const overdue = data.filter((item) => item.priority === "overdue").length;
  const dueToday = data.filter((item) => item.priority === "due_today").length;
  const waiting = data.filter((item) => item.priority === "waiting").length;
  const needsAction = data.filter((item) => item.priority === "needs_action").length;

  function getStatus(item: FollowUpItem): string {
    return item.priority;
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
        <p className="text-[13px] text-[#6B7280] mt-0.5">Providers needing reply, reminder, or next communication action</p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            <p className="text-[12px] text-[#6B7280]">Needs Action</p>
          </div>
          {loading ? (
            <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "32px" }} />
          ) : (
            <p className="text-[26px] font-bold text-[#111827]">{needsAction}</p>
          )}
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-[12px] text-[#6B7280]">Waiting Reply</p>
          </div>
          {loading ? (
            <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "32px" }} />
          ) : (
            <p className="text-[26px] font-bold text-[#111827]">{waiting}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Provider</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Reason</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Last Contact</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Days Waiting</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Assigned To</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Next Follow-up</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
                <th className="text-right text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    {[1,2,3,4,5,6,7,8].map((j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: `${50 + j * 15}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-2.5">
                    <EmptyState icon={MessageSquare} title="No follow-ups found" description="No contacted providers currently need a reply, reminder, or next action." />
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
                          <ProviderLogo name={item.name} website={item.website} size="sm" />
                          <span className="text-[13px] font-medium text-[#111827]">{item.name}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          <span className="text-[13px] font-medium text-[#374151]">{item.reason}</span>
                        </div>
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
                        {status === "needs_action" && <StatusBadge value="needs_follow_up" label="Needs Action" />}
                        {status === "waiting" && <StatusBadge value="no_response" label="Waiting Reply" />}
                        {status === "upcoming" && <StatusBadge value="ready_to_contact" label="Upcoming" />}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            href={`/providers/${item.id}`}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-2.5 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Link>
                          <Link
                            href={`/providers/${item.id}?tab=outreach#conversations`}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#E0E7FF]"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Conversation
                          </Link>
                          <Link
                            href={`/providers/new?edit=${item.id}`}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-2.5 text-[12px] font-semibold text-[#374151] hover:bg-[#F9FAFB]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        </div>
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
