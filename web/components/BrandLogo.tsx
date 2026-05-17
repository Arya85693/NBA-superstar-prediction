import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  /** Icon edge length in CSS pixels */
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

export function BrandLogo({
  size = 32,
  showWordmark = true,
  className = "",
}: BrandLogoProps) {
  return (
    <Link
      href="/"
      className={`group flex shrink-0 items-center gap-2.5 ${className}`.trim()}
    >
      <Image
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
        priority
      />
      {showWordmark ? (
        <span className="text-[15px] font-semibold tracking-tight text-charcoal sm:text-base">
          Hoops{" "}
          <span className="font-normal text-muted-foreground">Stock Market</span>
        </span>
      ) : (
        <span className="sr-only">Hoops Stock Market</span>
      )}
    </Link>
  );
}
