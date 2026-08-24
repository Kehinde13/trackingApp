import "server-only";

import { DisabledTrackingProvider } from "@/lib/disabled-tracking-provider";
import { SeventeenTrackProvider } from "@/lib/seventeen-track-provider";
import type { TrackingProvider } from "@/lib/tracking-provider";
import { getServerEnvironment } from "@/lib/env";

export type TrackingProviderConfig = { provider?: string; apiKey?: string };

export function createTrackingProvider(config?: TrackingProviderConfig): TrackingProvider {
  const environment = config ?? (() => {
    const serverEnvironment = getServerEnvironment();
    return { provider: serverEnvironment.trackingProvider, apiKey: serverEnvironment.trackingProviderApiKey };
  })();
  if (environment.provider === "17track" && environment.apiKey) return new SeventeenTrackProvider(environment.apiKey);
  return new DisabledTrackingProvider();
}
