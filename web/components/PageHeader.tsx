import { Eyebrow } from "@/components/ui/Eyebrow";

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
    <header className="mb-10 border-b border-border/70 pb-8">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className={`hs-page-title ${eyebrow ? "mt-3" : ""}`}>{title}</h1>
      {description && <p className="hs-prose mt-4 max-w-2xl">{description}</p>}
    </header>
  );
}
