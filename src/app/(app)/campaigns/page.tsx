"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Activity, Calendar, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export default function CampaignsPage() {
  const [data, setData] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft",
    startDate: "",
    endDate: "",
  });

  const fetchData = () => {
    fetch("/api/campaigns?pageSize=100")
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      toast.success("Campaign created");
      setShowCreate(false);
      setForm({ name: "", description: "", status: "draft", startDate: "", endDate: "" });
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Campaigns</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Track and manage provider outreach campaigns</p>
        </div>
        <button
          className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </button>
      </div>

      {error && (
        <div className="rounded-[7px] bg-red-50 border border-red-200 p-3 text-[13px] text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Campaign</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Start Date</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">End Date</th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "128px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "64px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 bg-[#F1F5F9] rounded animate-pulse" style={{ width: "80px" }} /></td>
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr className="border-t border-[#F1F5F9]">
                  <td colSpan={5} className="px-3 py-12 text-center">
                    <Inbox className="h-8 w-8 text-[#9CA3AF] mx-auto mb-2" />
                    <p className="text-[13px] text-[#6B7280]">No campaigns found</p>
                  </td>
                </tr>
              ) : (
                data.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-[#9CA3AF]" />
                        <div>
                          <span className="text-[13px] font-medium text-[#111827]">{campaign.name}</span>
                          {campaign.description && (
                            <p className="text-[12px] text-[#6B7280] truncate max-w-[250px]">{campaign.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={campaign.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">
                      {campaign.startDate ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(campaign.startDate).toLocaleDateString()}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">
                      {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Create a new provider outreach campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Campaign Name *</label>
              <input
                placeholder="e.g. Q2 Outreach"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Description</label>
              <textarea
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
              onClick={() => setShowCreate(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
              onClick={handleCreate}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Create Campaign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
