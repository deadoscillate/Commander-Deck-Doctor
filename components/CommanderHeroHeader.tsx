import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";

type CommanderHeroHeaderProps = {
  commander: {
    name: string;
    colorIdentity: string[];
    cmc?: number | null;
    artUrl?: string | null;
    manaCost?: string | null;
  };
  bracketLabel?: string | null;
};

export function CommanderHeroHeader({ commander, bracketLabel }: CommanderHeroHeaderProps) {
  const backgroundStyle = commander.artUrl
    ? {
        backgroundImage: `linear-gradient(120deg, rgba(10, 15, 20, 0.82) 0%, rgba(10, 15, 20, 0.44) 45%, rgba(10, 15, 20, 0.64) 100%), url("${commander.artUrl}")`
      }
    : {
        backgroundImage:
          "linear-gradient(120deg, rgba(12, 20, 28, 0.85) 0%, rgba(24, 36, 49, 0.7) 50%, rgba(12, 20, 28, 0.88) 100%)"
      };

  return (
    <section className="commander-hero" style={backgroundStyle}>
      <div className="commander-hero-content">
        <p className="commander-hero-kicker">Commander</p>
        <h2 className="commander-hero-title">
          <CardNameHover name={commander.name} />
        </h2>
        <div className="commander-hero-meta">
          <div className="commander-hero-meta-left">
            <ColorIdentityIcons identity={commander.colorIdentity} size={22} />
          </div>
          <div className="commander-hero-meta-right">
            {bracketLabel ? <span className="commander-hero-pill">{bracketLabel}</span> : null}
            {typeof commander.cmc === "number" ? (
              <span className="commander-hero-pill commander-hero-pill-cmc">
                CMC {Number.isInteger(commander.cmc) ? commander.cmc : commander.cmc.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
