const INSTANCE_BOOTED_AT_MS = Date.now();
let runtimeWarm = false;

export type RuntimeWarmSnapshot = {
  coldStart: boolean;
  instanceUptimeMs: number;
  alreadyWarm: boolean;
};

export function consumeRuntimeColdStart(): RuntimeWarmSnapshot {
  const alreadyWarm = runtimeWarm;
  runtimeWarm = true;

  return {
    coldStart: !alreadyWarm,
    alreadyWarm,
    instanceUptimeMs: Math.max(0, Date.now() - INSTANCE_BOOTED_AT_MS)
  };
}

export function markRuntimeWarm(): RuntimeWarmSnapshot {
  const alreadyWarm = runtimeWarm;
  runtimeWarm = true;

  return {
    coldStart: !alreadyWarm,
    alreadyWarm,
    instanceUptimeMs: Math.max(0, Date.now() - INSTANCE_BOOTED_AT_MS)
  };
}

export function getRuntimeWarmState(): { bootedAtMs: number; instanceUptimeMs: number; isWarm: boolean } {
  return {
    bootedAtMs: INSTANCE_BOOTED_AT_MS,
    instanceUptimeMs: Math.max(0, Date.now() - INSTANCE_BOOTED_AT_MS),
    isWarm: runtimeWarm
  };
}
