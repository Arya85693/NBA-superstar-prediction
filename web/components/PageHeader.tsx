export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8 border-b border-zinc-800/80 pb-8">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500/90">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
          {description}
        </p>
      )}
    </header>
  );
}
