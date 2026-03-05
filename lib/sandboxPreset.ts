export const RULES_SANDBOX_PRESET_KEY = "commanderDeckDoctor.rulesSandboxPreset.v1";

export type RulesSandboxPresetPlayer = {
  name: string;
  decklist: string;
  commanderName?: string | null;
};

export type RulesSandboxPreset = {
  version: 1;
  seed: string;
  players: RulesSandboxPresetPlayer[];
  updatedAt: string;
};

export function saveRulesSandboxPreset(preset: RulesSandboxPreset): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RULES_SANDBOX_PRESET_KEY, JSON.stringify(preset));
  } catch {
    // ignore storage failures; sandbox can still be used with manual setup
  }
}

export function loadRulesSandboxPreset(): RulesSandboxPreset | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(RULES_SANDBOX_PRESET_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RulesSandboxPreset;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
