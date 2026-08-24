import "server-only";

import { DisabledTrackingProvider } from "@/lib/disabled-tracking-provider";
import { SeventeenTrackProvider } from "@/lib/seventeen-track-provider";
import type { TrackingProvider } from "@/lib/tracking-provider";

export type TrackingProviderConfig = { provider?: string; apiKey?: string };

export function createTrackingProvider(config: TrackingProviderConfig = {
  provider: process.env.TRACKING_PROVIDER,
  apiKey: process.env.TRACKING_PROVIDER_API_KEY,
}): TrackingProvider {
  if (config.provider === "17track" && config.apiKey) return new SeventeenTrackProvider(config.apiKey);
  return new DisabledTrackingProvider();
}
