const MXTOOLBOX_API_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMxToolboxApiKey(value: string | null | undefined) {
  return MXTOOLBOX_API_KEY_PATTERN.test(String(value || "").trim());
}

export const MXTOOLBOX_API_KEY_HELP =
  "Enter the UUID API key from MxToolbox API Access. An account email or password cannot authenticate API requests.";
