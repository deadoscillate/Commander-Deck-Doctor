import { ManaIcon } from "@/components/ManaIcon";

type ColorIdentityIconsProps = {
  identity: string[];
  size?: number;
  className?: string;
};

const WUBRG_ORDER = ["W", "U", "B", "R", "G"];

export function ColorIdentityIcons({ identity, size = 18, className }: ColorIdentityIconsProps) {
  const set = new Set(
    (Array.isArray(identity) ? identity : [])
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  );
  const ordered = WUBRG_ORDER.filter((color) => set.has(color));
  const symbols = ordered.length > 0 ? ordered : ["C"];

  return (
    <span className={`mana-inline${className ? ` ${className}` : ""}`} aria-label={`Color identity ${symbols.join("/")}`}>
      {symbols.map((symbol) => (
        <ManaIcon key={symbol} symbol={symbol} size={size} />
      ))}
    </span>
  );
}
