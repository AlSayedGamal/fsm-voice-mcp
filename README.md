# fsm-voice-mcp

One finite state machine, exposed as voice-driven **MCP tools and
resources** — designed to be compatible with [Alexa+'s MCP
Toolkit](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
(spec 2025-11-25+, Streamable HTTP) and any other MCP client.

Most voice apps hand-write a pile of intents that duplicate the state
graph a UI already encodes. This library goes the other way: define the
state machine once, in an XState-compatible config shape, and generate the
MCP tool/resource surface from it. A UI-schema generator from the same
config is on the [roadmap](#roadmap) — the point is one source of truth
for "what can happen next," spoken or tapped.

## Install

```bash
npm install fsm-voice-mcp
```

Node 20+, ESM only.

## Quick example

```ts
import { z } from "zod";
import { createFsmMcpBridge } from "fsm-voice-mcp";
import type { FsmConfig } from "fsm-voice-mcp";

interface CoffeeContext {
  drink?: string;
}

const coffeeMachine: FsmConfig<CoffeeContext> = {
  id: "coffee",
  initial: "idle",
  context: {},
  states: {
    idle: {
      meta: { prompt: "Ready to take your order." },
      on: {
        ORDER: {
          target: "ordering",
          actions: (_ctx, event) => ({ drink: event.drink as string }),
        },
      },
    },
    ordering: {
      meta: { prompt: "Got it. Ready to confirm or cancel." },
      on: { CONFIRM: "brewing", CANCEL: "idle" },
    },
    brewing: {
      meta: { prompt: "Brewing your drink now." },
      on: { READY: "done" },
    },
    done: { final: true, meta: { prompt: "Your drink is ready. Enjoy!" } },
  },
};

const bridge = createFsmMcpBridge(coffeeMachine, {
  eventSchemas: {
    ORDER: z.object({ drink: z.string().optional() }),
  },
});

// bridge.tools    -> [{ name: "coffee_order", ... }, { name: "coffee_confirm", ... }, ...]
// bridge.resources -> [{ uri: "fsm://state", ... }]  (current state + context, as JSON)
```

`bridge.tools` is framework-agnostic — each entry is `{ name, description,
inputSchema, handler }` where `inputSchema` is a Zod object and `handler`
returns `{ content: [{ type: "text", text }] }`. Wire it into any MCP
server by hand, or use the bundled adapter:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFsmMcpBridge } from "fsm-voice-mcp";

const server = new McpServer({ name: "coffee-shop", version: "0.1.0" });
registerFsmMcpBridge(server, bridge);
```

See [`examples/server.ts`](./examples/server.ts) for a full Streamable
HTTP server you can point MCP Inspector or an Alexa+ add-on at:

```bash
npm install
npm run example:server
# MCP endpoint: http://127.0.0.1:3100/mcp
```

## How it maps the machine to voice

- **One MCP tool per event type.** Every event named in any state's `on`
  block becomes a tool (default name: `<machine id>_<event, snake_case>`).
  Calling it sends that event to the machine.
- **Guards are enforced at call time, not hidden from the tool list.** A
  tool exists even if the current state can't take it right now; calling
  it then explains why not and lists what *is* available — the same
  shape a voice UI needs ("You can't confirm right now. Try: order.").
- **State drives the spoken response.** Each state's `meta.prompt` (or a
  generated default) becomes the tool's reply after a successful
  transition, plus a list of the next available actions.
- **Current state is also an MCP resource** (`fsm://state` by default) —
  JSON snapshot of `{ value, context, availableEvents, done }`, so a
  client can ground itself without guessing from tool replies.
- **Sessions are pluggable.** By default all calls share one machine
  instance; pass `getSessionId` to key a separate instance per caller
  (e.g. per Alexa+ conversation).

## What "XState-compatible" means here

`FsmConfig` mirrors the shape of an XState config — `initial`, `context`,
`states: { on: { EVENT: { target, guard, actions } } }` — closely enough
that reading one is reading the other. It is deliberately a **subset**:

- Flat states only — no nested/parallel/history states.
- `actions` is a single function returning a partial context to merge
  (a simplified `assign`), not XState's full action/effect model.
- No invoked services, delays, or `always` transitions.

The interpreter is hand-rolled and has zero runtime dependencies beyond
`zod` — it does not require the `xstate` package. If your app already
uses real XState machines, adapt `machine.config` (or the relevant
subset) into an `FsmConfig` at the boundary; a direct adapter for
`createMachine`-produced machines is on the roadmap.

## API

- `createFsmMcpBridge(config, options?) -> { tools, resources, getSnapshot, reset }`
- `createFsmActor(config) -> { getSnapshot, send, reset }` — the interpreter, if you want to drive the machine directly (e.g. from a UI) without going through MCP.
- `collectEventTypes(config) -> Map<eventType, stateNames[]>`
- `registerFsmMcpBridge(server, bridge, options?)` — adapter for any MCP server exposing `registerTool` / `registerResource` (works with `@modelcontextprotocol/sdk` and the Alexa+ MCP Toolkit SDK).

See [`src/types.ts`](./src/types.ts) for full type definitions and
[`test/`](./test) for executable usage examples.

## Roadmap

- **UI-schema generation** from the same `FsmConfig` — a JSON screen
  description or React component tree keyed by state, so the voice tools
  and the UI never drift apart.
- Voice prompt/utterance generation separate from raw tool descriptions
  (sample utterances per event, for VUI design/testing).
- Nested and parallel states.
- Mermaid/diagram export for docs and demos.
- A direct adapter from real `xstate` `createMachine` instances.

Issues and PRs welcome — this started as the open-source half of a
[Build, Ship, Shape: Amazon Developer
Hackathon](https://amazonappdev2026.devpost.com/) Alexa+ project and is
meant to stand on its own.

## License

[MIT](./LICENSE)
