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

test("transitions on a matching event", async () => {
  const actor = createFsmActor(config);
  const result = await actor.send({ type: "TOGGLE" });
  assert.equal(result.ok, true);
  assert.equal(actor.getSnapshot().value, "on");
});

test("rejects an event with no transition from the current state", async () => {
  const actor = createFsmActor(config);
  const result = await actor.send({ type: "BUMP" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no-transition");
});

test("an internal transition (no target) runs actions without changing state", async () => {
  const actor = createFsmActor(config);
  await actor.send({ type: "TOGGLE" });
  await actor.send({ type: "BUMP" });
  const snapshot = actor.getSnapshot();
  assert.equal(snapshot.value, "on");
  assert.equal(snapshot.context.count, 1);
});

test("a guard blocks the transition when it returns false", async () => {
  const guarded: FsmConfig<Ctx> = {
    initial: "off",
    context: { count: 0 },
    states: {
      off: { on: { TOGGLE: { target: "on", guard: (ctx) => ctx.count > 0 } } },
      on: {},
    },
  };
  const actor = createFsmActor(guarded);
  const result = await actor.send({ type: "TOGGLE" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "guard-rejected");
});

test("a final state reports done and offers no further events", async () => {
  const withFinal: FsmConfig<Ctx> = {
    initial: "off",
    context: { count: 0 },
    states: {
      off: { on: { TOGGLE: "on" } },
      on: { final: true },
    },
  };
  const actor = createFsmActor(withFinal);
  await actor.send({ type: "TOGGLE" });
  const snapshot = actor.getSnapshot();
  assert.equal(snapshot.done, true);
  assert.deepEqual(snapshot.availableEvents, []);
});

test("reset returns the actor to its initial snapshot", async () => {
  const actor = createFsmActor(config);
  await actor.send({ type: "TOGGLE" });
  actor.reset();
  assert.equal(actor.getSnapshot().value, "off");
  assert.equal(actor.getSnapshot().context.count, 0);
});

test("actions may be async; the resulting context waits for it", async () => {
  interface AsyncCtx {
    fetched?: string;
  }
  const asyncConfig: FsmConfig<AsyncCtx> = {
    initial: "idle",
    context: {},
    states: {
      idle: {
        on: {
          FETCH: {
            target: "done",
            actions: async () => {
              await new Promise((resolve) => setTimeout(resolve, 1));
              return { fetched: "value" };
            },
          },
        },
      },
      done: { final: true },
    },
  };
  const actor = createFsmActor(asyncConfig);
  const result = await actor.send({ type: "FETCH" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.snapshot.context.fetched, "value");
});
