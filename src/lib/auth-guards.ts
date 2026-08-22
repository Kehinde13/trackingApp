export function hasAdminRole(role: string | null | undefined): boolean {
  return (
    role
      ?.split(",")
      .map((value) => value.trim())
      .includes("admin") ?? false
  );
}

export function getSafeInternalCallbackUrl(
  candidate: string | null | undefined,
  fallback = "/admin",
): string {
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const base = new URL("https://parceltrack.invalid");
    const resolved = new URL(candidate, base);

    if (resolved.origin !== base.origin) {
      return fallback;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
