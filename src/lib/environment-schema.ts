export const ENVIRONMENT_VARIABLES = {
  requiredProduction: [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_TRUSTED_ORIGINS",
    "PUBLIC_TRACKING_HMAC_SECRET",
  ],
  optionalProduction: [
    "DATABASE_POOL_MAX",
    "TRACKING_PROVIDER",
    "TRACKING_PROVIDER_API_KEY",
    "TRACKING_WEBHOOK_SECRET",
    "SHIP24_API_KEY",
    "SHIP24_WEBHOOK_SECRET",
  ],
  developmentOnly: ["SHADOW_DATABASE_URL", "RUN_DB_TESTS"],
  vercelProvided: ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"],
  publicBrowser: [],
} as const;

export type EnvironmentSource = Record<string, string | undefined>;
export type TrackingProviderName = "disabled" | "17track" | "ship24";

export type ServerEnvironment = {
  isProduction: boolean;
  databaseUrl?: string;
  databasePoolMax: number;
  authSecret?: string;
  canonicalOrigin: string;
  trustedOrigins: string[];
  publicTrackingHmacSecret?: string;
  trackingProvider: TrackingProviderName;
  trackingProviderApiKey?: string;
  trackingWebhookSecret?: string;
  ship24ApiKey?: string;
  ship24WebhookSecret?: string;
  isVercel: boolean;
  vercelEnvironment?: string;
};

function exactOrigin(value: string | undefined, production: boolean): string | null {
  if (!value || value.includes("*")) return null;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return null;
    if (production && url.protocol !== "https:") return null;
    if (!production && url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
    return url.origin;
  } catch { return null; }
}

function postgresUrl(value: string | undefined): boolean {
  if (!value) return false;
  try { return ["postgres:", "postgresql:"].includes(new URL(value).protocol); }
  catch { return false; }
}

export function parseDatabasePoolMax(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return 2;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : null;
}

export function validateProductionEnvironment(source: EnvironmentSource): string[] {
  const errors: string[] = [];
  if (!postgresUrl(source.DATABASE_URL)) errors.push("DATABASE_URL");
  if ((source.BETTER_AUTH_SECRET?.length ?? 0) < 32) errors.push("BETTER_AUTH_SECRET");
  const canonicalOrigin = exactOrigin(source.BETTER_AUTH_URL, true);
  if (!canonicalOrigin) errors.push("BETTER_AUTH_URL");
  const trustedOrigins = (source.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!trustedOrigins.length || trustedOrigins.some((value) => !exactOrigin(value, true)) || (canonicalOrigin && !trustedOrigins.includes(canonicalOrigin))) {
    errors.push("BETTER_AUTH_TRUSTED_ORIGINS");
  }
  if ((source.PUBLIC_TRACKING_HMAC_SECRET?.length ?? 0) < 32) errors.push("PUBLIC_TRACKING_HMAC_SECRET");
  if (parseDatabasePoolMax(source.DATABASE_POOL_MAX) === null) errors.push("DATABASE_POOL_MAX");
  if (source.TRACKING_PROVIDER !== undefined && !["disabled", "17track", "ship24"].includes(source.TRACKING_PROVIDER)) errors.push("TRACKING_PROVIDER");
  if (source.TRACKING_PROVIDER === "17track") {
    if (!source.TRACKING_PROVIDER_API_KEY) errors.push("TRACKING_PROVIDER_API_KEY");
    if ((source.TRACKING_WEBHOOK_SECRET?.length ?? 0) < 32) errors.push("TRACKING_WEBHOOK_SECRET");
  }
  if (source.TRACKING_PROVIDER === "ship24" && !source.SHIP24_API_KEY) errors.push("SHIP24_API_KEY");
  return [...new Set(errors)].sort();
}

export function readServerEnvironment(source: EnvironmentSource): ServerEnvironment {
  const isProduction = source.NODE_ENV === "production";
  if (isProduction) {
    const errors = validateProductionEnvironment(source);
    if (errors.length) throw new Error(`Invalid production environment: ${errors.join(", ")}`);
  }
  const canonicalOrigin = exactOrigin(source.BETTER_AUTH_URL, isProduction) ?? "http://localhost:3000";
  const configuredOrigins = (source.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const trustedOrigins = [...new Set([canonicalOrigin, ...configuredOrigins.filter((value) => exactOrigin(value, isProduction))])];
  return {
    isProduction,
    databaseUrl: source.DATABASE_URL,
    databasePoolMax: parseDatabasePoolMax(source.DATABASE_POOL_MAX) ?? 2,
    authSecret: source.BETTER_AUTH_SECRET,
    canonicalOrigin,
    trustedOrigins,
    publicTrackingHmacSecret: source.PUBLIC_TRACKING_HMAC_SECRET,
    trackingProvider: source.TRACKING_PROVIDER === "17track" || source.TRACKING_PROVIDER === "ship24"
      ? source.TRACKING_PROVIDER
      : "disabled",
    trackingProviderApiKey: source.TRACKING_PROVIDER_API_KEY,
    trackingWebhookSecret: source.TRACKING_WEBHOOK_SECRET,
    ship24ApiKey: source.SHIP24_API_KEY,
    ship24WebhookSecret: source.SHIP24_WEBHOOK_SECRET,
    isVercel: source.VERCEL === "1",
    vercelEnvironment: source.VERCEL_ENV,
  };
}
