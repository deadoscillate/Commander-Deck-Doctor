import { parseManaCost } from "@/lib/mana/parseManaCost";
import { ManaIcon } from "@/components/ManaIcon";

type ManaCostProps = {
  manaCost?: string | null;
  size?: number;
  className?: string;
};

export function ManaCost({ manaCost, size = 18, className }: ManaCostProps) {
  const tokens = parseManaCost(manaCost);
  if (tokens.length === 0) {
    return null;
  }

  return (
    <span className={`mana-inline${className ? ` ${className}` : ""}`} aria-label={`Mana cost ${manaCost}`}>
      {tokens.map((symbol, index) => (
        <ManaIcon key={`${symbol}-${index}`} symbol={symbol} size={size} />
      ))}
    </span>
  );
}
