const PUBLIC_SITE_URL_ENV_KEYS = [
  "PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL"
] as const;

function normalizeCandidateUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

export function toSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function getConfiguredPublicOrigin(): string | null {
  for (const key of PUBLIC_SITE_URL_ENV_KEYS) {
    const raw = process.env[key]?.trim();
    if (!raw) {
      continue;
    }

    const safeUrl = toSafeExternalUrl(normalizeCandidateUrl(raw));
    if (!safeUrl) {
      continue;
    }

    return new URL(safeUrl).origin;
  }

  return null;
}

export function getTrustedRequestOrigin(request: Request): string | null {
  try {
    const parsed = new URL(request.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return parsed.origin;
    }

    if (process.env.NODE_ENV !== "production") {
      return parsed.origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function getPublicAppOrigin(request?: Request): string | null {
  return getConfiguredPublicOrigin() ?? (request ? getTrustedRequestOrigin(request) : null);
}
