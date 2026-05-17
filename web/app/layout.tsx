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
    default: "Hoops Stock Market",
    template: "%s · Hoops Stock Market",
  },
  description:
    "Near real-time NBA player market analytics - model-driven paper trading with automated repricing from ingested game data (~30 min refresh cadence).",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
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

      <body className="app-noise min-h-full flex flex-col bg-background text-foreground">

        <a href="#main-content" className="skip-link">

          Skip to main content

        </a>

        <Nav />

        <main

          id="main-content"

          tabIndex={-1}

          className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 outline-none md:px-8 md:py-10 lg:py-12"

        >

          {children}

        </main>

        <footer className="mt-auto border-t border-border/80 bg-surface/70 py-10 backdrop-blur-sm">

          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 text-xs text-muted md:px-8 md:flex-row md:items-center md:justify-between">

            <p className="max-w-sm leading-relaxed">

              Model-driven simulation - paper currency only. Prices refresh on ingestion cycles

              (~30 min), not tick-by-tick. Not investment advice or real securities.

            </p>

            <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">

              <Link className="transition hover:text-accent" href="/">

                Home

              </Link>

              <Link className="transition hover:text-accent" href="/market">

                Market

              </Link>

              <Link className="transition hover:text-accent" href="/portfolio">

                Portfolio

              </Link>

              <Link className="transition hover:text-accent" href="/how-it-works">

                Guide

              </Link>

            </nav>

          </div>

        </footer>

      </body>

    </html>

  );

}

