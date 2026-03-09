import { CommanderDeckBuilder } from "@/components/builder/CommanderDeckBuilder";

export const metadata = {
  title: "Commander Deck Builder | Commander Deck Doctor",
  description:
    "Start with a commander, build the 99, and keep live Commander legality and analysis visible while you tune."
};

export default function BuilderPage() {
  return <CommanderDeckBuilder />;
}
