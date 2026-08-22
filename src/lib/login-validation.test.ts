import { describe, expect, it } from "vitest";

import {
  MIN_ADMIN_PASSWORD_LENGTH,
  validateLoginInput,
} from "./login-validation";

describe("validateLoginInput", () => {
  it("accepts valid administrator login input", () => {
    expect(
      validateLoginInput({
        email: "admin@example.com",
        password: "a-secure-password",
      }),
    ).toEqual({});
  });

  it("rejects an invalid email address", () => {
    expect(
      validateLoginInput({
        email: "not-an-email",
        password: "a-secure-password",
      }).email,
    ).toBeDefined();
  });

  it("rejects passwords shorter than the configured minimum", () => {
    expect(
      validateLoginInput({
        email: "admin@example.com",
        password: "x".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1),
      }).password,
    ).toBeDefined();
  });
});
