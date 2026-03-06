type CardNameHoverProps = {
  name: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  printingId?: string | null;
};
import { CardLink } from "@/components/CardLink";

export function CardNameHover({ name, setCode, collectorNumber, printingId }: CardNameHoverProps) {
  return (
    <CardLink
      name={name}
      setCode={setCode}
      collectorNumber={collectorNumber}
      printingId={printingId}
    />
  );
}
