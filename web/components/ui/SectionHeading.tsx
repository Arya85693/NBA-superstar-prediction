export function SectionHeading({
  title,
  description,
  className = "",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="hs-section-title">{title}</h2>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
