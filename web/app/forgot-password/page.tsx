"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setErrorMessage(data.error ?? `Reset request failed (${res.status}).`);
        return;
      }

      setMessage(
        "If that email is registered, we sent a password reset link. Open it from your inbox to choose a new password.",
      );
      setEmail("");
    } catch {
      setErrorMessage("Network error - try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Reset password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enter your account email and we&apos;ll send you a secure link to set a new password.
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm shadow-slate-900/5"
      >
        <div>
          <label htmlFor="forgot-email" className="block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:border-accent/80 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>

        {message && <p className="text-sm leading-relaxed text-positive">{message}</p>}
        {errorMessage && (
          <p className="text-sm leading-relaxed text-negative/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-accent/80 bg-accent-muted py-2.5 text-sm font-semibold text-accent-hover transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
