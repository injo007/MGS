"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  File,
  X,
  AlertTriangle,
  Loader2,
  Check,
} from "lucide-react";

const STEPS = ["Upload File", "Map Columns", "Validate", "Preview", "Import"];

const ENTITY_OPTIONS = [
  { value: "providers", label: "Providers" },
  { value: "servers", label: "Servers" },
  { value: "ip_addresses", label: "IP Addresses" },
  { value: "outreach", label: "Outreach" },
  { value: "tasks", label: "Tasks" },
];

type ImportMode = "create" | "update" | "skip_existing";

const ENTITY_FIELDS: Record<string, { key: string; label: string; required: boolean }[]> = {
  providers: [
    { key: "name", label: "Name", required: true },
    { key: "website", label: "Website", required: false },
    { key: "support_email", label: "Support Email", required: false },
    { key: "sales_email", label: "Sales Email", required: false },
    { key: "contact_form_url", label: "Contact Form URL", required: false },
    { key: "country", label: "Country", required: false },
    { key: "region", label: "Region", required: false },
    { key: "category", label: "Category", required: false },
    { key: "contact_status", label: "Contact Status", required: false },
    { key: "response_status", label: "Response Status", required: false },
    { key: "decision", label: "Decision", required: false },
    { key: "port25_status", label: "Port 25 Status", required: false },
    { key: "ptr_status", label: "PTR Status", required: false },
    { key: "mail_server_allowed", label: "Mail Server Allowed", required: false },
    { key: "sending_restrictions", label: "Sending Restrictions", required: false },
    { key: "daily_limit", label: "Daily Limit", required: false },
    { key: "hourly_limit", label: "Hourly Limit", required: false },
    { key: "abuse_policy_notes", label: "Abuse Policy Notes", required: false },
    { key: "starting_price", label: "Starting Price", required: false },
    { key: "billing_method", label: "Billing Method", required: false },
    { key: "currency", label: "Currency", required: false },
    { key: "setup_fee", label: "Setup Fee", required: false },
    { key: "payment_method", label: "Payment Method", required: false },
    { key: "refund_policy", label: "Refund Policy", required: false },
  ],
  servers: [
    { key: "name", label: "Name", required: true },
    { key: "provider_id", label: "Provider ID", required: true },
    { key: "plan", label: "Plan", required: false },
    { key: "location", label: "Location", required: false },
    { key: "operating_system", label: "Operating System", required: false },
    { key: "status", label: "Status", required: false },
    { key: "monthly_cost", label: "Monthly Cost", required: false },
    { key: "hourly_cost", label: "Hourly Cost", required: false },
    { key: "currency", label: "Currency", required: false },
    { key: "billing_method", label: "Billing Method", required: false },
    { key: "notes", label: "Notes", required: false },
  ],
  ip_addresses: [
    { key: "address", label: "Address", required: true },
    { key: "provider_id", label: "Provider ID", required: true },
    { key: "server_id", label: "Server ID", required: true },
    { key: "ip_version", label: "IP Version", required: false },
    { key: "location", label: "Location", required: false },
    { key: "status", label: "Status", required: false },
    { key: "ptr_configured", label: "PTR Configured", required: false },
    { key: "ptr_hostname", label: "PTR Hostname", required: false },
    { key: "port25_status", label: "Port 25 Status", required: false },
    { key: "notes", label: "Notes", required: false },
  ],
  outreach: [
    { key: "provider_id", label: "Provider ID", required: true },
    { key: "channel", label: "Channel", required: false },
    { key: "recipient", label: "Recipient", required: false },
    { key: "subject", label: "Subject", required: false },
    { key: "message", label: "Message", required: false },
    { key: "send_result", label: "Send Result", required: false },
    { key: "next_action", label: "Next Action", required: false },
  ],
  tasks: [
    { key: "title", label: "Title", required: true },
    { key: "description", label: "Description", required: false },
    { key: "priority", label: "Priority", required: false },
    { key: "status", label: "Status", required: false },
    { key: "due_date", label: "Due Date", required: false },
    { key: "related_entity_type", label: "Related Entity Type", required: false },
  ],
};

export default function ImportsPage() {
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState("");
  const [mode, setMode] = useState<ImportMode>("create");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<{ row: number; reason: string }[]>([]);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors?: { row: number; reason: string }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetWizard = () => {
    setStep(0);
    setEntity("");
    setMode("create");
    setFileName(null);
    setRawHeaders([]);
    setRawRows([]);
    setMappings({});
    setValidationErrors([]);
    setImportResult(null);
    setImporting(false);
  };

  const parseCSV = async (text: string): Promise<{ headers: string[]; rows: Record<string, any>[] }> => {
    const Papa = await import("papaparse");
    const parsed = Papa.parse<Record<string, any>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });
    const headers = parsed.meta.fields?.filter(Boolean) || [];
    return { headers, rows: parsed.data || [] };
  };

  const parseJSON = (text: string): { headers: string[]; rows: Record<string, any>[] } => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length === 0) return { headers: [], rows: [] };
      const headers = [...new Set(data.flatMap((r) => Object.keys(r)))];
      return { headers, rows: data };
    } catch {
      return { headers: [], rows: [] };
    }
  };

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const text = await file.text();

      if (ext === "json") {
        const { headers, rows } = parseJSON(text);
        setRawHeaders(headers);
        setRawRows(rows);
        autoMap(headers);
        setStep(1);
      } else if (ext === "csv") {
        const { headers, rows } = await parseCSV(text);
        setRawHeaders(headers);
        setRawRows(rows);
        autoMap(headers);
        setStep(1);
      } else if (ext === "xlsx" || ext === "xls") {
        try {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(text, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
          if (jsonData.length > 0) {
            const headers = [...new Set(jsonData.flatMap((r) => Object.keys(r)))];
            setRawHeaders(headers);
            setRawRows(jsonData);
            autoMap(headers);
            setStep(1);
          }
        } catch {
          alert("Failed to parse Excel file. Please ensure it's a valid .xlsx/.xls file.");
        }
      } else {
        alert("Unsupported file format. Please use .csv, .xlsx, .xls, or .json");
      }
      e.target.value = "";
    },
    [entity]
  );

  const autoMap = (headers: string[]) => {
    const auto: Record<string, string> = {};
    const fields = entity ? ENTITY_FIELDS[entity] || [] : [];
    for (const h of headers) {
      const normalized = h.toLowerCase().replace(/[\s\-\/]+/g, "_").replace(/[^a-z0-9_]/g, "");
      const match = fields.find(
        (f) =>
          f.key === normalized ||
          f.key.replace(/_/g, "") === normalized.replace(/_/g, "") ||
          f.label.toLowerCase().replace(/[\s\-\/]+/g, "_") === normalized
      );
      if (match) {
        auto[h] = match.key;
      }
    }
    setMappings(auto);
  };

  const runValidation = () => {
    const errors: { row: number; reason: string }[] = [];
    const fields = entity ? ENTITY_FIELDS[entity] || [] : [];
    const required = fields.filter((f) => f.required);

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const mapped: Record<string, any> = {};
      for (const [fileCol, dbCol] of Object.entries(mappings)) {
        if (row[fileCol] !== undefined) mapped[dbCol] = row[fileCol];
      }
      for (const field of required) {
        if (!mapped[field.key] && mapped[field.key] !== 0) {
          errors.push({ row: i + 1, reason: `Missing required field: ${field.label}` });
        }
      }
    }
    setValidationErrors(errors);
    return errors;
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      // Map rows using column mappings
      const mappedRows = rawRows.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [fileCol, dbCol] of Object.entries(mappings)) {
          if (row[fileCol] !== undefined && row[fileCol] !== "") {
            mapped[dbCol] = row[fileCol];
          }
        }
        return mapped;
      });

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows, entity, mode }),
      });

      const data = await res.json();
      setImportResult(data);
      setStep(4);
    } catch (err: any) {
      setImportResult({ created: 0, updated: 0, skipped: 0, failed: rawRows.length, errors: [{ row: 0, reason: err.message }] });
      setStep(4);
    } finally {
      setImporting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return !!entity && rawRows.length > 0;
      case 1:
        return Object.keys(mappings).length > 0;
      case 2:
        return true;
      case 3:
        return rawRows.length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">
            Import Data
          </h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">
            Import your existing spreadsheet data into CloudOps CRM
          </p>
        </div>
        {step > 0 && (
          <button
            onClick={resetWizard}
            className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
          >
            Start Over
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i < step
                  ? "bg-emerald-100 text-emerald-700"
                  : i === step
                  ? "bg-[#EEF2FF] text-[#4F46E5]"
                  : "bg-[#F3F4F6] text-[#6B7280]"
              }`}
            >
              {i < step ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-current flex items-center justify-center text-[10px]">
                  {i + 1}
                </span>
              )}
              {s}
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className="h-3 w-3 text-[#6B7280]" />
            )}
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.json"
        onChange={handleFile}
        className="hidden"
      />

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-base font-semibold text-[#111827]">Select Entity & File</h2>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#374151] mb-1">
                    Data Type *
                  </label>
                  <select
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    className="h-[34px] w-full rounded-[7px] border border-[#D1D5DB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                  >
                    <option value="">Select entity...</option>
                    {ENTITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#374151] mb-1">
                    Import Mode
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ImportMode)}
                    className="h-[34px] w-full rounded-[7px] border border-[#D1D5DB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                  >
                    <option value="create">Create new records</option>
                    <option value="update">Update existing records</option>
                    <option value="skip_existing">Skip existing records</option>
                  </select>
                  <p className="mt-1 text-[12px] text-[#6B7280]">
                    Skip existing keeps current providers unchanged when the uploaded row matches an existing ID, website/domain, or email. Name-only matching is used only when no website or email exists.
                  </p>
                </div>
              </div>

              <div
                className="border-2 border-dashed border-[#D1D5DB] rounded-xl p-12 text-center hover:border-[#4F46E5]/50 hover:bg-[#EEF2FF]/50 transition-colors cursor-pointer"
                onClick={() => entity && fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
                <p className="text-sm font-medium text-[#111827] mb-1">
                  {entity ? "Upload your file" : "Select a data type first"}
                </p>
                <p className="text-[13px] text-[#6B7280] mb-4">
                  Supports .csv, .xlsx, .xls, and .json files
                </p>
                <button
                  disabled={!entity}
                  onClick={(e) => {
                    e.stopPropagation();
                    entity && fileInputRef.current?.click();
                  }}
                  className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Choose File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Column Mapping */}
      {step === 1 && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <h2 className="text-base font-semibold text-[#111827]">Column Mapping</h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              Map your spreadsheet columns to CRM fields
            </p>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_40px_1fr] gap-4 text-xs font-medium text-[#6B7280] px-3 py-2">
                <span>File Column</span>
                <span />
                <span>CRM Field</span>
              </div>
              {rawHeaders.map((header) => (
                <div
                  key={header}
                  className="grid grid-cols-[1fr_40px_1fr] gap-4 items-center px-3 py-2.5 rounded-lg hover:bg-[#F9FAFB]"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    <span className="text-sm text-[#374151]">{header}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-[#9CA3AF] justify-self-center" />
                  <select
                    value={mappings[header] || ""}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [header]: e.target.value }))
                    }
                    className="h-[34px] rounded-[7px] border border-[#D1D5DB] bg-white px-3 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                  >
                    <option value="">-- Skip --</option>
                    {(ENTITY_FIELDS[entity] || []).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} {f.required ? "*" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#E5E7EB]">
              <p className="text-[13px] text-[#6B7280]">
                <File className="h-3 w-3 inline mr-1" />
                {fileName} — {rawRows.length} rows
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep(0)}
                  className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
                >
                  Back
                </button>
                <button
                  disabled={!canProceed()}
                  onClick={() => {
                    runValidation();
                    setStep(2);
                  }}
                  className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Validate Data
                  <ArrowRight className="h-3.5 w-3.5 ml-2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Validation */}
      {step === 2 && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <h2 className="text-base font-semibold text-[#111827]">Validation Results</h2>
          </div>
          <div className="px-5 pb-5">
            {validationErrors.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <Check className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">All rows valid</p>
                  <p className="text-[13px] text-emerald-600">
                    {rawRows.length} rows passed validation
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {validationErrors.length} validation errors found
                    </p>
                    <p className="text-[13px] text-amber-600">
                      Fix these before importing
                    </p>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border border-[#E5E7EB] rounded-lg">
                  <table className="w-full text-[13px]">
                    <thead className="bg-[#F9FAFB] sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-[#6B7280]">Row</th>
                        <th className="text-left px-3 py-2 font-medium text-[#6B7280]">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]/50">
                      {validationErrors.map((err, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-[#374151]">{err.row}</td>
                          <td className="px-3 py-2 text-red-600">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#E5E7EB]">
              <button
                onClick={() => setStep(1)}
                className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors inline-flex items-center"
              >
                Preview Data
                <ArrowRight className="h-3.5 w-3.5 ml-2" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <h2 className="text-base font-semibold text-[#111827]">Preview</h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              First {Math.min(10, rawRows.length)} of {rawRows.length} rows
            </p>
          </div>
          <div className="px-5 pb-5">
            <div className="overflow-x-auto border border-[#E5E7EB] rounded-lg">
              <table className="w-full text-[13px]">
                <thead className="bg-[#F9FAFB]">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-[#6B7280]">#</th>
                    {Object.entries(mappings)
                      .filter(([, dbCol]) => dbCol)
                      .map(([fileCol]) => (
                        <th
                          key={fileCol}
                          className="text-left px-3 py-2 font-medium text-[#6B7280] whitespace-nowrap"
                        >
                          {mappings[fileCol]}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]/50">
                  {rawRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-[#F9FAFB]">
                      <td className="px-3 py-2 text-[#6B7280]">{i + 1}</td>
                      {Object.entries(mappings)
                        .filter(([, dbCol]) => dbCol)
                        .map(([fileCol]) => (
                          <td key={fileCol} className="px-3 py-2 text-[#374151] max-w-[200px] truncate">
                            {row[fileCol] ?? ""}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#E5E7EB]">
              <button
                onClick={() => setStep(2)}
                className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
              >
                Back
              </button>
              <button
                disabled={importing}
                onClick={handleImport}
                className="h-[34px] rounded-[7px] bg-[#4F46E5] hover:bg-[#4338CA] px-3.5 text-[13px] font-medium text-white transition-colors inline-flex items-center disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Start Import
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Import Result */}
      {step === 4 && importResult && (
        <div className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <div className="p-8 text-center">
            <div
              className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                importResult.failed > 0 ? "bg-amber-100" : "bg-emerald-100"
              }`}
            >
              {importResult.failed > 0 ? (
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              )}
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-2">
              {importResult.failed > 0 ? "Import Completed with Errors" : "Import Complete"}
            </h3>
            <p className="text-sm text-[#6B7280] mb-6">
              Your data has been processed.
            </p>
            <div className="grid grid-cols-4 gap-4 max-w-md mx-auto mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">{importResult.created}</p>
                <p className="text-[11px] text-[#6B7280]">Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-[11px] text-[#6B7280]">Updated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#9CA3AF]">{importResult.skipped}</p>
                <p className="text-[11px] text-[#6B7280]">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-[11px] text-[#6B7280]">Failed</p>
              </div>
            </div>
            {importResult.errors && importResult.errors.length > 0 && (
              <div className="max-w-md mx-auto mb-6 text-left">
                <div className="max-h-32 overflow-y-auto border border-[#E5E7EB] rounded-lg p-3">
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-[12px] text-red-600 mb-1">
                      Row {err.row}: {err.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={resetWizard}
                className="h-[34px] rounded-[7px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors inline-flex items-center"
              >
                Import More
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
