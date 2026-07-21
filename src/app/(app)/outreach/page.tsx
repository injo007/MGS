"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Search, Mail, MessageSquare, Send, Inbox, X, Plus, Loader2, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

const CHANNEL_ICONS: Record<string, typeof Mail> = { email: Mail, support_ticket: MessageSquare, contact_form: Send, live_chat: MessageSquare, phone: Mail, other: Inbox };

interface OutreachItem {
  id: string;
  providerId: string;
  date: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  sendResult: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  providerName: string | null;
  sentById: string | null;
  sentByName: string | null;
}

interface ProviderOption {
  id: string;
  name: string;
}

export default function OutreachPage() {
  const [data, setData] = useState<OutreachItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [contactedByFilter, setContactedByFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<OutreachItem | null>(null);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    providerId: "",
    channel: "email",
    recipient: "",
    subject: "",
    message: "",
    sendResult: "drafted",
    nextAction: "",
    followUpDate: "",
  });

  const fetchData = () => {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (resultFilter !== "all") params.set("sendResult", resultFilter);
    if (contactedByFilter !== "all") params.set("sentById", contactedByFilter);

    fetch(`/api/outreach?${params}`)
      .then((res) => { if (!res.ok) throw new Error("Failed to fetch"); return res.json(); })
      .then((json) => { setData(json.data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, [channelFilter, resultFilter, contactedByFilter]);

  useEffect(() => {
    if (showCreate) {
      fetch("/api/providers?pageSize=100")
        .then((r) => r.json())
        .then((j) => setProviders(j.data || []))
        .catch(() => {});
    }
  }, [showCreate]);

  const handleSave = async () => {
    if (!form.providerId) {
      toast.error("Provider is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingItem ? `/api/outreach/${editingItem.id}` : "/api/outreach";
      const method = editingItem ? "PUT" : "POST";
      const body: Record<string, any> = {
        providerId: form.providerId,
        channel: form.channel,
        recipient: form.recipient || null,
        subject: form.subject || null,
        message: form.message || null,
        sendResult: form.sendResult || null,
        nextAction: form.nextAction || null,
        followUpDate: form.followUpDate || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(editingItem ? "Outreach updated" : "Outreach logged");
      setShowCreate(false);
      setEditingItem(null);
      setForm({ providerId: "", channel: "email", recipient: "", subject: "", message: "", sendResult: "drafted", nextAction: "", followUpDate: "" });
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const filtered = data.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.providerName?.toLowerCase().includes(q) || item.subject?.toLowerCase().includes(q) || item.recipient?.toLowerCase().includes(q) || item.sentByName?.toLowerCase().includes(q);
  });

  const contactedUsers = Array.from(
    new Map(
      data
        .filter((item) => item.sentById && item.sentByName)
        .map((item) => [item.sentById!, { id: item.sentById!, name: item.sentByName! }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const clearFilters = () => {
    setChannelFilter("all");
    setResultFilter("all");
    setContactedByFilter("all");
    setSearch("");
  };

  const hasActiveFilters = channelFilter !== "all" || resultFilter !== "all" || contactedByFilter !== "all" || !!search;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Outreach</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Track all contact attempts and outreach history
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Outreach
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[10px] border border-red-200 bg-red-50/50 p-4">
          <p className="text-[13px] font-medium text-red-600">{error}</p>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
          <input
            placeholder="Search outreach..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
          />
        </div>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
        >
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="support_ticket">Support Ticket</option>
          <option value="contact_form">Contact Form</option>
          <option value="live_chat">Live Chat</option>
          <option value="phone">Phone</option>
          <option value="other">Other</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
        >
          <option value="all">All Results</option>
          <option value="drafted">Drafted</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="replied">Replied</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={contactedByFilter}
          onChange={(e) => setContactedByFilter(e.target.value)}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
        >
          <option value="all">All Contacted By</option>
          {contactedUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-[34px] px-3 text-[13px] text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
        <div className="ml-auto text-[12px] text-[#6B7280]">
          {!loading && filtered.length > 0 && `${filtered.length} logs`}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Provider
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Contacted By
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Channel
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Subject
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Result
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Next Action
                </th>
                <th className="text-right text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2.5"><div className="h-3.5 w-20 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-5 w-16 bg-gray-100 rounded-[5px] animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-5 w-16 bg-gray-100 rounded-[5px] animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-3 py-2.5"><div className="h-3.5 w-16 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <p className="text-[13px] font-medium text-red-600 mb-2">{error}</p>
                    <button
                      onClick={fetchData}
                      className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
                    >
                      Try Again
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <p className="text-[13px] text-[#6B7280] mb-3">No outreach logs found</p>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="inline-flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Log Outreach
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const ChannelIcon = CHANNEL_ICONS[item.channel] || Mail;
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="px-3 py-2.5 text-[13px] text-[#374151] whitespace-nowrap">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[13px] font-medium text-[#111827]">{item.providerName || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {item.sentByName ? (
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-bold text-[#4F46E5]">
                              {item.sentByName.charAt(0)}
                            </span>
                            <span className="text-[13px] font-medium text-[#374151]">{item.sentByName}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[13px] text-[#9CA3AF]">
                            <UserRound className="h-3.5 w-3.5" />
                            System / imported
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon className="h-3.5 w-3.5 text-[#9CA3AF]" />
                          <span className="text-[13px] text-[#374151]">{item.channel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">{item.recipient || "—"}</td>
                      <td className="px-3 py-2.5 text-[13px] text-[#6B7280] max-w-[200px] truncate">{item.subject || "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={item.sendResult || undefined} /></td>
                      <td className="px-3 py-2.5 text-[13px] text-[#6B7280]">{item.nextAction || "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setForm({
                                providerId: item.providerId,
                                channel: item.channel,
                                recipient: item.recipient || "",
                                subject: item.subject || "",
                                message: "",
                                sendResult: item.sendResult || "drafted",
                                nextAction: item.nextAction || "",
                                followUpDate: item.followUpDate ? item.followUpDate.slice(0, 10) : "",
                              });
                              setShowCreate(true);
                            }}
                            className="h-7 w-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setShowDelete(item.id)}
                            className="h-7 w-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Log / Edit Outreach Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditingItem(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Outreach" : "Log Outreach"}</DialogTitle>
            <DialogDescription>Record a contact attempt or outreach activity</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Provider *</label>
              <select
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              >
                <option value="">Select provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                >
                  <option value="email">Email</option>
                  <option value="support_ticket">Support Ticket</option>
                  <option value="contact_form">Contact Form</option>
                  <option value="live_chat">Live Chat</option>
                  <option value="phone">Phone</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-[#374151]">Send Result</label>
                <select
                  value={form.sendResult}
                  onChange={(e) => setForm({ ...form, sendResult: e.target.value })}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                >
                  <option value="drafted">Drafted</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="bounced">Bounced</option>
                  <option value="replied">Replied</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Recipient</label>
              <input
                placeholder="Email or contact name"
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Subject</label>
              <input
                placeholder="Subject line"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Message</label>
              <textarea
                placeholder="Message content or notes..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Next Action</label>
              <input
                placeholder="e.g. Follow up in 3 days"
                value={form.nextAction}
                onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#374151]">Follow-up Date</label>
              <input
                type="date"
                value={form.followUpDate}
                onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => { setShowCreate(false); setEditingItem(null); }}
              disabled={saving}
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {editingItem ? "Save Changes" : "Log Outreach"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDelete} onOpenChange={(open) => { if (!open) setShowDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Delete Outreach Log</DialogTitle>
          <p className="text-[13px] text-[#6B7280] py-2">
            Are you sure you want to delete this outreach log? This action cannot be undone.
          </p>
          <DialogFooter>
            <button onClick={() => setShowDelete(null)} className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">Cancel</button>
            <button
              onClick={async () => {
                if (!showDelete) return;
                setDeleting(true);
                try {
                  const res = await fetch(`/api/outreach/${showDelete}`, { method: "DELETE" });
                  if (!res.ok) throw new Error("Failed");
                  toast.success("Outreach deleted");
                  setShowDelete(null);
                  fetchData();
                } catch {
                  toast.error("Failed to delete outreach");
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="h-[34px] rounded-[7px] bg-[#DC2626] hover:bg-[#B91C1C] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
