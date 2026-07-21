"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const optionalText = z.preprocess(
  (value) => (value == null ? "" : String(value)),
  z.string().optional()
);

const defaultText = (fallback: string) =>
  z.preprocess(
    (value) => (value == null || value === "" ? fallback : String(value)),
    z.string()
  );

const optionalBoolean = z.preprocess(
  (value) => (value == null ? false : value),
  z.boolean().optional()
);

const providerSchema = z.object({
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, "Provider name is required")
  ),
  website: optionalText,
  supportEmail: optionalText,
  salesEmail: optionalText,
  contactFormUrl: optionalText,
  country: optionalText,
  region: optionalText,
  category: optionalText,
  contactStatus: defaultText("not_contacted"),
  responseStatus: defaultText("not_sent"),
  decision: defaultText("pending"),
  dateFirstContacted: optionalText,
  lastContactDate: optionalText,
  nextFollowUpDate: optionalText,
  port25Status: defaultText("unknown"),
  ptrStatus: defaultText("unknown"),
  ipv4Available: optionalBoolean,
  ipv6Available: optionalBoolean,
  mailServerAllowed: optionalBoolean,
  sendingRestrictions: optionalText,
  dailyLimit: optionalText,
  hourlyLimit: optionalText,
  startingPrice: optionalText,
  currency: defaultText("USD"),
  billingMethod: optionalText,
  setupFee: optionalText,
  paymentMethod: optionalText,
  refundPolicy: optionalText,
  hourlyBilling: optionalBoolean,
  monthlyBilling: optionalBoolean,
  abusePolicyNotes: optionalText,
  assignedUserId: optionalText,
  notes: optionalText,
});

type ProviderFormData = z.output<typeof providerSchema>;

const textOrEmpty = (value: unknown) => (value == null ? "" : String(value));

const normalizeProviderFormData = (data: Record<string, unknown>): ProviderFormData => ({
  name: textOrEmpty(data.name),
  website: textOrEmpty(data.website),
  supportEmail: textOrEmpty(data.supportEmail),
  salesEmail: textOrEmpty(data.salesEmail),
  contactFormUrl: textOrEmpty(data.contactFormUrl),
  country: textOrEmpty(data.country),
  region: textOrEmpty(data.region),
  category: textOrEmpty(data.category),
  contactStatus: textOrEmpty(data.contactStatus) || "not_contacted",
  responseStatus: textOrEmpty(data.responseStatus) || "not_sent",
  decision: textOrEmpty(data.decision) || "pending",
  dateFirstContacted: textOrEmpty(data.dateFirstContacted),
  lastContactDate: textOrEmpty(data.lastContactDate),
  nextFollowUpDate: textOrEmpty(data.nextFollowUpDate),
  port25Status: textOrEmpty(data.port25Status) || "unknown",
  ptrStatus: textOrEmpty(data.ptrStatus) || "unknown",
  ipv4Available: Boolean(data.ipv4Available),
  ipv6Available: Boolean(data.ipv6Available),
  mailServerAllowed: Boolean(data.mailServerAllowed),
  sendingRestrictions: textOrEmpty(data.sendingRestrictions),
  dailyLimit: textOrEmpty(data.dailyLimit),
  hourlyLimit: textOrEmpty(data.hourlyLimit),
  startingPrice: textOrEmpty(data.startingPrice),
  currency: textOrEmpty(data.currency) || "USD",
  billingMethod: textOrEmpty(data.billingMethod),
  setupFee: textOrEmpty(data.setupFee),
  paymentMethod: textOrEmpty(data.paymentMethod),
  refundPolicy: textOrEmpty(data.refundPolicy),
  hourlyBilling: Boolean(data.hourlyBilling),
  monthlyBilling: Boolean(data.monthlyBilling),
  abusePolicyNotes: textOrEmpty(data.abusePolicyNotes),
  assignedUserId: textOrEmpty(data.assignedUserId),
  notes: textOrEmpty(data.notes),
});

const buildProviderPayload = (data: ProviderFormData) => {
  const payload: Record<string, unknown> = {
    ...data,
    name: data.name.trim(),
    contactStatus: data.contactStatus || "not_contacted",
    responseStatus: data.responseStatus || "not_sent",
    decision: data.decision || "pending",
    port25Status: data.port25Status || "unknown",
    ptrStatus: data.ptrStatus || "unknown",
    currency: data.currency || "USD",
  };

  const nullableTextFields = [
    "website",
    "supportEmail",
    "salesEmail",
    "contactFormUrl",
    "country",
    "region",
    "category",
    "dateFirstContacted",
    "lastContactDate",
    "nextFollowUpDate",
    "sendingRestrictions",
    "billingMethod",
    "paymentMethod",
    "refundPolicy",
    "abusePolicyNotes",
    "assignedUserId",
    "notes",
  ];

  for (const field of nullableTextFields) {
    const value = payload[field];
    payload[field] = typeof value === "string" && value.trim() === "" ? null : value;
  }

  for (const field of ["dailyLimit", "hourlyLimit", "startingPrice", "setupFee"]) {
    const value = String(payload[field] ?? "").trim();
    payload[field] = value ? Number(value) : null;
  }

  return payload;
};

export default function NewProviderPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl space-y-6"><div className="h-[600px] bg-[#F1F5F9] rounded-[10px] animate-pulse" /></div>}>
      <NewProviderForm />
    </Suspense>
  );
}

function NewProviderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const [isSaving, setIsSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema) as Resolver<ProviderFormData>,
    defaultValues: {
      name: "",
      website: "",
      supportEmail: "",
      salesEmail: "",
      contactFormUrl: "",
      country: "",
      region: "",
      category: "",
      contactStatus: "not_contacted",
      responseStatus: "not_sent",
      decision: "pending",
      port25Status: "unknown",
      ptrStatus: "unknown",
      ipv4Available: false,
      ipv6Available: false,
      mailServerAllowed: false,
      currency: "USD",
      notes: "",
    },
  });

  useEffect(() => {
    fetch("/api/users?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setUsers(json.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;

    setLoadingEdit(true);
    fetch(`/api/providers/${editId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load provider");
        return res.json();
      })
      .then((data: Record<string, unknown>) => {
        const dateFields = ["dateFirstContacted", "lastContactDate", "nextFollowUpDate"];
        const formatted: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(data)) {
          if (dateFields.includes(key) && val && typeof val === "string") {
            formatted[key] = val.split("T")[0];
          } else {
            formatted[key] = val;
          }
        }
        form.reset(normalizeProviderFormData(formatted));
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load provider");
      })
      .finally(() => {
        setLoadingEdit(false);
      });
  }, [editId, form]);

  const onSubmit = async (data: ProviderFormData) => {
    setIsSaving(true);
    try {
      const url = isEditMode ? `/api/providers/${editId}` : "/api/providers";
      const method = isEditMode ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProviderPayload(data)),
      });
      if (!res.ok) throw new Error(isEditMode ? "Failed to update provider" : "Failed to create provider");
      toast.success(isEditMode ? "Provider updated successfully" : "Provider created successfully");
      router.push("/providers");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEditMode ? "Failed to update provider" : "Failed to create provider");
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingEdit) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-[600px] bg-[#F1F5F9] rounded-[10px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/providers" className="flex items-center gap-1.5 text-[13px] text-[#6B7280] hover:text-[#4F46E5] transition-colors mb-5">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to providers
      </Link>

      <div>
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">{isEditMode ? "Edit Provider" : "New Provider"}</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">
          {isEditMode ? "Update provider details" : "Add a new VPS or cloud provider to your pipeline"}
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Basic Information</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Provider Name<span className="text-red-500 ml-0.5">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Vultr"
                  {...form.register("name")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
                {form.formState.errors.name && (
                  <p className="text-[12px] text-red-500">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Website</label>
                <input
                  type="text"
                  placeholder="https://..."
                  {...form.register("website")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
                {form.formState.errors.website && (
                  <p className="text-[12px] text-red-500">{form.formState.errors.website.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Support Email</label>
                <input
                  type="text"
                  placeholder="support@..."
                  {...form.register("supportEmail")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
                {form.formState.errors.supportEmail && (
                  <p className="text-[12px] text-red-500">{form.formState.errors.supportEmail.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Sales Email</label>
                <input
                  type="text"
                  placeholder="sales@..."
                  {...form.register("salesEmail")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
                {form.formState.errors.salesEmail && (
                  <p className="text-[12px] text-red-500">{form.formState.errors.salesEmail.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Country</label>
                <input
                  type="text"
                  placeholder="e.g. United States"
                  {...form.register("country")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Category</label>
                <select
                  value={form.watch("category") || ""}
                  onChange={(e) => { if (e.target.value) form.setValue("category", e.target.value) }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="">Select...</option>
                  <option value="vps">VPS Provider</option>
                  <option value="cloud">Cloud Provider</option>
                  <option value="dedicated">Dedicated Server</option>
                  <option value="bare_metal">Bare Metal</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Contact Form URL</label>
              <input
                type="text"
                placeholder="https://..."
                {...form.register("contactFormUrl")}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
              />
              {form.formState.errors.contactFormUrl && (
                <p className="text-[12px] text-red-500">{form.formState.errors.contactFormUrl.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Status</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Contact Status</label>
                <select
                  value={form.watch("contactStatus") || ""}
                  onChange={(e) => { if (e.target.value) form.setValue("contactStatus", e.target.value) }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="not_contacted">Not Contacted</option>
                  <option value="ready_to_contact">Ready to Contact</option>
                  <option value="contacted">Contacted</option>
                  <option value="follow_up_due">Follow-up Due</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Response Status</label>
                <select
                  value={form.watch("responseStatus") || ""}
                  onChange={(e) => { if (e.target.value) form.setValue("responseStatus", e.target.value) }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="not_sent">Not Sent</option>
                  <option value="no_response">No Response</option>
                  <option value="replied">Replied</option>
                  <option value="needs_follow_up">Needs Follow-up</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Decision</label>
                <select
                  value={form.watch("decision") || ""}
                  onChange={(e) => { if (e.target.value) form.setValue("decision", e.target.value) }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="denied">Denied</option>
                  <option value="prohibited_sending">Prohibited</option>
                  <option value="not_suitable">Not Suitable</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Infrastructure</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Port 25 Status</label>
                <select
                  value={form.watch("port25Status") || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    form.setValue("port25Status", value);
                    if (value === "available") form.setValue("mailServerAllowed", true);
                    if (value === "blocked") form.setValue("mailServerAllowed", false);
                  }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="available">Available</option>
                  <option value="blocked">Blocked</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">PTR / rDNS</label>
                <select
                  value={form.watch("ptrStatus") || ""}
                  onChange={(e) => { if (e.target.value) form.setValue("ptrStatus", e.target.value) }}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="configured">Configured</option>
                  <option value="not_configured">Not Configured</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Starting Price</label>
                <input
                  type="text"
                  placeholder="0.00"
                  {...form.register("startingPrice")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-[13px] text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.watch("ipv4Available")}
                  onChange={(e) => form.setValue("ipv4Available", e.target.checked)}
                  className="h-4 w-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
                IPv4 Available
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.watch("ipv6Available")}
                  onChange={(e) => form.setValue("ipv6Available", e.target.checked)}
                  className="h-4 w-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
                IPv6 Available
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#374151] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.watch("mailServerAllowed")}
                  onChange={(e) => form.setValue("mailServerAllowed", e.target.checked)}
                  className="h-4 w-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]/20"
                />
                Mail Server Allowed
              </label>
            </div>
            <p className="text-[12px] text-[#6B7280]">
              Mail policy is enabled automatically when Port 25 is marked available.
            </p>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Restrictions</label>
              <textarea
                placeholder="Any provider restrictions or policy notes..."
                {...form.register("sendingRestrictions")}
                rows={2}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Limits &amp; Commercial</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Daily Limit</label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  {...form.register("dailyLimit")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Hourly Limit</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  {...form.register("hourlyLimit")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Billing Method</label>
                <select
                  value={form.watch("billingMethod") || ""}
                  onChange={(e) => form.setValue("billingMethod", e.target.value || undefined)}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                >
                  <option value="">Select...</option>
                  <option value="hourly">Hourly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annually">Annually</option>
                  <option value="one_time">One Time</option>
                  <option value="free">Free</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Setup Fee</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...form.register("setupFee")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Payment Method</label>
                <input
                  type="text"
                  placeholder="e.g. PayPal, Crypto, Wire"
                  {...form.register("paymentMethod")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Refund Policy</label>
                <input
                  type="text"
                  placeholder="e.g. 30-day refund"
                  {...form.register("refundPolicy")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.watch("hourlyBilling") || false}
                  onChange={(e) => form.setValue("hourlyBilling", e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#D1D5DB]"
                />
                <span className="text-[13px] text-[#374151]">Hourly Billing</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.watch("monthlyBilling") || false}
                  onChange={(e) => form.setValue("monthlyBilling", e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[#D1D5DB]"
                />
                <span className="text-[13px] text-[#374151]">Monthly Billing</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Timeline</h3>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">First Contacted</label>
                <input
                  type="date"
                  {...form.register("dateFirstContacted")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Last Contact Date</label>
                <input
                  type="date"
                  {...form.register("lastContactDate")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Next Follow-up</label>
                <input
                  type="date"
                  {...form.register("nextFollowUpDate")}
                  className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Assignment</h3>
          </div>
          <div className="p-5">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Assigned Owner</label>
              <select
                value={form.watch("assignedUserId") || ""}
                onChange={(e) => form.setValue("assignedUserId", e.target.value || undefined)}
                className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-[13px] font-semibold text-[#111827]">Notes</h3>
          </div>
          <div className="p-5 space-y-4">
            <textarea
              placeholder="Internal notes about this provider..."
              {...form.register("notes")}
              rows={3}
              className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
            />
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[#374151]">Abuse Policy Notes</label>
              <textarea
                placeholder="Notes about abuse policies, content restrictions, TOS limits..."
                {...form.register("abusePolicyNotes")}
                rows={3}
                className="flex w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/providers"
            className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors inline-flex items-center disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-2" />
                {isEditMode ? "Save Changes" : "Create Provider"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
