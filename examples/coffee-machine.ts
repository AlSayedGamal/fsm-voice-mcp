import type { FsmConfig } from "../src/types.js";

export interface CoffeeContext {
  drink?: string;
  size?: string;
}

/**
 * A tiny order-taking machine, used by examples/server.ts and the README.
 * The same config could drive a UI wizard (idle -> ordering -> brewing ->
 * done screens) once UI-schema generation lands — see the README roadmap.
 */
export const coffeeMachine: FsmConfig<CoffeeContext> = {
  id: "coffee",
  initial: "idle",
  context: {},
  states: {
    idle: {
      meta: { prompt: "Ready to take your order." },
      on: {
        ORDER: {
          target: "ordering",
          actions: (_ctx, event) => ({
            drink: typeof event.drink === "string" ? event.drink : "coffee",
            size: typeof event.size === "string" ? event.size : "medium",
          }),
        },
      },
    },
    ordering: {
      meta: { prompt: "Got it. Ready to confirm or cancel." },
      on: {
        CONFIRM: "brewing",
        CANCEL: "idle",
      },
    },
    brewing: {
      meta: { prompt: "Brewing your drink now." },
      on: {
        READY: "done",
      },
    },
    done: {
      final: true,
      meta: { prompt: "Your drink is ready. Enjoy!" },
    },
  },
};
