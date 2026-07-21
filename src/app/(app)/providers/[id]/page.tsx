"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProviderLogo } from "@/components/shared/provider-logo";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  Globe,
  Mail,
  Server,
  MapPin,
  User,
  Edit,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Plus,
  AlertTriangle,
  FileText,
  MessageSquare,
  Activity,
  DollarSign,
  Settings2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getCountryFlagUrl } from "@/lib/provider-utils";

type Provider = {
  id: string;
  name: string;
  website: string | null;
  supportEmail: string | null;
  salesEmail: string | null;
  contactFormUrl: string | null;
  country: string | null;
  region: string | null;
  category: string | null;
  contactStatus: string;
  responseStatus: string;
  decision: string;
  dateFirstContacted: string | null;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  port25Status: string | null;
  ptrStatus: string | null;
  ipv4Available: boolean | null;
  ipv6Available: boolean | null;
  mailServerAllowed: boolean | null;
  sendingRestrictions: string | null;
  dailyLimit: number | null;
  hourlyLimit: number | null;
  abusePolicyNotes: string | null;
  startingPrice: string | null;
  currency: string | null;
  billingMethod: string | null;
  hourlyBilling: boolean | null;
  monthlyBilling: boolean | null;
  setupFee: string | null;
  paymentMethod: string | null;
  refundPolicy: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

type OutreachRecord = {
  id: string;
  providerId: string;
  date: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  message: string | null;
  sentById: string | null;
  sendResult: string | null;
  responseDate: string | null;
  responseSummary: string | null;
  nextAction: string | null;
  followUpDate: string | null;
  providerName: string | null;
  sentByName: string | null;
};

type ServerRecord = {
  id: string;
  name: string;
  providerId: string;
  providerName: string | null;
  plan: string | null;
  location: string | null;
  operatingSystem: string | null;
  status: string;
  monthlyCost: string | null;
  currency: string | null;
  assignedMailerId: string | null;
  createdAt: string;
  updatedAt: string;
};

type IpAddress = {
  id: string;
  address: string;
  ipVersion: string;
  providerId: string;
  providerName: string | null;
  serverId: string;
  serverName: string | null;
  location: string | null;
  status: string;
  ptrConfigured: boolean | null;
  ptrHostname: string | null;
  port25Status: string | null;
  assignedMailerId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProviderConversationEmail = {
  uid: number;
  messageId: string | null;
  mailbox: string;
  sourceEmail: string;
  sourceLabel: string;
  direction: "incoming" | "outgoing";
  from: string;
  fromName: string | null;
  fromAddress: string;
  to: string;
  toAddresses: string[];
  subject: string;
  date: string;
  responseType: string;
  bodyPreview: string;
  bodyText: string;
  seen: boolean;
};

type SendingLogRecord = {
  id: string;
  date: string;
  serverName: string | null;
  plannedSends: number | null;
  actualSends: number | null;
  successfulSends: number | null;
  bounces: number | null;
  complaints: number | null;
  operationalStatus: string | null;
};

type ActivityRecord = {
  id: string;
  action: string;
  entityType: string;
  userName: string | null;
  createdAt: string;
};

function formatEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripEmailMarker(message: string | null | undefined): string {
  return (message || "").replace(/\n?\[serverops-email:[^\]]+\]\s*$/g, "").trim();
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] text-[#6B7280]">{label}</p>
      <p className="text-[13px] font-medium text-[#111827]">{children}</p>
    </div>
  );
}

function BoolField({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div>
      <p className="text-[12px] text-[#6B7280]">{label}</p>
      <div className="mt-0.5">
        {value ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-[#D1D5DB]" />
        )}
      </div>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#6B7280]" />
          <h3 className="text-[13px] font-semibold text-[#111827]">{title}</h3>
        </div>
      </div>
      <div className="p-5">
        <div className="space-y-0">
          {children}
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
        <p className="text-[13px] text-[#6B7280]">Loading provider...</p>
      </div>
    </div>
  );
}

export default function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [outreach, setOutreach] = useState<OutreachRecord[]>([]);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [conversations, setConversations] = useState<ProviderConversationEmail[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationSync, setConversationSync] = useState<{ timestamp: string; mode: string } | null>(null);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [ips, setIps] = useState<IpAddress[]>([]);
  const [ipsLoading, setIpsLoading] = useState(false);
  const [statistics, setStatistics] = useState<SendingLogRecord[]>([]);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const loadedSectionsRef = useRef<Record<string, boolean>>({});
  const loadingSectionsRef = useRef<Record<string, boolean>>({});

  const [outreachDialogOpen, setOutreachDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);

  const [outreachSaving, setOutreachSaving] = useState(false);
  const [serverSaving, setServerSaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  const [outreachChannel, setOutreachChannel] = useState("email");
  const [outreachRecipient, setOutreachRecipient] = useState("");
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachMessage, setOutreachMessage] = useState("");
  const [outreachSendResult, setOutreachSendResult] = useState("sent");
  const [outreachNextAction, setOutreachNextAction] = useState("");
  const [outreachFollowUpDate, setOutreachFollowUpDate] = useState("");

  const [serverName, setServerName] = useState("");
  const [serverPlan, setServerPlan] = useState("");
  const [serverLocation, setServerLocation] = useState("");
  const [serverOs, setServerOs] = useState("");
  const [serverStatus, setServerStatus] = useState("active");
  const [serverCost, setServerCost] = useState("");

  const [noteContent, setNoteContent] = useState("");
  const [noteIsInternal, setNoteIsInternal] = useState(true);

  useEffect(() => {
    async function fetchProvider() {
      try {
        setLoading(true);
        const res = await fetch(`/api/providers/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Provider not found" : "Failed to load provider");
          return;
        }
        setProvider(await res.json());
      } catch {
        setError("Failed to load provider");
      } finally {
        setLoading(false);
      }
    }
    fetchProvider();
  }, [id]);

  const fetchConversations = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.conversations || loadedSectionsRef.current.conversations)) return;
    loadingSectionsRef.current.conversations = true;
    loadedSectionsRef.current.conversations = true;
    setConversationsLoading(true);
    try {
      const res = await fetch(`/api/email/provider-conversations?providerId=${id}&limit=500`);
      if (res.ok) {
        const json = await res.json();
        setConversations(json.data || []);
        setConversationSync(json.lastSync ? { timestamp: json.lastSync.timestamp, mode: json.lastSync.mode } : null);
      }
    } catch {} finally {
      loadingSectionsRef.current.conversations = false;
      setConversationsLoading(false);
    }
  }, [id]);

  const fetchOutreach = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.outreach || loadedSectionsRef.current.outreach)) return;
    loadingSectionsRef.current.outreach = true;
    loadedSectionsRef.current.outreach = true;
    setOutreachLoading(true);
    try {
      const res = await fetch(`/api/outreach?providerId=${id}&pageSize=100`);
      if (res.ok) setOutreach((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.outreach = false;
      setOutreachLoading(false);
    }
  }, [id]);

  const fetchServers = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.servers || loadedSectionsRef.current.servers)) return;
    loadingSectionsRef.current.servers = true;
    loadedSectionsRef.current.servers = true;
    setServersLoading(true);
    try {
      const res = await fetch(`/api/servers?providerId=${id}&pageSize=100`);
      if (res.ok) setServers((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.servers = false;
      setServersLoading(false);
    }
  }, [id]);

  const fetchIps = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.ips || loadedSectionsRef.current.ips)) return;
    loadingSectionsRef.current.ips = true;
    loadedSectionsRef.current.ips = true;
    setIpsLoading(true);
    try {
      const res = await fetch(`/api/ip-addresses?providerId=${id}&pageSize=100`);
      if (res.ok) setIps((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.ips = false;
      setIpsLoading(false);
    }
  }, [id]);

  const fetchStatistics = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.statistics || loadedSectionsRef.current.statistics)) return;
    loadingSectionsRef.current.statistics = true;
    loadedSectionsRef.current.statistics = true;
    setStatisticsLoading(true);
    try {
      const res = await fetch(`/api/sending?providerId=${id}&pageSize=100&sortBy=date&sortOrder=desc`);
      if (res.ok) setStatistics((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.statistics = false;
      setStatisticsLoading(false);
    }
  }, [id]);

  const fetchNotes = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.notes || loadedSectionsRef.current.notes)) return;
    loadingSectionsRef.current.notes = true;
    loadedSectionsRef.current.notes = true;
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/notes?entityType=provider&entityId=${id}`);
      if (res.ok) setNotes((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.notes = false;
      setNotesLoading(false);
    }
  }, [id]);

  const fetchActivity = useCallback(async (force = false) => {
    if (!force && (loadingSectionsRef.current.activity || loadedSectionsRef.current.activity)) return;
    loadingSectionsRef.current.activity = true;
    loadedSectionsRef.current.activity = true;
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/audit?entityId=${id}&pageSize=100&sortBy=createdAt&sortOrder=desc`);
      if (res.ok) setActivity((await res.json()).data || []);
    } catch {} finally {
      loadingSectionsRef.current.activity = false;
      setActivityLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === "outreach") {
      fetchConversations();
      fetchOutreach();
    }
    else if (activeTab === "servers") fetchServers();
    else if (activeTab === "ips") fetchIps();
    else if (activeTab === "sending") fetchStatistics();
    else if (activeTab === "notes") fetchNotes();
    else if (activeTab === "activity") fetchActivity();
  }, [activeTab, fetchActivity, fetchConversations, fetchOutreach, fetchServers, fetchIps, fetchNotes, fetchStatistics]);

  function resetOutreachForm() {
    setOutreachChannel("email");
    setOutreachRecipient("");
    setOutreachSubject("");
    setOutreachMessage("");
    setOutreachSendResult("sent");
    setOutreachNextAction("");
    setOutreachFollowUpDate("");
  }

  function resetServerForm() {
    setServerName("");
    setServerPlan("");
    setServerLocation("");
    setServerOs("");
    setServerStatus("active");
    setServerCost("");
  }

  function resetNoteForm() {
    setNoteContent("");
    setNoteIsInternal(true);
  }

  async function handleSaveOutreach() {
    setOutreachSaving(true);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: id,
          channel: outreachChannel,
          recipient: outreachRecipient || undefined,
          subject: outreachSubject || undefined,
          message: outreachMessage || undefined,
          sendResult: outreachSendResult || undefined,
          nextAction: outreachNextAction || undefined,
          followUpDate: outreachFollowUpDate || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Outreach logged successfully");
      setOutreachDialogOpen(false);
      resetOutreachForm();
      fetchOutreach(true);
    } catch {
      toast.error("Failed to log outreach");
    } finally {
      setOutreachSaving(false);
    }
  }

  async function handleSaveServer() {
    if (!serverName.trim()) {
      toast.error("Server name is required");
      return;
    }
    setServerSaving(true);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: serverName,
          providerId: id,
          plan: serverPlan || undefined,
          location: serverLocation || undefined,
          operatingSystem: serverOs || undefined,
          status: serverStatus,
          monthlyCost: serverCost || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Server added successfully");
      setServerDialogOpen(false);
      resetServerForm();
      fetchServers(true);
    } catch {
      toast.error("Failed to add server");
    } finally {
      setServerSaving(false);
    }
  }

  async function handleSaveNote() {
    if (!noteContent.trim()) {
      toast.error("Note content is required");
      return;
    }
    setNoteSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "provider",
          entityId: id,
          content: noteContent,
          isInternal: noteIsInternal,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Note added successfully");
      setNoteDialogOpen(false);
      resetNoteForm();
      fetchNotes(true);
    } catch {
      toast.error("Failed to add note");
    } finally {
      setNoteSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  if (error || !provider) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-[13px] text-[#6B7280] mb-5">
          <Link href="/providers" className="hover:text-[#4F46E5] transition-colors">Providers</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-[#111827] font-medium">Error</span>
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-5">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-12 w-12 rounded-[10px] bg-red-50 flex items-center justify-center mb-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <p className="text-[13px] font-medium text-[#111827] mb-1">{error || "Provider not found"}</p>
            <Link href="/providers" className="mt-4 inline-flex items-center gap-1.5 h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
              Back to Providers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "outreach", label: "Conversations" },
    { id: "responses", label: "Responses" },
    { id: "servers", label: "Servers" },
    { id: "ips", label: "IPs" },
    { id: "sending", label: "Statistics" },
    { id: "notes", label: "Notes" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-[#6B7280] mb-5">
        <Link href="/providers" className="hover:text-[#4F46E5] transition-colors">Providers</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#111827] font-medium">{provider.name}</span>
      </div>

      {/* Provider Header */}
      <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <ProviderLogo name={provider.name} website={provider.website} size="lg" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">{provider.name}</h1>
                <StatusBadge value={provider.decision} />
              </div>
              <p className="text-[13px] text-[#6B7280] mt-0.5">
                {provider.website && (
                  <React.Fragment key="website">
                    <span className="flex items-center gap-1 inline-flex">
                      <Globe className="h-3.5 w-3.5" />
                      {provider.website.replace(/https?:\/\//, "")}
                    </span>
                  </React.Fragment>
                )}
                {provider.website && provider.country && <span className="mx-2 text-[#D1D5DB]">·</span>}
                {provider.country && (
                  <React.Fragment key="country">
                    <span className="flex items-center gap-1 inline-flex">
                      {getCountryFlagUrl(provider.country) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getCountryFlagUrl(provider.country)!} alt="" className="h-3.5 w-[21px] rounded-sm object-cover" />
                      )}
                      <MapPin className="h-3.5 w-3.5" />
                      {provider.country}
                    </span>
                  </React.Fragment>
                )}
                {(provider.website || provider.country) && provider.assignedUserId && <span className="mx-2 text-[#D1D5DB]">·</span>}
                {provider.assignedUserId && (
                  <React.Fragment key="owner">
                    <span className="flex items-center gap-1 inline-flex">
                      <User className="h-3.5 w-3.5" />
                      {provider.assignedUserName || "Assigned"}
                    </span>
                  </React.Fragment>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              onClick={() => setOutreachDialogOpen(true)}
            >
              <Send className="h-3.5 w-3.5" /> Log Outreach
            </button>
            <Link href={`/providers/new?edit=${id}`}>
              <button className="flex items-center gap-1.5 h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
                <Edit className="h-3.5 w-3.5" /> Edit
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Port 25</p>
            <div className="mt-1.5"><StatusBadge value={provider.port25Status || undefined} /></div>
          </div>
          <Mail className="h-4 w-4 text-[#D1D5DB]" />
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">PTR / rDNS</p>
            <div className="mt-1.5"><StatusBadge value={provider.ptrStatus || undefined} /></div>
          </div>
          <CheckCircle2 className="h-4 w-4 text-[#D1D5DB]" />
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Contact</p>
            <div className="mt-1.5"><StatusBadge value={provider.contactStatus} /></div>
          </div>
          <User className="h-4 w-4 text-[#D1D5DB]" />
        </div>
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">Decision</p>
            <div className="mt-1.5"><StatusBadge value={provider.decision} /></div>
          </div>
          <CheckCircle2 className="h-4 w-4 text-[#D1D5DB]" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#E5E7EB]">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: activeTab === tab.id ? "#4F46E5" : "transparent",
                color: activeTab === tab.id ? "#4F46E5" : "#6B7280",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DetailSection title="Provider Details" icon={Globe}>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Website">
                {provider.website ? (
                  <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-[#4F46E5] hover:underline flex items-center gap-1">
                    {provider.website.replace(/https?:\/\//, "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : "—"}
              </InfoField>
              <InfoField label="Country">{provider.country || "—"}</InfoField>
              <InfoField label="Region">{provider.region || "—"}</InfoField>
              <InfoField label="Category">{provider.category || "—"}</InfoField>
            </div>
            <div className="border-t border-[#F1F5F9] mt-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Support Email">
                  {provider.supportEmail ? (
                    <a href={`mailto:${provider.supportEmail}`} className="text-[#4F46E5] hover:underline">{provider.supportEmail}</a>
                  ) : "—"}
                </InfoField>
                <InfoField label="Sales Email">
                  {provider.salesEmail ? (
                    <a href={`mailto:${provider.salesEmail}`} className="text-[#4F46E5] hover:underline">{provider.salesEmail}</a>
                  ) : "—"}
                </InfoField>
                <InfoField label="Contact Form">
                  {provider.contactFormUrl ? (
                    <a href={provider.contactFormUrl} target="_blank" rel="noopener noreferrer" className="text-[#4F46E5] hover:underline flex items-center gap-1">
                      Link <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : "—"}
                </InfoField>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Infrastructure" icon={Settings2}>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Contact Status"><StatusBadge value={provider.contactStatus} /></InfoField>
              <InfoField label="Response Status"><StatusBadge value={provider.responseStatus} /></InfoField>
              <InfoField label="Decision"><StatusBadge value={provider.decision} /></InfoField>
            </div>
            <div className="border-t border-[#F1F5F9] mt-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Port 25"><StatusBadge value={provider.port25Status} /></InfoField>
                <InfoField label="PTR Status"><StatusBadge value={provider.ptrStatus} /></InfoField>
                <BoolField label="IPv4 Available" value={provider.ipv4Available} />
                <BoolField label="IPv6 Available" value={provider.ipv6Available} />
                <BoolField label="Mail Servers Allowed" value={provider.mailServerAllowed === true || provider.port25Status === "available"} />
              </div>
              {provider.sendingRestrictions && (
                <div className="mt-4 pt-4 border-t border-[#F1F5F9]">
                  <InfoField label="Restrictions">
                    <span className="font-normal text-[#6B7280]">{provider.sendingRestrictions}</span>
                  </InfoField>
                </div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Limits & Commercial" icon={DollarSign}>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Daily Limit">
                {provider.dailyLimit != null ? provider.dailyLimit.toLocaleString() : "—"}
              </InfoField>
              <InfoField label="Hourly Limit">
                {provider.hourlyLimit != null ? provider.hourlyLimit.toLocaleString() : "—"}
              </InfoField>
            </div>
            <div className="border-t border-[#F1F5F9] mt-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Starting Price">
                  {provider.startingPrice
                    ? `$${provider.startingPrice}/${provider.billingMethod === "hourly" ? "hr" : "mo"}`
                    : "—"}
                </InfoField>
                <InfoField label="Billing Method">{formatEnum(provider.billingMethod)}</InfoField>
                <InfoField label="Setup Fee">{provider.setupFee != null ? `$${provider.setupFee}` : "—"}</InfoField>
                <InfoField label="Currency">{provider.currency || "—"}</InfoField>
                <InfoField label="Payment Methods">{provider.paymentMethod || "—"}</InfoField>
                <InfoField label="Refund Policy">{provider.refundPolicy || "—"}</InfoField>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Timeline" icon={Clock}>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="First Contact">{formatDate(provider.dateFirstContacted)}</InfoField>
              <InfoField label="Last Contact">{formatDate(provider.lastContactDate)}</InfoField>
              <InfoField label="Next Follow-up">
                <span className={provider.nextFollowUpDate ? "text-amber-600" : ""}>
                  {formatDate(provider.nextFollowUpDate)}
                </span>
              </InfoField>
            </div>
            <div className="border-t border-[#F1F5F9] mt-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Created">{formatDate(provider.createdAt)}</InfoField>
                <InfoField label="Last Updated">{formatDate(provider.updatedAt)}</InfoField>
              </div>
              {provider.abusePolicyNotes && (
                <div className="mt-4 pt-4 border-t border-[#F1F5F9]">
                  <InfoField label="Abuse Policy Notes">
                    <span className="font-normal text-[#6B7280]">{provider.abusePolicyNotes}</span>
                  </InfoField>
                </div>
              )}
            </div>
          </DetailSection>
        </div>
      )}

      {activeTab === "outreach" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-[#111827]">Provider Conversations</h3>
                <p className="mt-0.5 text-[12px] text-[#6B7280]">
                  Saved email cache only{conversationSync ? ` - last synced ${formatDateTime(conversationSync.timestamp)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]"
                  onClick={() => {
                    fetchConversations(true);
                    fetchOutreach(true);
                  }}
                >
                  Reload Saved
                </button>
                <button
                  className="flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#4338CA]"
                  onClick={() => setOutreachDialogOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> Log Outreach
                </button>
              </div>
            </div>
          </div>
          <div className="p-5">
            {conversationsLoading || outreachLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 && outreach.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <Send className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No saved conversations</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Use Email Inbox sync manually, then reload saved cache here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.map((email) => {
                  const isIncoming = email.direction === "incoming";
                  const body = email.bodyText || email.bodyPreview;
                  return (
                    <article key={`${email.sourceEmail}:${email.mailbox}:${email.uid}`} className="rounded-[8px] border border-[#E5E7EB] bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${isIncoming ? "bg-[#ECFDF5] text-[#15803D]" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>
                              {isIncoming ? <Mail className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                              {isIncoming ? "Provider replied" : "Sent by us"}
                            </span>
                            <span className="rounded-[5px] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#4B5563]">{email.sourceLabel || email.sourceEmail}</span>
                            <StatusBadge value={email.responseType || "other"} />
                          </div>
                          <h4 className="mt-2 text-[14px] font-bold text-[#111827]">{email.subject || "(no subject)"}</h4>
                          <p className="mt-1 text-[12px] text-[#6B7280]">{isIncoming ? "From" : "To"}: {isIncoming ? email.from || email.fromAddress : email.to || email.toAddresses?.join(", ") || "—"}</p>
                        </div>
                        <p className="text-[12px] font-medium text-[#6B7280]">{formatDateTime(email.date)}</p>
                      </div>

                      {body && (
                        <details className="mt-3 rounded-[7px] border border-[#F1F5F9] bg-[#F8FAFC]">
                          <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-[#374151]">Email content</summary>
                          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap px-3 pb-3 text-[12px] leading-5 text-[#374151]">{body}</pre>
                        </details>
                      )}
                    </article>
                  );
                })}

                {outreach.length > 0 && (
                  <div className="pt-2">
                    <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.03em] text-[#6B7280]">Manual Outreach Logs</h4>
                  </div>
                )}
                {outreach.map((record) => {
                  const isReply = record.sendResult === "replied";
                  const message = stripEmailMarker(record.message);
                  return (
                    <article key={record.id} className="rounded-[8px] border border-[#E5E7EB] bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${isReply ? "bg-[#ECFDF5] text-[#15803D]" : "bg-[#EEF2FF] text-[#4F46E5]"}`}>
                              {isReply ? <Mail className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                              {isReply ? "Provider replied" : "Sent by us"}
                            </span>
                            <StatusBadge value={record.channel} />
                            <StatusBadge value={record.sendResult || undefined} />
                          </div>
                          <h4 className="mt-2 text-[14px] font-bold text-[#111827]">{record.subject || "(no subject)"}</h4>
                          <p className="mt-1 text-[12px] text-[#6B7280]">{isReply ? "From" : "To"}: {record.recipient || "—"}</p>
                        </div>
                        <p className="text-[12px] font-medium text-[#6B7280]">{formatDateTime(record.date)}</p>
                      </div>

                      {message && (
                        <details className="mt-3 rounded-[7px] border border-[#F1F5F9] bg-[#F8FAFC]">
                          <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-[#374151]">Message content</summary>
                          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap px-3 pb-3 text-[12px] leading-5 text-[#374151]">{message}</pre>
                        </details>
                      )}

                      {(record.responseSummary || record.nextAction || record.followUpDate) && (
                        <div className="mt-3 grid gap-3 border-t border-[#F1F5F9] pt-3 text-[12px] md:grid-cols-3">
                          <div>
                            <p className="font-semibold text-[#6B7280]">Response Summary</p>
                            <p className="mt-1 text-[#111827]">{record.responseSummary || "—"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#6B7280]">Next Action</p>
                            <p className="mt-1 text-[#111827]">{record.nextAction || "—"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#6B7280]">Follow-up</p>
                            <p className="mt-1 text-[#111827]">{formatDate(record.followUpDate)}</p>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "responses" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Provider Responses</h3>
          </div>
          <div className="p-5">
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                <MessageSquare className="h-5 w-5 text-[#9CA3AF]" />
              </div>
              <p className="text-[13px] font-medium text-[#111827]">No responses recorded</p>
              <p className="text-[12px] text-[#6B7280] mt-0.5">Responses from this provider will appear here</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "servers" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#111827]">
                Servers {servers.length > 0 && `(${servers.length})`}
              </h3>
              <button
                className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
                onClick={() => setServerDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add Server
              </button>
            </div>
          </div>
          <div className="p-5">
            {serversLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <Server className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No servers</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">No servers linked to this provider yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Name</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Plan</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Location</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
                      <th className="text-right text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Monthly Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((server) => (
                      <tr key={server.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-3 py-2.5 text-[13px] font-medium text-[#111827]">{server.name}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#111827]">{server.plan || "—"}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#111827]">{server.location || "—"}</td>
                        <td className="px-3 py-2.5"><StatusBadge value={server.status} /></td>
                        <td className="px-3 py-2.5 text-[13px] text-[#111827] text-right">
                          {server.monthlyCost ? `$${Number(server.monthlyCost).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "ips" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">
              IP Addresses {ips.length > 0 && `(${ips.length})`}
            </h3>
          </div>
          <div className="p-5">
            {ipsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : ips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <Globe className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No IP addresses</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">No IP addresses linked to this provider yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Address</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Version</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Status</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">PTR</th>
                      <th className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">Port 25</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ips.map((ip) => (
                      <tr key={ip.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs text-[#111827]">{ip.address}</td>
                        <td className="px-3 py-2.5"><StatusBadge value={ip.ipVersion} /></td>
                        <td className="px-3 py-2.5"><StatusBadge value={ip.status} /></td>
                        <td className="px-3 py-2.5">
                          {ip.ptrConfigured ? (
                            <span className="flex items-center gap-1 text-[12px] text-[#111827]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              {ip.ptrHostname || "Yes"}
                            </span>
                          ) : (
                            <span className="text-[12px] text-[#6B7280]">Not configured</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge value={ip.port25Status || undefined} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sending" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">
              Server Statistics {statistics.length > 0 && `(${statistics.length})`}
            </h3>
          </div>
          <div className="p-5">
            {statisticsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : statistics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <Activity className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No server statistics</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Daily server statistics for this provider will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E5E7EB]">
                      {["Date", "Server", "Planned", "Sent", "Successful", "Bounces", "Complaints", "Status"].map((header) => (
                        <th key={header} className="text-left text-[11px] font-semibold text-[#374151] px-3 py-2.5 uppercase tracking-wider">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statistics.map((row) => (
                      <tr key={row.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-3 py-2.5 text-[13px] text-[#111827]">{formatDate(row.date)}</td>
                        <td className="px-3 py-2.5 text-[13px] font-medium text-[#111827]">{row.serverName || "—"}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#111827]">{row.plannedSends ?? 0}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#111827]">{row.actualSends ?? 0}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#16A34A]">{row.successfulSends ?? 0}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#EA580C]">{row.bounces ?? 0}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[#DC2626]">{row.complaints ?? 0}</td>
                        <td className="px-3 py-2.5"><StatusBadge value={row.operationalStatus || undefined} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "notes" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#111827]">Internal Notes</h3>
              <button
                className="flex items-center gap-1.5 h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors"
                onClick={() => setNoteDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add Note
              </button>
            </div>
          </div>
          <div className="p-5">
            {notesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <FileText className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No notes</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Add internal notes about this provider</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((note: any) => (
                  <div key={note.id} className="border border-[#F1F5F9] rounded-[10px] p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-[#6B7280]">{formatDate(note.createdAt)}</span>
                      <StatusBadge value={note.isInternal ? "internal" : "external"} />
                    </div>
                    <p className="text-[13px] text-[#111827] whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">
              Activity Timeline {activity.length > 0 && `(${activity.length})`}
            </h3>
          </div>
          <div className="p-5">
            {activityLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-[#F9FAFB] rounded animate-pulse" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-10 w-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center mb-3">
                  <Clock className="h-5 w-5 text-[#9CA3AF]" />
                </div>
                <p className="text-[13px] font-medium text-[#111827]">No activity</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">Activity for this provider will be tracked here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-[8px] border border-[#F1F5F9] p-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EEF2FF]">
                      <Activity className="h-4 w-4 text-[#4F46E5]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#111827]">{formatEnum(item.action)} {formatEnum(item.entityType)}</p>
                      <p className="mt-0.5 text-[12px] text-[#6B7280]">{item.userName || "System"} - {formatDateTime(item.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outreach Dialog */}
      <Dialog open={outreachDialogOpen} onOpenChange={setOutreachDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Outreach</DialogTitle>
            <DialogDescription>Record an outreach interaction with this provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Channel</label>
              <select
                value={outreachChannel}
                onChange={(e) => setOutreachChannel(e.target.value)}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              >
                <option value="email">Email</option>
                <option value="support_ticket">Support Ticket</option>
                <option value="contact_form">Contact Form</option>
                <option value="live_chat">Live Chat</option>
                <option value="phone">Phone</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Recipient</label>
              <input
                value={outreachRecipient}
                onChange={(e) => setOutreachRecipient(e.target.value)}
                placeholder="e.g. support@example.com"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Subject</label>
              <input
                value={outreachSubject}
                onChange={(e) => setOutreachSubject(e.target.value)}
                placeholder="Subject line"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Message</label>
              <textarea
                value={outreachMessage}
                onChange={(e) => setOutreachMessage(e.target.value)}
                placeholder="Message content..."
                rows={3}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Send Result</label>
              <select
                value={outreachSendResult}
                onChange={(e) => setOutreachSendResult(e.target.value)}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              >
                <option value="drafted">Drafted</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
                <option value="replied">Replied</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Next Action</label>
              <input
                value={outreachNextAction}
                onChange={(e) => setOutreachNextAction(e.target.value)}
                placeholder="Next step..."
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Follow-up Date</label>
              <input
                type="date"
                value={outreachFollowUpDate}
                onChange={(e) => setOutreachFollowUpDate(e.target.value)}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
              onClick={() => setOutreachDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={handleSaveOutreach}
              disabled={outreachSaving}
            >
              {outreachSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin inline" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Server Dialog */}
      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Server</DialogTitle>
            <DialogDescription>Add a new server linked to this provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Name *</label>
              <input
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Server name"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Plan</label>
              <input
                value={serverPlan}
                onChange={(e) => setServerPlan(e.target.value)}
                placeholder="e.g. VPS Pro"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Location</label>
              <input
                value={serverLocation}
                onChange={(e) => setServerLocation(e.target.value)}
                placeholder="e.g. US-East"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Operating System</label>
              <input
                value={serverOs}
                onChange={(e) => setServerOs(e.target.value)}
                placeholder="e.g. Ubuntu 22.04"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Status</label>
              <select
                value={serverStatus}
                onChange={(e) => setServerStatus(e.target.value)}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Monthly Cost</label>
              <input
                type="number"
                value={serverCost}
                onChange={(e) => setServerCost(e.target.value)}
                placeholder="0.00"
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
              onClick={() => setServerDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={handleSaveServer}
              disabled={serverSaving}
            >
              {serverSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin inline" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Add an internal note about this provider.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Note *</label>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note..."
                rows={4}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="note-internal"
                checked={noteIsInternal}
                onChange={(e) => setNoteIsInternal(e.target.checked)}
                className="rounded border-[#E5E7EB]"
              />
              <label htmlFor="note-internal" className="text-[13px] font-normal text-[#374151] cursor-pointer">Internal note</label>
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB]"
              onClick={() => setNoteDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={handleSaveNote}
              disabled={noteSaving}
            >
              {noteSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin inline" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
