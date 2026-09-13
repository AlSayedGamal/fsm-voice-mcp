import type { FsmConfig, FsmEnterEffect, FsmStateConfig, FsmTransition } from "./types.js";

export interface StatusGraphInput<TContext extends object> {
  id?: string;
  /** Starting status name. Must be a key of `graph`. */
  initial: string;
  context?: TContext;
  /**
   * Adjacency form of a task-management workflow: status name -> the
   * statuses it can move to. This is the shape most systems already expose
   * or can be read as — a Jira workflow's transitions, a Trello board's
   * lists-with-allowed-moves, a Linear/GitHub Projects workflow. A status
   * with an empty array is treated as terminal (`final: true`).
   */
  graph: Record<string, string[]>;
  /** Spoken description for a status, used as that state's `meta.prompt`. */
  prompts?: Record<string, string>;
  /**
   * Side effect to run when a given status is entered, keyed by status
   * name — e.g. push a draft PR on entering "to_review". Runs for every
   * transition landing on that status, regardless of where it came from.
   * May be async; its result is merged into context before the voice
   * reply is built (see `actions` on FsmTransition).
   */
  onEnter?: Record<string, FsmEnterEffect<TContext>>;
  /** Name the MCP event/tool for moving into a given status. Default: `MOVE_TO_<STATUS_UPPER_SNAKE>`. */
  eventName?: (status: string) => string;
}

const defaultEventName = (status: string): string =>
  `MOVE_TO_${status.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

/**
 * Build an `FsmConfig` from a task-management workflow expressed as a
 * status adjacency graph, rather than hand-writing states/transitions.
 * One event (and so one MCP tool) is generated per destination status,
 * valid from every status that graph lists it as reachable from — e.g.
 * `{ to_review: ["approved", "todo"] }` yields `MOVE_TO_APPROVED` and
 * `MOVE_TO_TODO`, both fired from `to_review`.
 */
export function fsmFromStatusGraph<TContext extends object>(
  input: StatusGraphInput<TContext>,
): FsmConfig<TContext> {
  if (!(input.initial in input.graph)) {
    throw new Error(
      `fsm-voice-mcp: initial status "${input.initial}" is not a key of graph`,
    );
  }

  const eventName = input.eventName ?? defaultEventName;
  const states: Record<string, FsmStateConfig<TContext>> = {};

  for (const [status, nextStatuses] of Object.entries(input.graph)) {
    for (const next of nextStatuses) {
      if (!(next in input.graph)) {
        throw new Error(
          `fsm-voice-mcp: status "${status}" lists unknown target "${next}"`,
        );
      }
    }

    const on: Record<string, FsmTransition<TContext>> = {};
    for (const next of nextStatuses) {
      on[eventName(next)] = { target: next, actions: input.onEnter?.[next] };
    }

    states[status] = {
      final: nextStatuses.length === 0,
      on: Object.keys(on).length > 0 ? on : undefined,
      meta: input.prompts?.[status] ? { prompt: input.prompts[status] } : undefined,
    };
  }

  return { id: input.id, initial: input.initial, context: input.context, states };
}
