import type { FsmConfig, FsmEvent, FsmSendResult, FsmSnapshot } from "./types.js";

export interface FsmActor<TContext extends object> {
  getSnapshot(): FsmSnapshot<TContext>;
  send(event: FsmEvent): FsmSendResult<TContext>;
  reset(): void;
}

function availableEvents<TContext extends object>(
  config: FsmConfig<TContext>,
  stateValue: string,
): string[] {
  const state = config.states[stateValue];
  if (!state || state.final) return [];
  return Object.keys(state.on ?? {});
}

function snapshotOf<TContext extends object>(
  config: FsmConfig<TContext>,
  value: string,
  context: TContext,
): FsmSnapshot<TContext> {
  return {
    value,
    context,
    availableEvents: availableEvents(config, value),
    done: Boolean(config.states[value]?.final),
  };
}

/**
 * A minimal, dependency-free interpreter for the FsmConfig subset of
 * XState's config shape (see types.ts for exactly what's supported).
 * Kept intentionally small so the transition logic driving both voice
 * tools and (eventually) UI state is easy to audit and has no runtime
 * dependency on any particular version of XState.
 */
export function createFsmActor<TContext extends object>(
  config: FsmConfig<TContext>,
): FsmActor<TContext> {
  if (!config.states[config.initial]) {
    throw new Error(`fsm-voice-mcp: initial state "${config.initial}" is not defined in states`);
  }

  const initialContext = structuredClone(config.context ?? ({} as TContext));
  let value = config.initial;
  let context = structuredClone(initialContext);

  function getSnapshot(): FsmSnapshot<TContext> {
    return snapshotOf(config, value, context);
  }

  function send(event: FsmEvent): FsmSendResult<TContext> {
    const stateConfig = config.states[value];
    const transition = stateConfig?.on?.[event.type];

    if (!stateConfig || stateConfig.final || !transition) {
      return { ok: false, reason: "no-transition", snapshot: getSnapshot() };
    }

    const normalized = typeof transition === "string" ? { target: transition } : transition;

    if (normalized.guard && !normalized.guard(context, event)) {
      return { ok: false, reason: "guard-rejected", snapshot: getSnapshot() };
    }

    const patch = normalized.actions?.(context, event);
    if (patch) {
      context = { ...context, ...patch };
    }

    if (normalized.target) {
      if (!config.states[normalized.target]) {
        throw new Error(
          `fsm-voice-mcp: transition "${event.type}" from "${value}" targets undefined state "${normalized.target}"`,
        );
      }
      value = normalized.target;
    }

    return { ok: true, snapshot: getSnapshot() };
  }

  function reset(): void {
    value = config.initial;
    context = structuredClone(initialContext);
  }

  return { getSnapshot, send, reset };
}

/** Every event type declared anywhere in the machine, mapped to the state(s) it fires from. Used to generate one MCP tool per event. */
export function collectEventTypes<TContext extends object>(
  config: FsmConfig<TContext>,
): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  for (const [stateName, stateConfig] of Object.entries(config.states)) {
    for (const eventType of Object.keys(stateConfig.on ?? {})) {
      const list = sources.get(eventType) ?? [];
      list.push(stateName);
      sources.set(eventType, list);
    }
  }
  return sources;
}
