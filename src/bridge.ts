import { z } from "zod";

import { collectEventTypes, createFsmActor, type FsmActor } from "./interpreter.js";
import type {
  FsmConfig,
  FsmMcpCallContext,
  FsmSnapshot,
  McpResourceSpec,
  McpToolResult,
  McpToolSpec,
} from "./types.js";

export interface FsmMcpOptions<TContext extends object> {
  /**
   * Derive a stable session key from tool-call context. Default: one shared
   * "default" session — fine for a single-user demo, not for a multi-tenant
   * server. Pass this when your MCP transport gives you a per-caller id.
   */
  getSessionId?: (ctx?: FsmMcpCallContext) => string;
  /** Build the MCP tool name for an event type. Default: lower_snake_case, prefixed with `config.id` if set. */
  toolName?: (eventType: string) => string;
  /** Zod object schema for an event's payload. Events without an entry accept no arguments. */
  eventSchemas?: Record<string, z.ZodObject<any>>;
  /** Human/voice description for an event's tool. Default mentions the states it fires from. */
  describeTool?: (eventType: string, fromStates: string[]) => string;
  /** Speakable description of a snapshot. Default: the target state's `meta.prompt`, else a generic sentence, plus available actions. */
  describeState?: (snapshot: FsmSnapshot<TContext>) => string;
  /** URI for the generated "current state" MCP resource. Pass `null` to skip generating it. Default `fsm://state`. */
  stateResourceUri?: string | null;
}

export interface FsmMcpBridge<TContext extends object> {
  tools: McpToolSpec[];
  resources: McpResourceSpec[];
  getSnapshot(ctx?: FsmMcpCallContext): FsmSnapshot<TContext>;
  reset(ctx?: FsmMcpCallContext): void;
}

const defaultSessionId = () => "default";

function defaultToolName(id: string | undefined, eventType: string): string {
  const base = eventType
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
  return id ? `${id}_${base}` : base;
}

function defaultDescribeTool(eventType: string, fromStates: string[]): string {
  return `Send the "${eventType}" event. Available from: ${fromStates.join(", ")}.`;
}

function defaultDescribeState<TContext extends object>(
  snapshot: FsmSnapshot<TContext>,
  prompt: string | undefined,
): string {
  const base = prompt ?? `Now in "${snapshot.value}".`;
  if (snapshot.done || snapshot.availableEvents.length === 0) return base;
  return `${base} You can: ${snapshot.availableEvents.join(", ")}.`;
}

/**
 * Turn one FSM definition into a set of MCP tools (one per event type) and
 * an MCP resource exposing the live snapshot — so the same state machine
 * that drives your UI can be driven by voice through Alexa+'s MCP Toolkit.
 */
export function createFsmMcpBridge<TContext extends object>(
  config: FsmConfig<TContext>,
  options: FsmMcpOptions<TContext> = {},
): FsmMcpBridge<TContext> {
  const getSessionId = options.getSessionId ?? defaultSessionId;
  const stateResourceUri =
    options.stateResourceUri === undefined ? "fsm://state" : options.stateResourceUri;

  const actors = new Map<string, FsmActor<TContext>>();
  function actorFor(ctx?: FsmMcpCallContext): FsmActor<TContext> {
    const sessionId = getSessionId(ctx);
    let actor = actors.get(sessionId);
    if (!actor) {
      actor = createFsmActor(config);
      actors.set(sessionId, actor);
    }
    return actor;
  }

  function speak(snapshot: FsmSnapshot<TContext>): string {
    const prompt = config.states[snapshot.value]?.meta?.prompt;
    return options.describeState
      ? options.describeState(snapshot)
      : defaultDescribeState(snapshot, prompt);
  }

  const eventSources = collectEventTypes(config);
  const tools: McpToolSpec[] = [...eventSources.entries()].map(([eventType, fromStates]) => {
    const name = (options.toolName ?? ((e: string) => defaultToolName(config.id, e)))(eventType);
    const description = (options.describeTool ?? defaultDescribeTool)(eventType, fromStates);
    const inputSchema = options.eventSchemas?.[eventType] ?? z.object({});

    const handler = async (
      args: Record<string, unknown>,
      ctx?: FsmMcpCallContext,
    ): Promise<McpToolResult> => {
      const actor = actorFor(ctx);
      const before = actor.getSnapshot();
      const result = actor.send({ type: eventType, ...args });

      if (result.ok) {
        return { content: [{ type: "text", text: speak(result.snapshot) }] };
      }

      const reason =
        result.reason === "guard-rejected"
          ? `You can't ${eventType} right now.`
          : `"${eventType}" isn't available from "${before.value}".`;
      const hint = before.availableEvents.length
        ? ` Try: ${before.availableEvents.join(", ")}.`
        : "";
      return { content: [{ type: "text", text: `${reason}${hint}` }] };
    };

    return { name, description, inputSchema, handler };
  });

  const resources: McpResourceSpec[] = [];
  if (stateResourceUri) {
    resources.push({
      name: "fsm_state",
      uri: stateResourceUri,
      description: "Current finite-state-machine state, context, and available actions.",
      mimeType: "application/json",
      read: async (ctx) => {
        const snapshot = actorFor(ctx).getSnapshot();
        return {
          contents: [
            {
              uri: stateResourceUri,
              mimeType: "application/json",
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      },
    });
  }

  return {
    tools,
    resources,
    getSnapshot: (ctx) => actorFor(ctx).getSnapshot(),
    reset: (ctx) => actorFor(ctx).reset(),
  };
}
