import "server-only";

import { DisabledTrackingProvider } from "@/lib/disabled-tracking-provider";
import { SeventeenTrackProvider } from "@/lib/seventeen-track-provider";
import { Ship24Provider } from "@/lib/ship24-provider";
import type { TrackingProvider } from "@/lib/tracking-provider";
import { getServerEnvironment } from "@/lib/env";

export type TrackingProviderConfig = { provider?: string; apiKey?: string; ship24ApiKey?: string };

export function createTrackingProvider(config?: TrackingProviderConfig): TrackingProvider {
  const environment = config ?? (() => {
    const serverEnvironment = getServerEnvironment();
    return { provider: serverEnvironment.trackingProvider, apiKey: serverEnvironment.trackingProviderApiKey, ship24ApiKey: serverEnvironment.ship24ApiKey };
  })();
  if (environment.provider === "17track" && environment.apiKey) return new SeventeenTrackProvider(environment.apiKey);
  if (environment.provider === "ship24" && environment.ship24ApiKey) return new Ship24Provider(environment.ship24ApiKey);
  return new DisabledTrackingProvider();
}
