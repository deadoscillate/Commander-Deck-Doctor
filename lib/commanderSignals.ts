export type CommanderSignalSuggestionGroup = {
  key: string;
  label: string;
  description: string;
  patternSource: string;
  names: string[];
};

export const COMMANDER_SIGNAL_SUGGESTION_GROUPS: CommanderSignalSuggestionGroup[] = [
  {
    key: "combat-damage-support",
    label: "Combat Support",
    description: "This commander rewards evasive combat or repeated combat-damage triggers.",
    patternSource: "combat damage to a player|whenever .* deals combat damage|can't be blocked|flying|menace|attacks",
    names: ["Reconnaissance Mission", "Coastal Piracy", "Bident of Thassa", "Toski, Bearer of Secrets", "Tetsuko Umezawa, Fugitive", "Whispersilk Cloak"]
  },
  {
    key: "token-payoffs",
    label: "Token Payoffs",
    description: "This commander creates or scales tokens and wants payoff cards that multiply or cash them in.",
    patternSource: "create [^.]{0,80}\\btoken\\b|populate|amass",
    names: ["Skullclamp", "Parallel Lives", "Anointed Procession", "Mondrak, Glory Dominus", "Second Harvest", "Cathars' Crusade"]
  },
  {
    key: "counter-payoffs",
    label: "Counter Payoffs",
    description: "This commander cares about counters and benefits from payoffs that grow or cash them in.",
    patternSource: "\\+1\\/\\+1 counter|proliferate|counter on",
    names: ["The Ozolith", "Hardened Scales", "Branching Evolution", "Karn's Bastion", "Inspiring Call", "Walking Ballista"]
  },
  {
    key: "aristocrats-support",
    label: "Sacrifice Payoffs",
    description: "This commander wants sacrifice fodder and payoff pieces that reward creatures dying.",
    patternSource: "sacrifice [^.]{0,80}creature|whenever .* dies|dies,? .*opponent loses life|aristocrat",
    names: ["Viscera Seer", "Ashnod's Altar", "Phyrexian Altar", "Blood Artist", "Zulaport Cutthroat", "Bastion of Remembrance"]
  },
  {
    key: "blink-support",
    label: "Blink Value",
    description: "This commander cares about enter-the-battlefield value and benefits from blink enablers.",
    patternSource: "enters the battlefield|exile .* return it to the battlefield|flicker|blink",
    names: ["Teleportation Circle", "Conjurer's Closet", "Ephemerate", "Cloudshift", "Panharmonicon", "Soulherder"]
  },
  {
    key: "graveyard-payoffs",
    label: "Graveyard Value",
    description: "This commander wants cards that fill, recur, or weaponize the graveyard.",
    patternSource: "\\bgraveyard\\b|return [^.]{0,80} from your graveyard|mill",
    names: ["Entomb", "Animate Dead", "Victimize", "Life from the Loam", "Perpetual Timepiece", "Ramunap Excavator"]
  },
  {
    key: "reanimation-support",
    label: "Reanimation Package",
    description: "This commander wants graveyard setup and effects that bring creatures back efficiently.",
    patternSource: "return target creature card from your graveyard|reanimate|return .* from your graveyard to the battlefield",
    names: ["Reanimate", "Animate Dead", "Necromancy", "Victimize", "Buried Alive", "Entomb"]
  },
  {
    key: "artifact-payoffs",
    label: "Artifact Payoffs",
    description: "This commander wants cheap artifacts and artifact payoff cards.",
    patternSource: "\\bartifact\\b|historic",
    names: ["Thought Monitor", "Emry, Lurker of the Loch", "Foundry Inspector", "Urza's Saga", "Sai, Master Thopterist", "Thoughtcast"]
  },
  {
    key: "enchantment-payoffs",
    label: "Enchantment Payoffs",
    description: "This commander wants enchantment density and enchantment-matters payoffs.",
    patternSource: "\\benchantment\\b|constellation|aura",
    names: ["Enchantress's Presence", "Mesa Enchantress", "Satyr Enchanter", "Sterling Grove", "Sythis, Harvest's Hand", "Sanctum Weaver"]
  },
  {
    key: "voltron-support",
    label: "Voltron Support",
    description: "This commander wants equipment, auras, or pump that convert one attacker into lethal pressure.",
    patternSource: "equipped|equipment|aura attached|target creature you control gets|\\bcommander damage\\b|double strike",
    names: ["Blackblade Reforged", "Swiftfoot Boots", "Lightning Greaves", "Sword of the Animist", "All That Glitters", "Embercleave"]
  },
  {
    key: "discard-wheel-support",
    label: "Discard and Wheels",
    description: "This commander wants hands moving and payoffs for discard or wheel effects.",
    patternSource: "discard|each player draws .* cards|wheel",
    names: ["Windfall", "Wheel of Misfortune", "Faithless Looting", "Waste Not", "Tinybones, Trinket Thief", "Dark Deal"]
  },
  {
    key: "treasure-support",
    label: "Treasure Support",
    description: "This commander creates or cares about Treasures and wants payoffs that turn them into mana or damage.",
    patternSource: "\\btreasure\\b|create .* treasure token",
    names: ["Academy Manufactor", "Revel in Riches", "Goldspan Dragon", "Xorn", "Professional Face-Breaker", "Storm-Kiln Artist"]
  },
  {
    key: "land-payoffs",
    label: "Landfall Support",
    description: "This commander rewards land drops or landfall and wants support that increases land velocity.",
    patternSource: "\\blandfall\\b|play an additional land|whenever a land enters|land enters the battlefield",
    names: ["Exploration", "Azusa, Lost but Seeking", "Ancient Greenwarden", "Scapeshift", "Ramunap Excavator", "Crucible of Worlds"]
  },
  {
    key: "legend-payoffs",
    label: "Legend Support",
    description: "This commander wants legendary-matters support that turns your board into mana and cards.",
    patternSource: "\\blegendary\\b|historic",
    names: ["Relic of Legends", "Heroes' Podium", "Reki, the History of Kamigawa", "Delighted Halfling", "Plaza of Heroes", "Shanid, Sleepers' Scourge"]
  },
  {
    key: "spell-payoffs",
    label: "Spell Payoffs",
    description: "This commander cares about chaining spells and wants cheap cantrips or spell payoff permanents.",
    patternSource: "instant or sorcery|noncreature spell|magecraft|prowess",
    names: ["Storm-Kiln Artist", "Archmage Emeritus", "Birgi, God of Storytelling", "Ponder", "Preordain", "Aetherflux Reservoir"]
  },
  {
    key: "lifegain-support",
    label: "Lifegain Payoffs",
    description: "This commander gains life or drains life and wants payoffs that turn life swings into card or board advantage.",
    patternSource: "gain life|whenever you gain life|opponent loses life|lifelink",
    names: ["Authority of the Consuls", "Soul Warden", "Ajani's Pridemate", "Cliffhaven Vampire", "Exquisite Blood", "Well of Lost Dreams"]
  },
  {
    key: "exile-cast-support",
    label: "Exile-Cast Support",
    description: "This commander plays from exile and wants cards that increase access to off-top or exile-cast value.",
    patternSource: "from exile|play .* from exile|cast .* from exile|impulsive draw",
    names: ["Passionate Archaeologist", "Nalfeshnee", "The Lost and the Damned", "Jeska's Will", "Light Up the Stage", "Outpost Siege"]
  }
];

export function buildCommanderSignalPattern(patternSource: string): RegExp {
  return new RegExp(patternSource, "i");
}

