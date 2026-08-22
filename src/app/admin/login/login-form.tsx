"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { validateLoginInput } from "@/lib/login-validation";

type LoginFormProps = {
  callbackUrl: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const validationErrors = validateLoginInput({ email, password });

    if (Object.keys(validationErrors).length > 0) {
      setError(validationErrors.email ?? validationErrors.password ?? "Check your details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        setError("Invalid email or password.");
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-field">
        <label htmlFor="admin-email">Email address</label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="admin-password">Password</label>
        <div className="password-field">
          <input
            id="admin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            minLength={12}
            required
            disabled={isSubmitting}
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={isSubmitting}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      ) : null}
      <button className="auth-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
