"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLoading() {
  return (
    <div className="mx-auto max-w-md py-16 text-center text-sm text-zinc-500">
      Loading…
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmedEmail = searchParams.get("confirmed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.push("/");
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
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Welcome back — use the same password you chose at sign-up (after confirming your email,
          if required).
        </p>
      </div>

      {confirmedEmail && (
        <div className="mb-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm leading-relaxed text-emerald-200/95">
          Your email was confirmed. Please sign in below to continue.
        </div>
      )}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 shadow-sm shadow-black/20"
      >
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-zinc-400">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-xs font-medium text-zinc-400">
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
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2"
            placeholder="••••••••"
          />
        </div>

        {errorMessage && (
          <p className="text-sm leading-relaxed text-rose-400/95">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-emerald-600/80 bg-emerald-950/50 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-emerald-400/90 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Sign up
        </Link>
      </p>

      <div className="mt-8 space-y-3 border-t border-zinc-800/90 pt-8 text-center">
        <button
          type="button"
          disabled={loading}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void (async () => {
              setLoading(true);
              try {
                await fetch("/api/auth/guest", { method: "POST" });
                router.refresh();
                router.push("/");
              } finally {
                setLoading(false);
              }
            })();
          }}
        >
          Continue without an account
        </button>
        <p className="text-xs leading-relaxed text-zinc-600">
          Uses the shared demo portfolio. Sign up later for your own wallet.
        </p>
      </div>
    </div>
  );
}
