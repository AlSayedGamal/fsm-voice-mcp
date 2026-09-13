import assert from "node:assert/strict";
import { test } from "node:test";

import { createFsmActor } from "../src/interpreter.js";
import type { FsmConfig } from "../src/types.js";

interface Ctx {
  count: number;
}

const config: FsmConfig<Ctx> = {
  initial: "off",
  context: { count: 0 },
  states: {
    off: { on: { TOGGLE: "on" } },
    on: {
      on: {
        TOGGLE: "off",
        BUMP: { actions: (ctx) => ({ count: ctx.count + 1 }) },
      },
    },
  },
};

test("transitions on a matching event", () => {
  const actor = createFsmActor(config);
  const result = actor.send({ type: "TOGGLE" });
  assert.equal(result.ok, true);
  assert.equal(actor.getSnapshot().value, "on");
});

test("rejects an event with no transition from the current state", () => {
  const actor = createFsmActor(config);
  const result = actor.send({ type: "BUMP" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no-transition");
});

test("an internal transition (no target) runs actions without changing state", () => {
  const actor = createFsmActor(config);
  actor.send({ type: "TOGGLE" });
  actor.send({ type: "BUMP" });
  const snapshot = actor.getSnapshot();
  assert.equal(snapshot.value, "on");
  assert.equal(snapshot.context.count, 1);
});

test("a guard blocks the transition when it returns false", () => {
  const guarded: FsmConfig<Ctx> = {
    initial: "off",
    context: { count: 0 },
    states: {
      off: { on: { TOGGLE: { target: "on", guard: (ctx) => ctx.count > 0 } } },
      on: {},
    },
  };
  const actor = createFsmActor(guarded);
  const result = actor.send({ type: "TOGGLE" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "guard-rejected");
});

test("a final state reports done and offers no further events", () => {
  const withFinal: FsmConfig<Ctx> = {
    initial: "off",
    context: { count: 0 },
    states: {
      off: { on: { TOGGLE: "on" } },
      on: { final: true },
    },
  };
  const actor = createFsmActor(withFinal);
  actor.send({ type: "TOGGLE" });
  const snapshot = actor.getSnapshot();
  assert.equal(snapshot.done, true);
  assert.deepEqual(snapshot.availableEvents, []);
});

test("reset returns the actor to its initial snapshot", () => {
  const actor = createFsmActor(config);
  actor.send({ type: "TOGGLE" });
  actor.reset();
  assert.equal(actor.getSnapshot().value, "off");
  assert.equal(actor.getSnapshot().context.count, 0);
});
