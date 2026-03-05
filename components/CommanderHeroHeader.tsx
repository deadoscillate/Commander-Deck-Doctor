import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";

type CommanderHeroHeaderProps = {
  commander: {
    name: string;
    colorIdentity: string[];
    cmc?: number | null;
    artUrl?: string | null;
  };
  archetypeLabel?: string | null;
  bracketLabel?: string | null;
};

export function CommanderHeroHeader({
  commander,
  archetypeLabel,
  bracketLabel
}: CommanderHeroHeaderProps) {
  const backgroundStyle = commander.artUrl
    ? {
        backgroundImage: `linear-gradient(120deg, rgba(8, 13, 18, 0.9) 0%, rgba(8, 13, 18, 0.58) 48%, rgba(8, 13, 18, 0.86) 100%), url("${commander.artUrl}")`
      }
    : {
        backgroundImage:
          "linear-gradient(120deg, rgba(10, 16, 24, 0.94) 0%, rgba(19, 30, 42, 0.82) 50%, rgba(10, 16, 24, 0.94) 100%)"
      };

  return (
    <section className="commander-hero" style={backgroundStyle}>
      <div className="commander-hero-content">
        <p className="commander-hero-kicker">Commander</p>
        <h2 className="commander-hero-title">
          <CardNameHover name={commander.name} />
        </h2>
        {archetypeLabel ? <p className="commander-hero-archetype">{archetypeLabel}</p> : null}
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
