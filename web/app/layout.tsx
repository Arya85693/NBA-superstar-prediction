import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NBA Paper Market",
    template: "%s · NBA Paper Market",
  },
  description:
    "Simulated NBA player market with paper trading — model-driven prices from your pipeline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="app-noise min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Nav />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none md:py-10"
        >
          {children}
        </main>
        <footer className="border-t border-zinc-800/90 bg-zinc-950/80 py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md leading-relaxed">
              Simulation only — paper currency and model prices. Not investment advice or real
              securities.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-zinc-500">
              <Link className="transition hover:text-zinc-300" href="/">
                Home
              </Link>
              <Link className="transition hover:text-zinc-300" href="/market">
                Market
              </Link>
              <Link className="transition hover:text-zinc-300" href="/portfolio">
                Portfolio
              </Link>
              <Link className="transition hover:text-zinc-300" href="/how-it-works">
                How it works
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
