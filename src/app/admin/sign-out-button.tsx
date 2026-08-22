"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={isSigningOut}>
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
