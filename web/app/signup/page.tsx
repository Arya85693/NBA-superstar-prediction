"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json() as Promise<{ user: { id: string } | null }>)
      .then((d) => {
        if (cancelled || !d.user) return;
        router.replace("/");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok) {
        setMessage(data.error ?? `Sign-up failed (${res.status}).`);
        return;
      }

      setMessage(
        "Check your inbox — we sent a confirmation link. After you click it, you will land on sign-in and then log in with your password.",
      );
      setEmail("");
      setPassword("");
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  const success = message?.startsWith("Check your inbox");

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500/90">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">
          Create account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Paper trading only — each account gets its own starter balance once you&apos;ve verified
          your email.
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 shadow-sm shadow-black/20"
      >
        <div>
          <label htmlFor="signup-email" className="block text-xs font-medium text-zinc-400">
            Email
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="block text-xs font-medium text-zinc-400">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/40 placeholder:text-zinc-600 focus:border-emerald-600/80 focus:ring-2"
            placeholder="••••••••"
          />
          <p className="mt-1 text-xs text-zinc-600">At least 6 characters.</p>
        </div>

        {message && (
          <p
            className={`text-sm leading-relaxed ${success ? "text-emerald-400/95" : "text-rose-400/95"}`}
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-emerald-600/80 bg-emerald-950/50 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-950/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-400/90 underline-offset-4 hover:text-emerald-300 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
