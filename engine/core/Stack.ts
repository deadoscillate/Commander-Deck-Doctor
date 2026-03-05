import type { GameState, StackAbility, StackItem, StackSpell } from "./types";

export function pushSpellToStack(state: GameState, spell: StackSpell): GameState {
  return {
    ...state,
    stack: [...state.stack, spell]
  };
}

export function pushAbilityToStack(state: GameState, ability: StackAbility): GameState {
  return {
    ...state,
    stack: [...state.stack, ability]
  };
}

export function pushToStackTop(state: GameState, item: StackItem): GameState {
  return {
    ...state,
    stack: [...state.stack, item]
  };
}

export function popStack(state: GameState): { state: GameState; item: StackItem | null } {
  if (state.stack.length === 0) {
    return { state, item: null };
  }

  const stack = [...state.stack];
  const item = stack.pop() ?? null;
  return {
    state: {
      ...state,
      stack
    },
    item
  };
}

export function findStackItem(state: GameState, stackItemId: string): StackItem | null {
  return state.stack.find((item) => item.id === stackItemId) ?? null;
}

export function replaceStackItemTargets(
  state: GameState,
  stackItemId: string,
  targetIds: string[]
): GameState {
  return {
    ...state,
    stack: state.stack.map((item) => {
      if (item.id !== stackItemId) {
        return item;
      }

      return {
        ...item,
        targetIds
      };
    })
  };
}
