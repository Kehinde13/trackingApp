import { describe, expect, it } from "vitest";

import {
  AdminAuthorizationError,
  assertAdminRole,
  getSafeInternalCallbackUrl,
  hasAdminRole,
} from "./auth-guards";

describe("getSafeInternalCallbackUrl", () => {
  it("preserves safe internal callback URLs", () => {
    expect(getSafeInternalCallbackUrl("/admin?view=active#top")).toBe(
      "/admin?view=active#top",
    );
  });

  it.each([
    "https://attacker.example/admin",
    "//attacker.example/admin",
    "/\\attacker.example/admin",
    "javascript:alert(1)",
  ])("rejects an external or unsafe callback URL: %s", (callbackUrl) => {
    expect(getSafeInternalCallbackUrl(callbackUrl)).toBe("/admin");
  });
});

describe("hasAdminRole", () => {
  it("accepts the admin role, including a comma-separated role list", () => {
    expect(hasAdminRole("admin")).toBe(true);
    expect(hasAdminRole("user, admin")).toBe(true);
  });

  it.each([undefined, null, "", "user", "administrator"])(
    "rejects a non-admin role: %s",
    (role) => {
      expect(hasAdminRole(role)).toBe(false);
    },
  );
});

describe("assertAdminRole", () => {
  it("allows administrators to perform protected mutations", () => {
    expect(() => assertAdminRole("admin")).not.toThrow();
  });

  it("rejects non-admin package mutations", () => {
    expect(() => assertAdminRole("user")).toThrow(AdminAuthorizationError);
    expect(() => assertAdminRole(undefined)).toThrow(AdminAuthorizationError);
  });
});
