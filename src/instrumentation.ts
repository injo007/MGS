function proxyValueFromEnv() {
  const raw =
    process.env.OUTBOUND_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";

  if (!raw.trim()) {
    return "";
  }

  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length === 4) {
    const [username, password, host, port] = parts;
    return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  }

  return value;
}

function safeProxyLabel(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    const auth = url.username ? `${url.username}:***@` : "";
    return `${url.protocol}//${auth}${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "configured proxy";
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const proxyUrl = proxyValueFromEnv();
  if (!proxyUrl) {
    return;
  }

  process.env.HTTP_PROXY ||= proxyUrl;
  process.env.HTTPS_PROXY ||= proxyUrl;
  process.env.NO_PROXY ||= "localhost,127.0.0.1,db,app,cloudops-db,cloudops-app";

  const undici = await import("undici");
  const maybeUndici = undici as typeof undici & {
    EnvHttpProxyAgent?: new () => unknown;
    ProxyAgent?: new (url: string) => unknown;
    setGlobalDispatcher: (dispatcher: unknown) => void;
  };

  if (maybeUndici.EnvHttpProxyAgent) {
    maybeUndici.setGlobalDispatcher(new maybeUndici.EnvHttpProxyAgent());
  } else if (maybeUndici.ProxyAgent) {
    maybeUndici.setGlobalDispatcher(new maybeUndici.ProxyAgent(proxyUrl));
  }

  console.log(`[proxy] Outbound proxy enabled: ${safeProxyLabel(proxyUrl)}`);
}
