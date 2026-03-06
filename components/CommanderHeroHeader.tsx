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
  const heroArtStyle = commander.artUrl
    ? {
        backgroundImage: `url("${commander.artUrl}")`
      }
    : undefined;

  const backgroundStyle = commander.artUrl
    ? {
        backgroundImage: `radial-gradient(circle at 12% 22%, rgba(255, 236, 190, 0.18), transparent 42%), linear-gradient(120deg, rgba(10, 15, 20, 0.92) 0%, rgba(10, 15, 20, 0.62) 48%, rgba(10, 15, 20, 0.86) 100%), url("${commander.artUrl}")`
      }
    : {
        backgroundImage:
          "linear-gradient(120deg, rgba(10, 16, 24, 0.94) 0%, rgba(19, 30, 42, 0.82) 50%, rgba(10, 16, 24, 0.94) 100%)"
      };

  return (
    <section className="commander-hero" style={backgroundStyle}>
      {commander.artUrl ? (
        <div className="commander-hero-art" aria-hidden="true">
          <div className="commander-hero-art-image" style={heroArtStyle} />
        </div>
      ) : null}
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
