import Link from "next/link";

export const metadata = {
  title: "Sign-in error",
};

export default function AuthCodeErrorPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-8 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">Couldn&apos;t confirm sign-in</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        The link may have expired, or something went wrong. Try signing in again from the login
        page.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-lg border border-emerald-600/80 bg-emerald-950/40 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-950/70"
      >
        Back to login
      </Link>
    </div>
  );
}
