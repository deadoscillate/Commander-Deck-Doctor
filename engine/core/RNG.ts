import type { RNGState } from "./types";

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextUint32(state: number): number {
  // xorshift32
  let x = state || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

export function createRngState(seed: string | number): RNGState {
  const normalized = String(seed);
  return {
    seed: normalized,
    state: hashSeed(normalized)
  };
}

export function rngNext(state: RNGState): { value: number; state: RNGState } {
  const next = nextUint32(state.state);
  return {
    value: next / 0xffffffff,
    state: {
      ...state,
      state: next
    }
  };
}

export function rngInt(state: RNGState, maxExclusive: number): { value: number; state: RNGState } {
  if (maxExclusive <= 0) {
    return { value: 0, state };
  }

  const next = rngNext(state);
  return {
    value: Math.floor(next.value * maxExclusive),
    state: next.state
  };
}

export function shuffleDeterministic<T>(items: T[], state: RNGState): { items: T[]; state: RNGState } {
  const output = [...items];
  let currentState = state;

  for (let i = output.length - 1; i > 0; i -= 1) {
    const rolled = rngInt(currentState, i + 1);
    currentState = rolled.state;
    const j = rolled.value;
    const temp = output[i];
    output[i] = output[j];
    output[j] = temp;
  }

  return {
    items: output,
    state: currentState
  };
}
