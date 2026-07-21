"use client";

import { useState } from "react";
import { Download, Loader2, Check } from "lucide-react";

const EXPORT_TYPES = [
  { key: "providers", label: "All Providers", description: "Export all provider records" },
  { key: "servers", label: "Servers", description: "Export all server records" },
  { key: "ip_addresses", label: "IP Addresses", description: "Export all IP address records" },
  { key: "outreach", label: "Outreach Logs", description: "Export outreach history" },
  { key: "sending_logs", label: "Server Statistics", description: "Export daily server statistics" },
  { key: "tasks", label: "Tasks", description: "Export all task records" },
];

export default function ExportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const handleExport = async (entity: string) => {
    setLoading(entity);
    try {
      const res = await fetch(`/api/export?entity=${entity}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Export failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setCompleted((prev) => new Set(prev).add(entity));
      setTimeout(() => {
        setCompleted((prev) => {
          const next = new Set(prev);
          next.delete(entity);
          return next;
        });
      }, 3000);
    } catch (err: unknown) {
      alert("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">
          Exports
        </h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">
          Export data from CloudOps CRM as CSV files
        </p>
      </div>

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-[#111827]">Available Exports</h2>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {EXPORT_TYPES.map((type) => (
            <div
              key={type.key}
              className="flex items-center justify-between py-3 border-b border-[#E5E7EB]/50 last:border-0"
            >
              <div>
                <span className="text-sm font-medium text-[#374151]">{type.label}</span>
                <p className="text-[12px] text-[#6B7280] mt-0.5">{type.description}</p>
              </div>
              <button
                disabled={loading !== null}
                onClick={() => handleExport(type.key)}
                className={`h-[34px] rounded-[7px] px-3 text-[13px] font-medium transition-colors inline-flex items-center ${
                  completed.has(type.key)
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-[#4F46E5] hover:bg-[#4338CA] text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === type.key ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : completed.has(type.key) ? (
                  <>
                    <Check className="h-3 w-3 mr-1.5" />
                    Downloaded
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3 mr-1.5" />
                    Download CSV
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
