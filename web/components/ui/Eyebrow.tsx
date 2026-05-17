export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`hs-eyebrow ${className}`.trim()}>{children}</p>;
}
