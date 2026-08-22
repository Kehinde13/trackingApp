import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("admin proxy", () => {
  it("redirects an unauthenticated admin request to login", () => {
    const response = proxy(new NextRequest("http://localhost:3000/admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/admin/login?callbackUrl=%2Fadmin",
    );
  });

  it("does not redirect the login page", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/admin/login"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
