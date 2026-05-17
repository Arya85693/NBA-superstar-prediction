"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLoading() {
  return (
    <div className="mx-auto max-w-md py-16 text-center text-sm text-muted">
      Loading…
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmedEmail = searchParams.get("confirmed") === "1";
  const passwordReset = searchParams.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json() as Promise<{ user: { id: string } | null }>)
      .then((data) => {
        if (cancelled || !data.user) return;
        window.location.assign("/");
      })
      .catch(() => {
        /* stay on the page if auth status couldn't be checked */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setErrorMessage(
          data.error ??
            `Sign-in failed (${res.status}). If you just registered, confirm your email via the link we sent — then sign in here.`,
        );
        return;
      }

      router.refresh();
      window.location.assign("/");
    } catch {
      setErrorMessage("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 flex flex-col items-center text-center sm:items-start sm:text-left">
        <BrandLogo size={48} showWordmark={false} className="mb-5" />
        <p className="hs-eyebrow">Account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Welcome back — use the same password you chose at sign-up (after confirming your email,
          if required).
        </p>
      </div>

      {confirmedEmail && (
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent-muted px-4 py-3 text-sm leading-relaxed text-accent-hover">
          Your email was confirmed. Please sign in below to continue.
        </div>
      )}

      {passwordReset && (
        <div className="mb-6 rounded-xl border border-accent/30 bg-accent-muted px-4 py-3 text-sm leading-relaxed text-accent-hover">
          Your password was updated. Please sign in with your new password.
        </div>
      )}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm shadow-slate-900/5"
      >
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:border-accent/80 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-xs font-medium text-muted-foreground">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted focus:border-accent/80 focus:ring-2"
            placeholder="••••••••"
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {errorMessage && (
          <p className="text-sm leading-relaxed text-negative/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="hs-btn hs-btn-primary w-full disabled:cursor-not-allowed"
        >
          {loading ? "Working…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
        >
          Sign up
        </Link>
      </p>

      <div className="mt-8 space-y-3 border-t border-border pt-8 text-center">
        <button
          type="button"
          disabled={loading}
          className="hs-btn hs-btn-secondary w-full disabled:cursor-not-allowed"
          onClick={() => {
            void (async () => {
              setLoading(true);
              try {
                await fetch("/api/auth/guest", { method: "POST" });
                window.location.assign("/");
              } finally {
                setLoading(false);
              }
            })();
          }}
        >
          Continue without an account
        </button>
        <p className="text-xs leading-relaxed text-muted">
          Uses the shared demo portfolio. Sign up later for your own wallet.
        </p>
      </div>
    </div>
  );
}
