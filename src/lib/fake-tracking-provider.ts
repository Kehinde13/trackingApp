import "server-only";

import type {
  NormalizedCarrierEvent,
  TrackingInfo,
  TrackingProvider,
  TrackingRequest,
} from "@/lib/tracking-provider";

export class FakeTrackingProvider implements TrackingProvider {
  readonly name = "fake";
  readonly enabled = true;
  readonly registrations: TrackingRequest[] = [];

  constructor(private info: TrackingInfo = { carrierCode: "9999", events: [] }, private providerTrackerId?: string) {}

  setEvents(events: NormalizedCarrierEvent[]) {
    this.info = { ...this.info, events };
  }

  async registerTracking(input: TrackingRequest) {
    this.registrations.push(input);
    return { carrierCode: input.carrierCode ?? this.info.carrierCode, providerTrackerId: this.providerTrackerId };
  }

  async getTrackingInfo(input: TrackingRequest) {
    void input;
    return this.info;
  }
}
