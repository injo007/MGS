import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const publicRoutes = ["/login", "/api/auth", "/api/cron"];

function normalizeIp(ip: string) {
  return ip.trim().replace(/^::ffff:/, "");
}

function ipToLong(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return parts.reduce((total, part) => (total << 8) + part, 0) >>> 0;
}

function matchesIpRule(ip: string, rule: string) {
  const normalizedIp = normalizeIp(ip);
  const normalizedRule = normalizeIp(rule);

  if (!normalizedRule) {
    return false;
  }

  if (!normalizedRule.includes("/")) {
    return normalizedIp === normalizedRule;
  }

  const [network, prefixText] = normalizedRule.split("/");
  const prefix = Number(prefixText);
  const ipLong = ipToLong(normalizedIp);
  const networkLong = ipToLong(network);

  if (ipLong === null || networkLong === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipLong & mask) === (networkLong & mask);
}

function getClientIp(request: NextRequest) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return normalizeIp(cfIp);
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return normalizeIp(forwardedFor.split(",")[0] || "");
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return normalizeIp(realIp);
  }

  return "";
}

function isClientIpAllowed(request: NextRequest) {
  const rules = (process.env.ACCESS_ALLOWED_IPS || process.env.ALLOWED_CLIENT_IPS || "")
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);

  if (rules.length === 0) {
    return true;
  }

  const clientIp = getClientIp(request);
  if (!clientIp) {
    return true;
  }

  if (["127.0.0.1", "::1"].includes(clientIp)) {
    return true;
  }

  return rules.some((rule) => matchesIpRule(clientIp, rule));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/api/health" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const proxyOnly = process.env.PROXY_ONLY === "true";
  const proxySecret = process.env.TRUSTED_PROXY_SECRET || "";
  if (proxyOnly && proxySecret) {
    const headerSecret = request.headers.get("x-cloudops-proxy-secret") || "";
    if (headerSecret !== proxySecret) {
      return new NextResponse("Forbidden: trusted proxy required", { status: 403 });
    }
  }

  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  if (!isClientIpAllowed(request)) {
    return new NextResponse("Forbidden: approved access proxy required", { status: 403 });
  }

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
