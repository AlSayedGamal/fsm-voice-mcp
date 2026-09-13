import type { z } from "zod";

/** A finite-state-machine event. Mirrors XState's event shape: a `type` discriminator plus optional payload fields. */
export type FsmEvent = { type: string; [key: string]: unknown };

/** A transition out of a state, in the same shape XState uses for `on: { EVENT: ... }`. */
export type FsmTransition<TContext extends object> =
  | string
  | {
      /** Target state name. Omit for an internal transition (actions run, state stays put). */
      target?: string;
      /** Only take this transition if the guard returns true. Mirrors XState's `guard`. */
      guard?: (context: TContext, event: FsmEvent) => boolean;
      /**
       * Merge the returned partial context after the transition. A
       * simplified, single-function `assign` — may return a Promise, so a
       * transition can run a real side effect (call an API, push a draft
       * PR) and fold its result into context before the voice reply is sent.
       */
      actions?: (
        context: TContext,
        event: FsmEvent,
      ) => Partial<TContext> | void | Promise<Partial<TContext> | void>;
    };

export interface FsmStateConfig<TContext extends object> {
  on?: Record<string, FsmTransition<TContext>>;
  /** Marks a terminal state; no further transitions are offered. */
  final?: boolean;
  meta?: {
    /** Spoken description of this state, used as the default voice response. */
    prompt?: string;
    [key: string]: unknown;
  };
}

/**
 * A finite state machine definition. A deliberate subset of XState's config
 * shape: flat states, `on` transitions, `guard`, and a simplified `actions`
 * that merges a returned partial context. No nested/parallel states and no
 * invoked services in this version — see the README roadmap.
 */
export interface FsmConfig<TContext extends object = Record<string, never>> {
  id?: string;
  initial: string;
  context?: TContext;
  states: Record<string, FsmStateConfig<TContext>>;
}

export interface FsmSnapshot<TContext extends object> {
  value: string;
  context: TContext;
  /** Event types the current state declares a transition for (guards are not evaluated for this list). */
  availableEvents: string[];
  done: boolean;
}

export type FsmSendResult<TContext extends object> =
  | { ok: true; snapshot: FsmSnapshot<TContext> }
  | { ok: false; reason: "no-transition" | "guard-rejected"; snapshot: FsmSnapshot<TContext> };

/** Named side effect for `fsmFromStatusGraph`'s `onEnter` map. Same shape as a transition's `actions`. */
export type FsmEnterEffect<TContext extends object> = (
  context: TContext,
  event: FsmEvent,
) => Partial<TContext> | void | Promise<Partial<TContext> | void>;

/** Per tool-call context an adapter can pass through, e.g. to key sessions by caller. */
export interface FsmMcpCallContext {
  sessionId?: string;
  [key: string]: unknown;
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
  /** Real MCP SDKs type their tool-result callback return value with an index signature; keep this assignable to it. */
  [key: string]: unknown;
}

export interface McpToolSpec {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: Record<string, unknown>, ctx?: FsmMcpCallContext) => Promise<McpToolResult>;
}

export interface McpResourceSpec {
  name: string;
  uri: string;
  description: string;
  mimeType: string;
  read: (
    ctx?: FsmMcpCallContext,
  ) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>;
}
