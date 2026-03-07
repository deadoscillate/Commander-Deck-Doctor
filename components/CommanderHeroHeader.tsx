import { CardNameHover } from "@/components/CardNameHover";
import { ColorIdentityIcons } from "@/components/ColorIdentityIcons";

type CommanderHeroHeaderProps = {
  commander: {
    name: string;
    colorIdentity: string[];
    cmc?: number | null;
    artUrl?: string | null;
    cardImageUrl?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
    printingId?: string | null;
  };
  archetypeLabel?: string | null;
  bracketLabel?: string | null;
};

export function CommanderHeroHeader({
  commander,
  archetypeLabel,
  bracketLabel
}: CommanderHeroHeaderProps) {
  const preferredHeroArtUrl = commander.artUrl ?? commander.cardImageUrl;
  const heroArtStyle = preferredHeroArtUrl
    ? {
        backgroundImage: `url("${preferredHeroArtUrl}")`
      }
    : undefined;

  const backgroundStyle = preferredHeroArtUrl
    ? {
        backgroundImage: `radial-gradient(circle at 12% 22%, rgba(255, 236, 190, 0.16), transparent 42%), linear-gradient(120deg, rgba(10, 16, 24, 0.94) 0%, rgba(19, 30, 42, 0.82) 50%, rgba(10, 16, 24, 0.94) 100%), url("${preferredHeroArtUrl}")`,
        backgroundRepeat: "no-repeat, no-repeat, no-repeat",
        backgroundSize: "cover, cover, cover",
        backgroundPosition: "center, center, center"
      }
    : {
        backgroundImage:
          "radial-gradient(circle at 12% 22%, rgba(255, 236, 190, 0.16), transparent 42%), linear-gradient(120deg, rgba(10, 16, 24, 0.94) 0%, rgba(19, 30, 42, 0.82) 50%, rgba(10, 16, 24, 0.94) 100%)",
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center"
      };

  return (
    <section className="commander-hero" style={backgroundStyle}>
      {heroArtStyle ? (
        <div className="commander-hero-art" aria-hidden="true">
          <div className="commander-hero-art-image" style={heroArtStyle} />
        </div>
      ) : null}
      <div className="commander-hero-content">
        <p className="commander-hero-kicker">Commander</p>
        <h2 className="commander-hero-title">
          <CardNameHover
            name={commander.name}
            setCode={commander.setCode ?? null}
            collectorNumber={commander.collectorNumber ?? null}
            printingId={commander.printingId ?? null}
          />
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
