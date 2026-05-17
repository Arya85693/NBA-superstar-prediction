import Link from "next/link";

export const metadata = {
  title: "Sign-in error",
};

export default function AuthCodeErrorPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t confirm sign-in</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        The link may have expired, or something went wrong. Try signing in again from the login
        page.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-lg border border-accent/80 bg-accent-muted px-4 py-2 text-sm font-medium text-positive transition hover:bg-accent-muted"
      >
        Back to login
      </Link>
    </div>
  );
}
