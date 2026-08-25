import { afterEach, describe, expect, it } from "vitest";

import {
  formatDateForDatetimeLocal,
  localDateTimeToUtcIso,
  parseLocalDateTime,
} from "./local-date-time";

describe("local datetime conversion", () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTimezone;
  });

  it("formats a Date using browser-local calendar fields", () => {
    const date = new Date(2026, 7, 25, 9, 7);
    expect(formatDateForDatetimeLocal(date)).toBe("2026-08-25T09:07");
  });

  it("parses a datetime-local value as local wall-clock time", () => {
    const parsed = parseLocalDateTime("2026-08-25T09:07");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(25);
    expect(parsed?.getHours()).toBe(9);
    expect(parsed?.getMinutes()).toBe(7);
  });

  it("serializes the browser-local instant as canonical UTC", () => {
    const expected = new Date(2026, 7, 25, 9, 7).toISOString();
    expect(localDateTimeToUtcIso("2026-08-25T09:07")).toBe(expected);
    expect(localDateTimeToUtcIso("not-a-date")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(parseLocalDateTime("2026-02-30T09:07")).toBeNull();
    expect(parseLocalDateTime("2026-08-25T24:00")).toBeNull();
  });

  it("rejects wall times that do not exist during a DST transition", () => {
    process.env.TZ = "America/New_York";

    expect(parseLocalDateTime("2026-03-08T02:30")).toBeNull();
  });
});
