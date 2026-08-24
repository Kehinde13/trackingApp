import "server-only";

import {
  TRACKING_ERROR_CODES,
  TrackingProviderError,
  type TrackingProvider,
  type TrackingRequest,
} from "@/lib/tracking-provider";

export class DisabledTrackingProvider implements TrackingProvider {
  readonly name = "disabled";
  readonly enabled = false;

  registerTracking(input: TrackingRequest): Promise<never> {
    void input;
    return Promise.reject(new TrackingProviderError(TRACKING_ERROR_CODES.DISABLED));
  }

  getTrackingInfo(input: TrackingRequest): Promise<never> {
    void input;
    return Promise.reject(new TrackingProviderError(TRACKING_ERROR_CODES.DISABLED));
  }
}
