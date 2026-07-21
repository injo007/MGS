"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ProviderResponse {
  id: string;
  providerId: string;
  responseDate: string;
  responseType: string;
  fullResponse: string | null;
  summary: string | null;
  decisionRecommendation: string | null;
  attachmentUrl: string | null;
  createdById: string;
  createdAt: string;
  providerName: string | null;
  providerWebsite: string | null;
  creatorName: string | null;
}

interface ProviderResponsesResponse {
  data: ProviderResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Provider {
  id: string;
  name: string;
}

const RESPONSE_TYPES = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_verification", label: "Needs Verification" },
  { value: "requires_deposit", label: "Requires Deposit" },
  { value: "requires_kyc", label: "Requires KYC" },
  { value: "requires_support_request", label: "Support Request" },
  { value: "port25_blocked", label: "Port 25 Blocked" },
  { value: "port25_available", label: "Port 25 Available" },
  { value: "mail_servers_prohibited", label: "Mail Servers Prohibited" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  approved: { bg: "#ECFDF5", text: "#16A34A" },
  rejected: { bg: "#FEF2F2", text: "#DC2626" },
  needs_verification: { bg: "#FEFCE8", text: "#CA8A04" },
  requires_deposit: { bg: "#FFF7ED", text: "#EA580C" },
  requires_kyc: { bg: "#FAF5FF", text: "#9333EA" },
  requires_support_request: { bg: "#F0FDF4", text: "#16A34A" },
  port25_blocked: { bg: "#FEF2F2", text: "#DC2626" },
  port25_available: { bg: "#ECFDF5", text: "#16A34A" },
  mail_servers_prohibited: { bg: "#FEF2F2", text: "#DC2626" },
  other: { bg: "#F3F4F6", text: "#4B5563" },
};

const DEFAULT_COLOR = { bg: "#F3F4F6", text: "#4B5563" };

function stripEmailMarker(message: string | null | undefined): string {
  return (message || "").replace(/\n?\[serverops-email:[^\]]+\]\s*$/g, "").trim();
}

export default function ProviderResponsesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [responses, setResponses] = useState<ProviderResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<ProviderResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providersList, setProvidersList] = useState<Provider[]>([]);

  const [formData, setFormData] = useState({
    providerId: "",
    responseType: "other",
    responseDate: new Date().toISOString().slice(0, 16),
    summary: "",
    fullResponse: "",
    decisionRecommendation: "",
    attachmentUrl: "",
  });

  useEffect(() => {
    fetch("/api/providers?pageSize=1000&sortBy=name&sortOrder=asc")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setProvidersList(json.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchResponses = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (typeFilter !== "all") params.set("responseType", typeFilter);
    params.set("sortBy", "responseDate");
    params.set("sortOrder", "desc");

    try {
      const res = await fetch(`/api/provider-responses?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch responses");
      const json: ProviderResponsesResponse = await res.json();
      setResponses(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize, typeFilter]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  const openDetail = (response: ProviderResponse) => {
    setSelectedResponse(response);
    setDetailDialogOpen(true);
  };

  const handleAddResponse = async () => {
    if (!formData.providerId) {
      toast.error("Please select a provider");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: formData.providerId,
          responseType: formData.responseType,
          responseDate: formData.responseDate
            ? new Date(formData.responseDate).toISOString()
            : undefined,
          summary: formData.summary || null,
          fullResponse: formData.fullResponse || null,
          decisionRecommendation: formData.decisionRecommendation || null,
          attachmentUrl: formData.attachmentUrl || null,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to create response");
      }
      toast.success("Response added successfully");
      setAddDialogOpen(false);
      setFormData({
        providerId: "",
        responseType: "other",
        responseDate: new Date().toISOString().slice(0, 16),
        summary: "",
        fullResponse: "",
        decisionRecommendation: "",
        attachmentUrl: "",
      });
      fetchResponses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setPage(1);
  };

  const hasActiveFilters = typeFilter !== "all" || search;
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">
            Provider Responses
          </h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Track and manage responses from VPS and cloud providers
          </p>
        </div>
        <button
          onClick={() => setAddDialogOpen(true)}
          className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Response
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
          <input
            placeholder="Search responses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white pl-9 pr-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
        >
          <option value="all">All Types</option>
          {RESPONSE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
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
          {!loading && total > 0 && `${total} responses`}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left text-[11px] font-semibold text-[#374151] px-5 py-2.5 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Provider
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Summary
                </th>
                <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">
                  Recommendation
                </th>
                <th className="text-right text-[11px] font-semibold text-[#374151] px-5 py-2.5 uppercase tracking-wider w-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-t border-[#F1F5F9]">
                    <td className="px-5 py-3">
                      <div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-3.5 w-24 bg-gray-100 rounded animate-pulse" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-5 w-20 bg-gray-100 rounded-[5px] animate-pulse" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-3.5 w-44 bg-gray-100 rounded animate-pulse" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="h-3.5 w-20 bg-gray-100 rounded animate-pulse" />
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-[13px] font-medium text-red-600 mb-2">{error}</p>
                    <button
                      onClick={fetchResponses}
                      className="h-[30px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
                    >
                      Try Again
                    </button>
                  </td>
                </tr>
              ) : responses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-[13px] text-[#6B7280] mb-3">No responses found</p>
                    <button
                      onClick={() => setAddDialogOpen(true)}
                      className="inline-flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Response
                    </button>
                  </td>
                </tr>
              ) : (
                responses.map((response) => {
                  const colors = TYPE_COLORS[response.responseType] || DEFAULT_COLOR;
                  const typeLabel = RESPONSE_TYPES.find(
                    (t) => t.value === response.responseType
                  )?.label || response.responseType;
                  return (
                    <tr
                      key={response.id}
                      className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                      onClick={() => openDetail(response)}
                    >
                      <td className="px-5 py-3">
                        <span className="text-[13px] text-[#374151] whitespace-nowrap">
                          {response.responseDate
                            ? new Date(response.responseDate).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric", year: "numeric" }
                              )
                            : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/providers/${response.providerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 group"
                        >
                          <div className="h-7 w-7 rounded bg-[#EEF2FF] flex items-center justify-center text-[9px] font-bold text-[#4F46E5] shrink-0">
                            {response.providerName
                              ? response.providerName.slice(0, 2).toUpperCase()
                              : "??"}
                          </div>
                          <p className="text-[13px] font-medium text-[#111827] group-hover:text-[#4F46E5] transition-colors truncate">
                            {response.providerName || "Unknown"}
                          </p>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3 max-w-[300px]">
                        <p className="text-[13px] text-[#374151] truncate">
                          {response.summary || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[13px] text-[#374151]">
                          {response.decisionRecommendation || "—"}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openDetail(response)}
                          className="h-7 w-7 rounded flex items-center justify-center text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F1F5F9] transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#E5E7EB]">
            <p className="text-[11px] text-[#6B7280]">
              Showing {startRow}&ndash;{endRow} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 rounded border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`h-7 w-7 rounded text-[12px] font-medium flex items-center justify-center transition-colors ${
                      pageNum === page
                        ? "bg-[#4F46E5] text-white"
                        : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 w-7 rounded border border-[#E5E7EB] bg-white flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Response Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Provider Response</DialogTitle>
            <DialogDescription>
              Record a response received from a provider.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Provider</label>
              <select
                value={formData.providerId}
                onChange={(e) =>
                  setFormData({ ...formData, providerId: e.target.value })
                }
                className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              >
                <option value="">Select a provider...</option>
                {providersList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-1 gap-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Response Type</label>
                <select
                  value={formData.responseType}
                  onChange={(e) =>
                    setFormData({ ...formData, responseType: e.target.value })
                  }
                  className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                >
                  {RESPONSE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Response Date</label>
                <input
                  type="datetime-local"
                  value={formData.responseDate}
                  onChange={(e) =>
                    setFormData({ ...formData, responseDate: e.target.value })
                  }
                  className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Summary</label>
              <input
                type="text"
                value={formData.summary}
                onChange={(e) =>
                  setFormData({ ...formData, summary: e.target.value })
                }
                placeholder="Brief summary of the response"
                className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Full Response</label>
              <textarea
                value={formData.fullResponse}
                onChange={(e) =>
                  setFormData({ ...formData, fullResponse: e.target.value })
                }
                placeholder="Paste the full response text here"
                rows={4}
                className="h-[80px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-1 gap-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Recommendation</label>
                <select
                  value={formData.decisionRecommendation}
                  onChange={(e) =>
                    setFormData({ ...formData, decisionRecommendation: e.target.value })
                  }
                  className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                >
                  <option value="">No recommendation</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Attachment URL</label>
                <input
                  type="url"
                  value={formData.attachmentUrl}
                  onChange={(e) =>
                    setFormData({ ...formData, attachmentUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="h-[36px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddResponse}
              disabled={submitting || !formData.providerId}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent
          className="sm:max-w-2xl sm:max-h-[80vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Response Detail</DialogTitle>
            <DialogDescription>
              Full details of the provider response.
            </DialogDescription>
          </DialogHeader>
          {selectedResponse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                    Provider
                  </p>
                  <Link
                    href={`/providers/${selectedResponse.providerId}`}
                    className="text-[13px] font-medium text-[#4F46E5] hover:underline"
                  >
                    {selectedResponse.providerName || "Unknown"}
                  </Link>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                    Date
                  </p>
                  <p className="text-[13px] text-[#374151]">
                    {selectedResponse.responseDate
                      ? new Date(selectedResponse.responseDate).toLocaleDateString(
                          "en-US",
                          { month: "long", day: "numeric", year: "numeric" }
                        )
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                    Type
                  </p>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium"
                    style={{
                      backgroundColor:
                        TYPE_COLORS[selectedResponse.responseType]?.bg ||
                        DEFAULT_COLOR.bg,
                      color:
                        TYPE_COLORS[selectedResponse.responseType]?.text ||
                        DEFAULT_COLOR.text,
                    }}
                  >
                    {RESPONSE_TYPES.find(
                      (t) => t.value === selectedResponse.responseType
                    )?.label || selectedResponse.responseType}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                    Logged By
                  </p>
                  <p className="text-[13px] text-[#374151]">
                    {selectedResponse.creatorName || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                    Recommendation
                  </p>
                  <p className="text-[13px] text-[#374151]">
                    {selectedResponse.decisionRecommendation || "—"}
                  </p>
                </div>
                {selectedResponse.attachmentUrl && (
                  <div>
                    <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                      Attachment
                    </p>
                    <a
                      href={selectedResponse.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-[#4F46E5] hover:underline"
                    >
                      View attachment
                    </a>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                  Summary
                </p>
                <p className="text-[13px] text-[#374151]">
                  {selectedResponse.summary || "No summary provided."}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">
                  Full Response
                </p>
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <pre className="text-[13px] text-[#374151] whitespace-pre-wrap font-sans">
                    {stripEmailMarker(selectedResponse.fullResponse) ||
                      "No full response text provided."}
                  </pre>
                </div>
              </div>
            </div>
          )}
          <DialogFooter showCloseButton={true} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
