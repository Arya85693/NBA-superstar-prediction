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
      setErrorMessage("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500/90">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
          Reset password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Enter your account email and we&apos;ll send you a secure link to set a new password.
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 shadow-sm shadow-black/20"
      >
        <div>
          <label htmlFor="forgot-email" className="block text-xs font-medium text-zinc-400">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>

        {message && <p className="text-sm leading-relaxed text-emerald-400/95">{message}</p>}
        {errorMessage && (
          <p className="text-sm leading-relaxed text-rose-400/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-emerald-600/80 bg-emerald-950/50 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-400/90 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
