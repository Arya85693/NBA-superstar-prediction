"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createSupabaseSessionBrowser } from "@/lib/supabase-session-browser";

type LinkStatus = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseSessionBrowser();
    let cancelled = false;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (
        event === "PASSWORD_RECOVERY" ||
        ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session)
      ) {
        queueMicrotask(() => {
          if (!cancelled) setLinkStatus("ready");
        });
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        if (cancelled) return;
        queueMicrotask(() => {
          if (!cancelled) setLinkStatus(sessionData.session ? "ready" : "invalid");
        });
      })
      .catch(() => {
        if (cancelled) return;
        queueMicrotask(() => {
          if (!cancelled) setLinkStatus("invalid");
        });
      });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseSessionBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await supabase.auth.signOut();
      window.location.assign("/login?reset=1");
    } catch {
      setErrorMessage("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  const formDisabled = loading || linkStatus !== "ready";

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500/90">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Set a new password for your account, then sign in again to continue.
        </p>
      </div>

      {linkStatus === "checking" && (
        <div className="mb-6 rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-4 py-3 text-sm leading-relaxed text-zinc-400">
          Checking your reset link…
        </div>
      )}

      {linkStatus === "invalid" && (
        <div className="mb-6 rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm leading-relaxed text-rose-200/95">
          This reset link is invalid or expired. Request a new one to try again.
        </div>
      )}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 shadow-sm shadow-black/20"
      >
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-zinc-400">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-xs font-medium text-zinc-400"
          >
            Confirm new password
          </label>
          <input
            id="reset-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={formDisabled}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        {errorMessage && (
          <p className="text-sm leading-relaxed text-rose-400/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={formDisabled}
          className="w-full rounded-lg border border-emerald-600/80 bg-emerald-950/50 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Need a new email?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-emerald-400/90 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Request another reset link
        </Link>
      </p>
    </div>
  );
}
