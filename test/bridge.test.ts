import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import { createFsmMcpBridge } from "../src/bridge.js";
import type { FsmConfig } from "../src/types.js";

interface Ctx {
  drink?: string;
}

const config: FsmConfig<Ctx> = {
  id: "coffee",
  initial: "idle",
  context: {},
  states: {
    idle: {
      meta: { prompt: "Ready to order." },
      on: {
        ORDER: {
          target: "ordering",
          actions: (_ctx, event) => ({ drink: event.drink as string | undefined }),
        },
      },
    },
    ordering: {
      meta: { prompt: "Order placed." },
      on: { CONFIRM: "done" },
    },
    done: { final: true, meta: { prompt: "All set." } },
  },
};

test("generates one MCP tool per event type declared anywhere in the machine", () => {
  const bridge = createFsmMcpBridge(config);
  const names = bridge.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["coffee_confirm", "coffee_order"]);
});

test("a tool handler transitions the shared session and speaks the new state", async () => {
  const bridge = createFsmMcpBridge<Ctx>(config, {
    eventSchemas: { ORDER: z.object({ drink: z.string().optional() }) },
  });
  const orderTool = bridge.tools.find((t) => t.name === "coffee_order")!;

  const result = await orderTool.handler({ drink: "latte" });

  assert.match(result.content[0].text, /Order placed/);
  assert.equal(bridge.getSnapshot().value, "ordering");
  assert.equal(bridge.getSnapshot().context.drink, "latte");
});

test("rejects an event that isn't valid from the current state, with a hint", async () => {
  const bridge = createFsmMcpBridge<Ctx>(config);
  const confirmTool = bridge.tools.find((t) => t.name === "coffee_confirm")!;

  const result = await confirmTool.handler({});

  assert.match(result.content[0].text, /isn't available/);
  assert.match(result.content[0].text, /Try: ORDER/);
});

test("keeps sessions independent when getSessionId is provided", async () => {
  const bridge = createFsmMcpBridge<Ctx>(config, {
    getSessionId: (ctx) => ctx?.sessionId ?? "default",
  });
  const orderTool = bridge.tools.find((t) => t.name === "coffee_order")!;

  await orderTool.handler({ drink: "espresso" }, { sessionId: "alice" });

  assert.equal(bridge.getSnapshot({ sessionId: "alice" }).value, "ordering");
  assert.equal(bridge.getSnapshot({ sessionId: "bob" }).value, "idle");
});

test("exposes the current state as an MCP resource by default", async () => {
  const bridge = createFsmMcpBridge<Ctx>(config);
  const resource = bridge.resources.find((r) => r.uri === "fsm://state")!;

  const { contents } = await resource.read();
  const parsed = JSON.parse(contents[0].text);

  assert.equal(parsed.value, "idle");
  assert.deepEqual(parsed.availableEvents, ["ORDER"]);
});

test("stateResourceUri: null skips generating the resource", () => {
  const bridge = createFsmMcpBridge<Ctx>(config, { stateResourceUri: null });
  assert.deepEqual(bridge.resources, []);
});
