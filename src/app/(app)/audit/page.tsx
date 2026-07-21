"use client";

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

interface AuditItem {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
}

export default function AuditPage() {
  const [data, setData] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (actionFilter !== "all") params.set("action", actionFilter);

    fetch(`/api/audit?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((json) => {
        setData(json.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [actionFilter]);

  const filtered = data.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.userName?.toLowerCase().includes(q) ||
      item.entityType.toLowerCase().includes(q) ||
      item.action.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Audit Log</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">Complete history of all system actions</p>
      </div>

      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-[13px] text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search audit log..."
                className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#374151] w-full focus:outline-none focus:ring-1 focus:ring-[#D1D5DB] focus:border-[#D1D5DB]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-1 focus:ring-[#D1D5DB] focus:border-[#D1D5DB]"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value || "all")}
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Timestamp</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">User</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Action</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Entity Type</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "128px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "96px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "56px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "96px" }} /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-2.5">
                    <EmptyState icon={Inbox} title="No audit logs found" />
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                    <td className="text-[13px] text-[#6B7280] whitespace-nowrap px-3 py-2.5">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[13px] font-medium text-[#111827]">{log.userName || "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={log.action} />
                    </td>
                    <td className="text-[13px] font-medium text-[#374151] px-3 py-2.5">{log.entityType}</td>
                    <td className="text-[13px] font-mono text-[#6B7280] px-3 py-2.5">
                      {log.entityId ? `${log.entityId.slice(0, 8)}…` : "—"}
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
