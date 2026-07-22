export const BLACKLIST_PROVIDER_OPTIONS = [
  { value: "hetrixtools", label: "HetrixTools" },
  { value: "mxtoolbox", label: "MxToolbox" },
] as const;

export type BlacklistProvider = typeof BLACKLIST_PROVIDER_OPTIONS[number]["value"];

export function isBlacklistProvider(value: unknown): value is BlacklistProvider {
  return BLACKLIST_PROVIDER_OPTIONS.some((option) => option.value === value);
}

export function isHetrixToolsApiKey(value: string | null | undefined) {
  return /^[a-z0-9_-]{20,128}$/i.test(String(value || "").trim());
}

export const HETRIXTOOLS_API_KEY_HELP =
  "Enter the API token from HetrixTools Account Settings > API Keys. Account emails and passwords are not API tokens.";
