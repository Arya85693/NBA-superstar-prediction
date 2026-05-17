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
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Choose a new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Set a new password for your account, then sign in again to continue.
        </p>
      </div>

      {linkStatus === "checking" && (
        <div className="mb-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Checking your reset link…
        </div>
      )}

      {linkStatus === "invalid" && (
        <div className="mb-6 rounded-xl border border-negative/20 bg-negative-muted px-4 py-3 text-sm leading-relaxed text-negative/95">
          This reset link is invalid or expired. Request a new one to try again.
        </div>
      )}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm shadow-slate-900/5"
      >
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-muted-foreground">
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
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:border-accent/80 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-xs font-medium text-muted-foreground"
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
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:border-accent/80 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="••••••••"
          />
        </div>

        {errorMessage && (
          <p className="text-sm leading-relaxed text-negative/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={formDisabled}
          className="w-full rounded-lg border border-accent/80 bg-accent-muted py-2.5 text-sm font-semibold text-accent-hover transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Need a new email?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
        >
          Request another reset link
        </Link>
      </p>
    </div>
  );
}
