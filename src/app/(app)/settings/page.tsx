"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Settings,
  Save,
  Bell,
  Shield,
  Bot,
  MessageSquare,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Download,
  Trash2,
  Plus,
  Upload,
} from "lucide-react";
import { isMxToolboxApiKey, MXTOOLBOX_API_KEY_HELP } from "@/lib/mxtoolbox";

interface MxToolboxAccount {
  id: string;
  label: string;
  apiKey: string;
  assignedUserId: string | null;
  enabled: boolean;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface SettingsData {
  companyName?: string;
  currency?: string;
  timezone?: string;
  dateFormat?: string;
  bounceRateWarning?: number;
  bounceRateCritical?: number;
  complaintRateWarning?: number;
  complaintRateCritical?: number;
  requirePassword?: boolean;
  publicRegistration?: boolean;
  auditLogging?: boolean;
  openrouter_api_key?: string;
  openrouter_model?: string;
  telegram_bot_token?: string;
  telegram_webhook_url?: string;
  telegram_alert_chat_id?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  mxtoolbox_api_key?: string;
  mxtoolbox_accounts?: MxToolboxAccount[];
}

function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "..." + key.slice(-4);
}

function maskToken(token: string | undefined): string {
  if (!token) return "";
  const parts = token.split(":");
  if (parts.length === 2) {
    const first = parts[0].slice(0, 6);
    const second = parts[1].slice(-4);
    return `${first}:...${second}`;
  }
  if (token.length <= 10) return "****";
  return token.slice(0, 6) + "..." + token.slice(-4);
}

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "thresholds", label: "Statistics Thresholds", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "ai", label: "AI Agent", icon: Bot },
  { id: "telegram", label: "Telegram Bot", icon: MessageSquare },
  { id: "smtp", label: "SMTP", icon: Mail },
  { id: "ip", label: "IP Intelligence", icon: Shield },
  { id: "backup", label: "Backup", icon: Download },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingIp, setSavingIp] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);

  const [testingAI, setTestingAI] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [sendingTestMsg, setSendingTestMsg] = useState(false);
  const [sendingAuditTest, setSendingAuditTest] = useState(false);

  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showMxToolboxKey, setShowMxToolboxKey] = useState(false);

  const [inputOpenRouterKey, setInputOpenRouterKey] = useState("");
  const [inputTelegramToken, setInputTelegramToken] = useState("");
  const [inputSmtpPassword, setInputSmtpPassword] = useState("");
  const [inputMxToolboxKey, setInputMxToolboxKey] = useState("");
  const [inputMxToolboxLabel, setInputMxToolboxLabel] = useState("");
  const [inputMxToolboxUserId, setInputMxToolboxUserId] = useState("");
  const [mxToolboxAccounts, setMxToolboxAccounts] = useState<MxToolboxAccount[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [testChatId, setTestChatId] = useState("");

  const [webhookBaseUrl, setWebhookBaseUrl] = useState("");

  useEffect(() => {
    setWebhookBaseUrl(`${window.location.origin}/api/webhooks/telegram`);
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const json = await res.json();
      setSettings({
        companyName: json.companyName || "CloudOps",
        currency: json.currency || "USD",
        timezone: json.timezone || "utc",
        dateFormat: json.dateFormat || "mdy",
        bounceRateWarning: json.bounceRateWarning ?? 5,
        bounceRateCritical: json.bounceRateCritical ?? 10,
        complaintRateWarning: json.complaintRateWarning ?? 0.1,
        complaintRateCritical: json.complaintRateCritical ?? 0.5,
        requirePassword: json.requirePassword ?? true,
        publicRegistration: json.publicRegistration ?? false,
        auditLogging: json.auditLogging ?? true,
        openrouter_api_key: json.openrouter_api_key || "",
        openrouter_model: json.openrouter_model || "openai/gpt-4o-mini",
        telegram_bot_token: json.telegram_bot_token || "",
        telegram_webhook_url: json.telegram_webhook_url || "",
        telegram_alert_chat_id: json.telegram_alert_chat_id || "",
        smtp_host: json.smtp_host || "",
        smtp_port: json.smtp_port || "587",
        smtp_secure: json.smtp_secure ?? false,
        smtp_user: json.smtp_user || "",
        smtp_password: json.smtp_password || "",
        smtp_from_email: json.smtp_from_email || "",
        smtp_from_name: json.smtp_from_name || "ServerOps CRM",
        mxtoolbox_api_key: json.mxtoolbox_api_key || "",
        mxtoolbox_accounts: Array.isArray(json.mxtoolbox_accounts) ? json.mxtoolbox_accounts : [],
      });
      setMxToolboxAccounts(Array.isArray(json.mxtoolbox_accounts) ? json.mxtoolbox_accounts : []);
      const usersRes = await fetch("/api/users?all=1");
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        setUsers(usersJson.data ?? []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function update(key: keyof SettingsData, value: any) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function buildMxToolboxDraft(): MxToolboxAccount | null {
    const apiKey = inputMxToolboxKey.trim();
    if (!apiKey) return null;
    if (!isMxToolboxApiKey(apiKey)) {
      toast.error("Invalid MxToolbox API key", {
        description: MXTOOLBOX_API_KEY_HELP,
      });
      return null;
    }
    if (mxToolboxAccounts.some((account) => account.apiKey === apiKey)) {
      toast.error("This MxToolbox API key is already in the account list");
      return null;
    }
    return {
      id: crypto.randomUUID(),
      label: inputMxToolboxLabel.trim() || `MxToolbox Account ${mxToolboxAccounts.length + 1}`,
      apiKey,
      assignedUserId: inputMxToolboxUserId || null,
      enabled: true,
    };
  }

  function clearMxToolboxDraft() {
    setInputMxToolboxKey("");
    setInputMxToolboxLabel("");
    setInputMxToolboxUserId("");
    setShowMxToolboxKey(false);
  }

  function handleAddMxToolboxAccount() {
    const account = buildMxToolboxDraft();
    if (!account) return;
    setMxToolboxAccounts((current) => [...current, account]);
    clearMxToolboxDraft();
    toast.success("MxToolbox account added", {
      description: "Click Save MxToolbox Accounts to store the updated account list.",
    });
  }

  async function handleSave(section: string) {
    let setSaving: (v: boolean) => void;
    let payload: Record<string, any> = {};

    switch (section) {
      case "general":
        setSaving = setSavingGeneral;
        payload = {
          companyName: settings.companyName,
          currency: settings.currency,
          timezone: settings.timezone,
          dateFormat: settings.dateFormat,
        };
        break;
      case "thresholds":
        setSaving = setSavingThresholds;
        payload = {
          bounceRateWarning: settings.bounceRateWarning,
          bounceRateCritical: settings.bounceRateCritical,
          complaintRateWarning: settings.complaintRateWarning,
          complaintRateCritical: settings.complaintRateCritical,
        };
        break;
      case "security":
        setSaving = setSavingSecurity;
        payload = {
          requirePassword: settings.requirePassword,
          publicRegistration: settings.publicRegistration,
          auditLogging: settings.auditLogging,
        };
        break;
      case "ai":
        setSaving = setSavingAI;
        if (inputOpenRouterKey) {
          payload.openrouter_api_key = inputOpenRouterKey;
        }
        payload.openrouter_model = settings.openrouter_model;
        break;
      case "telegram":
        setSaving = setSavingTelegram;
        if (inputTelegramToken) {
          payload.telegram_bot_token = inputTelegramToken;
        }
        payload.telegram_webhook_url = settings.telegram_webhook_url;
        payload.telegram_alert_chat_id = settings.telegram_alert_chat_id;
        break;
      case "smtp":
        setSaving = setSavingSmtp;
        payload.smtp_host = settings.smtp_host;
        payload.smtp_port = settings.smtp_port;
        payload.smtp_secure = settings.smtp_secure;
        payload.smtp_user = settings.smtp_user;
        payload.smtp_from_email = settings.smtp_from_email;
        payload.smtp_from_name = settings.smtp_from_name;
        if (inputSmtpPassword) {
          payload.smtp_password = inputSmtpPassword;
        }
        break;
      case "ip":
        setSaving = setSavingIp;
        let accountsToSave = mxToolboxAccounts;
        if (inputMxToolboxKey) {
          const draft = buildMxToolboxDraft();
          if (!draft) return;
          accountsToSave = [...mxToolboxAccounts, draft];
          setMxToolboxAccounts(accountsToSave);
        }
        payload.mxtoolbox_accounts = accountsToSave;
        break;
      default:
        return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save settings");

      const json = await res.json();
      setSettings((prev) => ({
        ...prev,
        ...json,
      }));

      if (section === "ai" && inputOpenRouterKey) {
        setInputOpenRouterKey("");
        setShowOpenRouterKey(false);
      }
      if (section === "telegram" && inputTelegramToken) {
        setInputTelegramToken("");
        setShowTelegramToken(false);
      }
      if (section === "smtp" && inputSmtpPassword) {
        setInputSmtpPassword("");
        setShowSmtpPassword(false);
      }
      if (section === "ip" && inputMxToolboxKey) {
        clearMxToolboxDraft();
      }

      toast.success("Settings saved", {
        description: section === "ai"
          ? `API key saved: ${maskApiKey(payload.openrouter_api_key)}`
          : section === "telegram" && payload.telegram_bot_token
          ? `Token saved: ${maskToken(payload.telegram_bot_token)}`
          : section === "smtp"
          ? "SMTP settings saved for system emails."
          : section === "ip"
          ? `${payload.mxtoolbox_accounts?.length || 0} MxToolbox account${(payload.mxtoolbox_accounts?.length || 0) === 1 ? "" : "s"} saved.`
          : `${section.charAt(0).toUpperCase() + section.slice(1)} settings updated successfully.`,
      });
    } catch (err: any) {
      setError(err.message);
      toast.error("Failed to save settings", { description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function testAIConnection() {
    setTestingAI(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("AI connection successful", {
        description: "The OpenRouter API connection is working.",
      });
    } catch (err: any) {
      toast.error("AI connection failed", {
        description: err.message || "Could not connect to the AI endpoint.",
      });
    } finally {
      setTestingAI(false);
    }
  }

  async function setTelegramWebhook() {
    setSettingWebhook(true);
    try {
      const res = await fetch("/api/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookBaseUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success("Webhook set successfully", {
        description: "Telegram webhook has been configured.",
      });
    } catch (err: any) {
      toast.error("Failed to set webhook", {
        description: err.message || "Could not configure the Telegram webhook.",
      });
    } finally {
      setSettingWebhook(false);
    }
  }

  async function sendTestTelegramMessage() {
    setSendingTestMsg(true);
    try {
      const res = await fetch("/api/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test",
          chat_id: testChatId || settings.telegram_alert_chat_id || undefined,
          text: "Test message from CloudOps CRM",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success("Test message sent", {
        description: "Check your Telegram for the test message.",
      });
    } catch (err: any) {
      const message = String(err.message || "");
      toast.error("Failed to send test message", {
        description: message.includes("chat not found")
          ? "Telegram cannot find this chat. Open the bot, send /start then /chatid, and use the returned Chat ID."
          : message,
      });
    } finally {
      setSendingTestMsg(false);
    }
  }

  async function sendAuditTestTelegramMessage() {
    if (!settings.telegram_alert_chat_id && !testChatId) {
      toast.error("Alert Chat ID is required", {
        description: "Enter the chat ID returned by /chatid, then run the audit alert test again.",
      });
      return;
    }
    setSendingAuditTest(true);
    try {
      const res = await fetch("/api/webhooks/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_audit_test",
          chat_id: settings.telegram_alert_chat_id || testChatId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success("Audit alert test sent", {
        description: "This uses the same path as login and create/delete alerts.",
      });
    } catch (err: any) {
      toast.error("Failed to send audit alert test", {
        description: err.message || "Could not send the audit alert test.",
      });
    } finally {
      setSendingAuditTest(false);
    }
  }

  async function restoreBackup(file: File | null) {
    if (!file) return;
    if (!window.confirm("Restore this backup file? Existing records with the same IDs will be updated, and unrelated current records will remain.")) return;

    setRestoringBackup(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Failed to restore backup");
      toast.success("Backup restored", {
        description: `${Object.values(result.restored || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0)} records processed.`,
      });
      fetchSettings();
    } catch (err: any) {
      toast.error("Backup restore failed", { description: err.message || "Invalid backup file" });
    } finally {
      setRestoringBackup(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Settings</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Configure your CRM, integrations, and preferences</p>
        </div>
        <div className="flex gap-6">
          <div className="h-[250px] w-48 bg-[#F1F5F9] rounded-[10px] animate-pulse" />
          <div className="flex-1 space-y-4">
            <div className="h-5 w-32 bg-[#F1F5F9] rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><div className="h-4 w-20 bg-[#F1F5F9] rounded animate-pulse" /><div className="h-[34px] w-full bg-[#F1F5F9] rounded-[7px] animate-pulse" /></div>
              <div className="space-y-2"><div className="h-4 w-20 bg-[#F1F5F9] rounded animate-pulse" /><div className="h-[34px] w-full bg-[#F1F5F9] rounded-[7px] animate-pulse" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><div className="h-4 w-20 bg-[#F1F5F9] rounded animate-pulse" /><div className="h-[34px] w-full bg-[#F1F5F9] rounded-[7px] animate-pulse" /></div>
              <div className="space-y-2"><div className="h-4 w-20 bg-[#F1F5F9] rounded animate-pulse" /><div className="h-[34px] w-full bg-[#F1F5F9] rounded-[7px] animate-pulse" /></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Settings</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">Configure your CRM, integrations, and preferences</p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-56 shrink-0 flex flex-col gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium rounded-[7px] transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#EEF2FF] text-[#4F46E5]"
                    : "text-[#6B7280] hover:bg-[#F8FAFC]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0">
          {/* General Tab */}
          {activeTab === "general" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Settings className="h-4 w-4" /> General
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Basic application configuration</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Company Name</label>
                    <input
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.companyName || ""}
                      onChange={(e) => update("companyName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Default Currency</label>
                    <select
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.currency || "USD"}
                      onChange={(e) => update("currency", e.target.value)}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Timezone</label>
                    <select
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.timezone || "utc"}
                      onChange={(e) => update("timezone", e.target.value)}
                    >
                      <option value="utc">UTC</option>
                      <option value="est">Eastern (EST)</option>
                      <option value="pst">Pacific (PST)</option>
                      <option value="cet">Central European (CET)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Date Format</label>
                    <select
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.dateFormat || "mdy"}
                      onChange={(e) => update("dateFormat", e.target.value)}
                    >
                      <option value="mdy">MM/DD/YYYY</option>
                      <option value="dmy">DD/MM/YYYY</option>
                      <option value="ymd">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
                <button onClick={() => handleSave("general")} disabled={savingGeneral} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                  {savingGeneral ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                  {savingGeneral ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* Statistics Thresholds Tab */}
          {activeTab === "thresholds" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Statistics Thresholds
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Configure warning thresholds for server statistics</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Bounce Rate Warning (%)</label>
                    <input
                      type="number"
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.bounceRateWarning ?? ""}
                      onChange={(e) => update("bounceRateWarning", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Bounce Rate Critical (%)</label>
                    <input
                      type="number"
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.bounceRateCritical ?? ""}
                      onChange={(e) => update("bounceRateCritical", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Complaint Rate Warning (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.complaintRateWarning ?? ""}
                      onChange={(e) => update("complaintRateWarning", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">Complaint Rate Critical (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      value={settings.complaintRateCritical ?? ""}
                      onChange={(e) => update("complaintRateCritical", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <button onClick={() => handleSave("thresholds")} disabled={savingThresholds} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                  {savingThresholds ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                  {savingThresholds ? "Saving..." : "Save Thresholds"}
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Security
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Authentication and security settings</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#111827]">Require password for login</p>
                    <p className="text-[13px] text-[#6B7280]">Users must authenticate with email and password</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.requirePassword ?? true}
                    onClick={() => update("requirePassword", !(settings.requirePassword ?? true))}
                    className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.requirePassword ?? true ? "bg-[#4F46E5]" : "bg-[#D1D5DB]"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${
                      (settings.requirePassword ?? true) ? "translate-x-[18px]" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <div className="border-t border-[#E5E7EB]" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#111827]">Public registration</p>
                    <p className="text-[13px] text-[#6B7280]">Allow anyone to create an account</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.publicRegistration ?? false}
                    onClick={() => update("publicRegistration", !(settings.publicRegistration ?? false))}
                    className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.publicRegistration ?? false ? "bg-[#4F46E5]" : "bg-[#D1D5DB]"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${
                      (settings.publicRegistration ?? false) ? "translate-x-[18px]" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <div className="border-t border-[#E5E7EB]" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[#111827]">Audit logging</p>
                    <p className="text-[13px] text-[#6B7280]">Record all sensitive actions</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.auditLogging ?? true}
                    onClick={() => update("auditLogging", !(settings.auditLogging ?? true))}
                    className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.auditLogging ?? true ? "bg-[#4F46E5]" : "bg-[#D1D5DB]"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow transform transition-transform ${
                      (settings.auditLogging ?? true) ? "translate-x-[18px]" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <button onClick={() => handleSave("security")} disabled={savingSecurity} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                  {savingSecurity ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                  {savingSecurity ? "Saving..." : "Save Security Settings"}
                </button>
              </div>
            </div>
          )}

          {/* AI Agent Tab */}
          {activeTab === "ai" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Bot className="h-4 w-4" /> AI Agent
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Configure OpenRouter API for AI-powered features</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">OpenRouter API Key</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showOpenRouterKey ? "text" : "password"}
                        className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                        placeholder={settings.openrouter_api_key ? maskApiKey(settings.openrouter_api_key) : "sk-or-..."}
                        value={inputOpenRouterKey}
                        onChange={(e) => setInputOpenRouterKey(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]"
                        onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                      >
                        {showOpenRouterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {settings.openrouter_api_key && (
                    <p className="text-[13px] text-[#6B7280]">
                      Current key: {maskApiKey(settings.openrouter_api_key)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">OpenRouter Model</label>
                  <input
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                    value={settings.openrouter_model || "openai/gpt-4o-mini"}
                    onChange={(e) => update("openrouter_model", e.target.value)}
                  />
                  <p className="text-[13px] text-[#6B7280]">
                    Default: openai/gpt-4o-mini
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleSave("ai")} disabled={savingAI} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                    {savingAI ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                    {savingAI ? "Saving..." : "Save AI Settings"}
                  </button>
                  <button
                    onClick={testAIConnection}
                    disabled={testingAI}
                    className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
                  >
                    {testingAI ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : null}
                    {testingAI ? "Testing..." : "Test Connection"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Telegram Bot Tab */}
          {activeTab === "telegram" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Telegram Bot
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Configure Telegram bot integration for notifications</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">Bot Token</label>
                  <div className="relative">
                    <input
                      type={showTelegramToken ? "text" : "password"}
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder={settings.telegram_bot_token ? maskToken(settings.telegram_bot_token) : "123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"}
                      value={inputTelegramToken}
                      onChange={(e) => setInputTelegramToken(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                    >
                      {showTelegramToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {settings.telegram_bot_token && (
                    <p className="text-[13px] text-[#6B7280]">
                      Current token: {maskToken(settings.telegram_bot_token)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">Webhook URL</label>
                  <input
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-mono text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                    value={webhookBaseUrl}
                    readOnly
                  />
                  <p className="text-[13px] text-[#6B7280] flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Auto-generated from your application URL
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">Test Chat ID (optional)</label>
                  <input
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                    placeholder="e.g. 123456789 or @channelname"
                    value={testChatId}
                    onChange={(e) => setTestChatId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">Alert Chat ID</label>
                  <input
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                    placeholder="Chat/group/channel that receives login and create/delete alerts"
                    value={settings.telegram_alert_chat_id || ""}
                    onChange={(e) => update("telegram_alert_chat_id", e.target.value)}
                  />
                  <p className="text-[13px] text-[#6B7280]">
                    Used for user logins and user/provider/server/IP create-delete alerts. Message the bot first, then send /chatid and copy the returned ID here.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleSave("telegram")} disabled={savingTelegram} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                    {savingTelegram ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                    {savingTelegram ? "Saving..." : "Save Telegram Settings"}
                  </button>
                  <button
                    onClick={setTelegramWebhook}
                    disabled={settingWebhook}
                    className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
                  >
                    {settingWebhook ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <ExternalLink className="h-3.5 w-3.5 mr-2 inline" />}
                    {settingWebhook ? "Setting..." : "Set Webhook"}
                  </button>
                  <button
                    onClick={sendTestTelegramMessage}
                    disabled={sendingTestMsg}
                    className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
                  >
                    {sendingTestMsg ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <MessageSquare className="h-3.5 w-3.5 mr-2 inline" />}
                    {sendingTestMsg ? "Sending..." : "Send Test Message"}
                  </button>
                  <button
                    onClick={sendAuditTestTelegramMessage}
                    disabled={sendingAuditTest}
                    className="h-[34px] rounded-[7px] border border-[#C7D2FE] bg-[#EEF2FF] px-3 text-[13px] font-medium text-[#4338CA] hover:bg-[#E0E7FF] transition-colors disabled:opacity-50"
                  >
                    {sendingAuditTest ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Bell className="h-3.5 w-3.5 mr-2 inline" />}
                    {sendingAuditTest ? "Sending..." : "Send Audit Alert Test"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SMTP Tab */}
          {activeTab === "smtp" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Mail className="h-4 w-4" /> SMTP
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Configure outgoing system email for password and account notifications</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">SMTP Host</label>
                    <input
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="smtp.gmail.com"
                      value={settings.smtp_host || ""}
                      onChange={(e) => update("smtp_host", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">SMTP Port</label>
                    <input
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="587"
                      value={settings.smtp_port || "587"}
                      onChange={(e) => update("smtp_port", e.target.value)}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[13px] font-medium text-[#374151]">
                  <input
                    type="checkbox"
                    checked={!!settings.smtp_secure}
                    onChange={(e) => update("smtp_secure", e.target.checked)}
                    className="h-4 w-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]/20"
                  />
                  Use secure SMTP connection
                </label>

                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">SMTP Username</label>
                    <input
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="smtp-user@example.com"
                      value={settings.smtp_user || ""}
                      onChange={(e) => update("smtp_user", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">SMTP Password</label>
                    <div className="relative">
                      <input
                        type={showSmtpPassword ? "text" : "password"}
                        className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                        placeholder={settings.smtp_password ? "************" : "SMTP password"}
                        value={inputSmtpPassword}
                        onChange={(e) => setInputSmtpPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                      >
                        {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {settings.smtp_password && (
                      <p className="text-[13px] text-[#6B7280]">Current password saved</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">From Email</label>
                    <input
                      type="email"
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="no-reply@example.com"
                      value={settings.smtp_from_email || ""}
                      onChange={(e) => update("smtp_from_email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[#374151]">From Name</label>
                    <input
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="ServerOps CRM"
                      value={settings.smtp_from_name || ""}
                      onChange={(e) => update("smtp_from_name", e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-[7px] bg-[#F9FAFB] border border-[#E5E7EB] p-3 text-[13px] text-[#6B7280] leading-relaxed">
                  These SMTP settings are for outgoing system email such as password, username, and account-change notifications. Provider conversation IMAP accounts are configured from the Email Inbox page.
                </div>

                <button onClick={() => handleSave("smtp")} disabled={savingSmtp} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                  {savingSmtp ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                  {savingSmtp ? "Saving..." : "Save SMTP Settings"}
                </button>
              </div>
            </div>
          )}

          {/* IP Intelligence Tab */}
          {activeTab === "ip" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Shield className="h-4 w-4" /> IP Intelligence
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Configure blacklist checks and IP reputation lookups</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold uppercase text-[#6B7280]">MxToolbox Accounts</p>
                      <p className="mt-0.5 text-[12px] text-[#6B7280]">{mxToolboxAccounts.length} account{mxToolboxAccounts.length === 1 ? "" : "s"} configured</p>
                    </div>
                    <span className="rounded-[5px] bg-white px-2 py-1 text-[11px] font-semibold text-[#4F46E5] ring-1 ring-[#E5E7EB]">
                      Per-user keys
                    </span>
                  </div>
                  {mxToolboxAccounts.length === 0 ? (
                    <div className="rounded-[8px] border border-dashed border-[#CBD5E1] bg-white p-4 text-center">
                      <p className="text-[13px] font-semibold text-[#111827]">No MxToolbox accounts yet</p>
                      <p className="mt-1 text-[12px] text-[#6B7280]">Add one account below, then add more accounts for other users as needed.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mxToolboxAccounts.map((account) => (
                        <div key={account.id} className="grid gap-2 rounded-[8px] border border-[#E5E7EB] bg-white p-3 lg:grid-cols-[1fr_180px_90px_80px] lg:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{account.label}</p>
                            <p className="truncate text-[12px] text-[#6B7280]">{maskApiKey(account.apiKey)}</p>
                            {!isMxToolboxApiKey(account.apiKey) && (
                              <p className="mt-1 text-[11px] font-semibold text-[#DC2626]">
                                Invalid key: replace this account with a UUID API key
                              </p>
                            )}
                          </div>
                          <select
                            value={account.assignedUserId || ""}
                            onChange={(e) => {
                              const assignedUserId = e.target.value || null;
                              setMxToolboxAccounts((current) =>
                                current.map((item) => item.id === account.id ? { ...item, assignedUserId } : item)
                              );
                            }}
                            className="h-[32px] rounded-[7px] border border-[#E5E7EB] bg-white px-2 text-[12px] font-medium text-[#374151]"
                          >
                            <option value="">Unassigned</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-[12px] font-semibold text-[#374151]">
                            <input
                              type="checkbox"
                              checked={account.enabled}
                              onChange={(e) => {
                                const enabled = e.target.checked;
                                setMxToolboxAccounts((current) =>
                                  current.map((item) => item.id === account.id ? { ...item, enabled } : item)
                                );
                              }}
                              className="h-4 w-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]/20"
                            />
                            Enabled
                          </label>
                          <button
                            type="button"
                            onClick={() => setMxToolboxAccounts((current) => current.filter((item) => item.id !== account.id))}
                            className="flex h-[30px] items-center justify-center gap-1 rounded-[7px] border border-[#FECACA] px-2 text-[12px] font-semibold text-[#DC2626]"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[13px] font-medium text-[#374151]">Add MxToolbox Account</label>
                  <input
                    className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                    placeholder="Account label, e.g. Marouane MxToolbox"
                    value={inputMxToolboxLabel}
                    onChange={(e) => setInputMxToolboxLabel(e.target.value)}
                  />
                  <div className="relative">
                    <input
                      type={showMxToolboxKey ? "text" : "password"}
                      className="flex h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 pr-9 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                      placeholder="API key UUID: 00000000-0000-0000-0000-000000000000"
                      value={inputMxToolboxKey}
                      onChange={(e) => setInputMxToolboxKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#111827]"
                      onClick={() => setShowMxToolboxKey(!showMxToolboxKey)}
                    >
                      {showMxToolboxKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[12px] leading-relaxed text-[#6B7280]">
                    {MXTOOLBOX_API_KEY_HELP} Blacklist is a Network lookup; free MxToolbox plans currently have no Network lookup quota.
                  </p>
                  <select
                    value={inputMxToolboxUserId}
                    onChange={(e) => setInputMxToolboxUserId(e.target.value)}
                    className="h-[34px] w-full rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#374151]"
                  >
                    <option value="">Assign to user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                    ))}
                  </select>
                  {settings.mxtoolbox_api_key && (
                    <p className="text-[13px] text-[#6B7280]">Legacy key still available as fallback: {maskApiKey(settings.mxtoolbox_api_key)}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleAddMxToolboxAccount}
                    disabled={!inputMxToolboxKey.trim()}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-[7px] border border-[#4F46E5] bg-white px-3.5 text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:text-[#9CA3AF]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Account To List
                  </button>
                </div>

                <div className="rounded-[7px] bg-[#F9FAFB] border border-[#E5E7EB] p-3 text-[13px] text-[#6B7280] leading-relaxed">
                  Blacklist checks use the enabled MxToolbox API key assigned to the server user. When a key is invalid, its Network quota is unavailable, or MxToolbox rejects the lookup, the app reports the exact API and quota response and completes the check with DNSBL fallback.
                </div>

                <button onClick={() => handleSave("ip")} disabled={savingIp} className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors disabled:opacity-50">
                  {savingIp ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin inline" /> : <Save className="h-3.5 w-3.5 mr-2 inline" />}
                  {savingIp ? "Saving..." : "Save MxToolbox Accounts"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5E7EB]">
                <h3 className="text-[13px] font-semibold text-[#111827] flex items-center gap-2">
                  <Download className="h-4 w-4" /> Manual Backup
                </h3>
                <p className="text-[13px] text-[#6B7280] mt-0.5">Download or restore a JSON backup of CRM data, settings, users, providers, servers, IPs, statistics, tasks, and notes.</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <p className="text-[13px] font-semibold text-[#111827]">Download Backup</p>
                  <p className="mt-1 text-[13px] text-[#6B7280]">Use this before imports, server moves, or major edits. The file includes sensitive settings and encrypted provider credentials, so store it carefully.</p>
                  <a href="/api/backup" className="mt-3 inline-flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[#4F46E5] px-3.5 text-[13px] font-semibold text-white hover:bg-[#4338CA]">
                    <Download className="h-3.5 w-3.5" />
                    Download JSON Backup
                  </a>
                </div>

                <div className="rounded-[8px] border border-[#E5E7EB] bg-white p-4">
                  <p className="text-[13px] font-semibold text-[#111827]">Restore Backup</p>
                  <p className="mt-1 text-[13px] text-[#6B7280]">Upload a CloudOps JSON backup. Restore updates matching IDs and keys; it does not delete unrelated current records.</p>
                  <label className="mt-3 inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-[#374151] hover:bg-[#F9FAFB]">
                    {restoringBackup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {restoringBackup ? "Restoring..." : "Upload Backup"}
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      disabled={restoringBackup}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        restoreBackup(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
