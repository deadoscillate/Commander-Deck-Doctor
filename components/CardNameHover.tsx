type CardNameHoverProps = {
  name: string;
};
import { CardLink } from "@/components/CardLink";

export function CardNameHover({ name }: CardNameHoverProps) {
  return <CardLink name={name} />;
}
