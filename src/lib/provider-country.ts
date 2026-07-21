const COUNTRY_TLD: Record<string, string> = {
  ae: "United Arab Emirates",
  ar: "Argentina",
  at: "Austria",
  au: "Australia",
  be: "Belgium",
  bg: "Bulgaria",
  br: "Brazil",
  ca: "Canada",
  ch: "Switzerland",
  cl: "Chile",
  cn: "China",
  co: "Colombia",
  cz: "Czech Republic",
  de: "Germany",
  dk: "Denmark",
  ee: "Estonia",
  eg: "Egypt",
  es: "Spain",
  eu: "European Union",
  fi: "Finland",
  fr: "France",
  gr: "Greece",
  hk: "Hong Kong",
  hr: "Croatia",
  hu: "Hungary",
  id: "Indonesia",
  ie: "Ireland",
  il: "Israel",
  in: "India",
  io: "British Indian Ocean Territory",
  is: "Iceland",
  it: "Italy",
  jp: "Japan",
  kr: "South Korea",
  lt: "Lithuania",
  lu: "Luxembourg",
  lv: "Latvia",
  ma: "Morocco",
  mx: "Mexico",
  my: "Malaysia",
  nl: "Netherlands",
  no: "Norway",
  nz: "New Zealand",
  pl: "Poland",
  pt: "Portugal",
  ro: "Romania",
  rs: "Serbia",
  ru: "Russia",
  se: "Sweden",
  sg: "Singapore",
  si: "Slovenia",
  sk: "Slovakia",
  th: "Thailand",
  tr: "Turkey",
  tw: "Taiwan",
  ua: "Ukraine",
  uk: "United Kingdom",
  us: "United States",
  vn: "Vietnam",
  za: "South Africa",
};

const GENERIC_TLDS = new Set([
  "app",
  "biz",
  "cloud",
  "com",
  "dev",
  "host",
  "hosting",
  "info",
  "net",
  "org",
  "server",
  "site",
  "technology",
  "xyz",
]);

function domainFromValue(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  const emailDomain = raw.includes("@") ? raw.split("@").pop() : raw;
  try {
    const withProtocol = emailDomain?.startsWith("http") ? emailDomain : `https://${emailDomain}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return emailDomain?.replace(/^www\./, "").split("/")[0] || null;
  }
}

export function detectProviderCountry(input: {
  website?: string | null;
  supportEmail?: string | null;
  salesEmail?: string | null;
}) {
  const domains = [input.website, input.supportEmail, input.salesEmail]
    .map(domainFromValue)
    .filter(Boolean) as string[];

  for (const domain of domains) {
    const parts = domain.split(".").filter(Boolean);
    const tld = parts.at(-1);
    if (!tld || GENERIC_TLDS.has(tld)) continue;
    const country = COUNTRY_TLD[tld];
    if (country) {
      return {
        country,
        source: domain,
        confidence: "domain_tld" as const,
      };
    }
  }

  return null;
}
