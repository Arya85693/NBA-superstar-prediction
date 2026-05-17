"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { formatUsd } from "@/lib/format";
import { GUEST_BROWSE_CLEAR_PATH } from "@/lib/guestBrowse";
import { createSupabaseSessionBrowser } from "@/lib/supabase-session-browser";

type Pf = { cash: number; total: number };

type PortfolioFetch = "loading" | "ok" | "error";

const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  {
    href: "/market",
    label: "Market",
    match: (p) => p === "/market" || p.startsWith("/player/"),
  },
  { href: "/portfolio", label: "Portfolio", match: (p) => p === "/portfolio" },
  {
    href: "/how-it-works",
    label: "Guide",
    match: (p) => p === "/how-it-works",
  },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const isAuthPage =
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path === "/auth/auth-code-error";
  const [pf, setPf] = useState<Pf | null>(null);
  const [portfolioFetch, setPortfolioFetch] = useState<PortfolioFetch>("loading");
  const [account, setAccount] = useState<
    { id: string; email: string | null } | null | undefined
  >(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) =>
        r.json() as Promise<{ user: { id: string; email: string | null } | null }>,
      )
      .then((d) => {
        if (!alive) return;
        setAccount(d.user ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setAccount(null);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    if (isAuthPage || account !== null) return;

    const clearGuestCookie = () => {
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          GUEST_BROWSE_CLEAR_PATH,
          new Blob([], { type: "application/octet-stream" }),
        );
      } else {
        void fetch(GUEST_BROWSE_CLEAR_PATH, {
          method: "POST",
          credentials: "include",
          keepalive: true,
        }).catch(() => {
          /* best effort cleanup when guest tab closes */
        });
      }
    };

    window.addEventListener("pagehide", clearGuestCookie);
    return () => {
      window.removeEventListener("pagehide", clearGuestCookie);
    };
  }, [account, isAuthPage]);

  useEffect(() => {
    let alive = true;
    function load() {
      fetch("/api/portfolio")
        .then(async (r) => {
          const d = (await r.json()) as {
            cash?: number;
            total?: number;
            error?: string;
          };
          return { ok: r.ok, d };
        })
        .then(({ ok, d }) => {
          if (!alive) return;
          if (
            ok &&
            typeof d.cash === "number" &&
            Number.isFinite(d.cash)
          ) {
            setPf({
              cash: d.cash,
              total:
                typeof d.total === "number" && Number.isFinite(d.total)
                  ? d.total
                  : d.cash,
            });
            setPortfolioFetch("ok");
          } else {
            setPf(null);
            setPortfolioFetch("error");
          }
        })
        .catch(() => {
          if (!alive) return;
          setPf(null);
          setPortfolioFetch("error");
        });
    }
    queueMicrotask(() => {
      if (!alive) return;
      setPortfolioFetch("loading");
      load();
    });
    const onUp = () => {
      setPortfolioFetch("loading");
      load();
    };
    window.addEventListener("portfolio-updated", onUp);
    return () => {
      alive = false;
      window.removeEventListener("portfolio-updated", onUp);
    };
  }, [path]);

  return (
    <header className="hs-nav-shell sticky top-0 z-50 border-b border-border/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-8 md:py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-10">
          <BrandLogo size={40} />
          {!isAuthPage && (
            <nav
              className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border/60 bg-surface-muted/70 p-1"
              aria-label="Main"
            >
              {tabs.map((t) => {
                const active = t.match(path);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    prefetch
                    className={
                      active
                        ? "hs-nav-pill-active rounded-lg px-4 py-2 text-sm font-semibold transition"
                        : "rounded-lg px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface/80 hover:text-charcoal"
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-2 border-t border-border/60 pt-2 sm:border-t-0 sm:pt-0">
          <div className="flex items-center gap-2">
            {account === undefined && (
              <span className="text-muted" aria-hidden>
                …
              </span>
            )}
            {account === null && (
              <Link
                href="/login"
                className="text-sm font-medium text-accent transition hover:text-accent-hover"
              >
                Log in
              </Link>
            )}
            {account && (
              <>
                <span
                  className="hidden max-w-[10rem] truncate text-xs text-muted sm:inline"
                  title={account.email ?? undefined}
                >
                  {account.email ?? "Signed in"}
                </span>
                <button
                  type="button"
                  className="text-sm font-medium text-muted transition hover:text-negative"
                  onClick={() => {
                    void (async () => {
                      const supabase = createSupabaseSessionBrowser();
                      await supabase.auth.signOut();
                      setAccount(null);
                      router.refresh();
                      window.dispatchEvent(new Event("portfolio-updated"));
                      router.push("/login");
                    })();
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border/80 bg-surface-elevated/95 px-3.5 py-2 text-right shadow-sm">
            <div className="hs-label text-[10px]">Buying power</div>
            {portfolioFetch === "loading" && (
              <div className="hs-stat-value text-sm text-muted">…</div>
            )}
            {portfolioFetch === "ok" && pf && (
              <div className="hs-stat-value text-sm font-medium text-foreground">
                {formatUsd(pf.cash)}
              </div>
            )}
            {portfolioFetch === "error" && (
              <div className="max-w-[9rem] text-xs leading-snug text-muted">
                Couldn&apos;t load
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
