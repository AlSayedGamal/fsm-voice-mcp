import assert from "node:assert/strict";
import { test } from "node:test";

import { createFsmMcpBridge } from "../src/bridge.js";
import { createFsmActor } from "../src/interpreter.js";
import { fsmFromStatusGraph } from "../src/import.js";

interface TicketContext {
  prUrl?: string;
}

function buildWorkflow() {
  return fsmFromStatusGraph<TicketContext>({
    id: "ticket",
    initial: "todo",
    context: {},
    graph: {
      todo: ["in_progress"],
      in_progress: ["to_review"],
      to_review: ["approved", "todo"],
      approved: ["done"],
      done: [],
    },
    prompts: { to_review: "In review. A draft pull request is up." },
    onEnter: {
      to_review: async () => ({ prUrl: "https://example.com/pull/1" }),
    },
  });
}

test("generates one event per reachable destination status", () => {
  const config = buildWorkflow();
  assert.deepEqual(Object.keys(config.states).sort(), [
    "approved",
    "done",
    "in_progress",
    "to_review",
    "todo",
  ]);
  assert.deepEqual(Object.keys(config.states.to_review.on ?? {}).sort(), [
    "MOVE_TO_APPROVED",
    "MOVE_TO_TODO",
  ]);
});

test("a status with no outgoing edges is final", () => {
  const config = buildWorkflow();
  assert.equal(config.states.done.final, true);
  assert.equal(config.states.todo.final, false);
});

test("rejects an unknown target status", () => {
  assert.throws(() =>
    fsmFromStatusGraph({
      initial: "todo",
      graph: { todo: ["nowhere"] },
    }),
  );
});

test("entering to_review awaits its side effect before the transition completes", async () => {
  const actor = createFsmActor(buildWorkflow());
  await actor.send({ type: "MOVE_TO_IN_PROGRESS" });
  const result = await actor.send({ type: "MOVE_TO_TO_REVIEW" });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.value, "to_review");
    assert.equal(result.snapshot.context.prUrl, "https://example.com/pull/1");
  }
});

test("the reject path (to_review -> todo) is a normal generated event", async () => {
  const bridge = createFsmMcpBridge(buildWorkflow());
  await bridge.tools.find((t) => t.name === "ticket_move_to_in_progress")!.handler({});
  await bridge.tools.find((t) => t.name === "ticket_move_to_to_review")!.handler({});

  const reject = await bridge.tools.find((t) => t.name === "ticket_move_to_todo")!.handler({});

  assert.equal(bridge.getSnapshot().value, "todo");
  assert.match(reject.content[0].text, /In the backlog|Now in "todo"/);
});
