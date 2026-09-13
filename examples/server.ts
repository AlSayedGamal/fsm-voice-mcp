/**
 * Wires the coffee-machine FSM into a real Streamable HTTP MCP server using
 * the official `@modelcontextprotocol/sdk`. Run with `npm run example:server`,
 * then point MCP Inspector (or an Alexa+ add-on) at http://127.0.0.1:3100/mcp.
 *
 * The `registerFsmMcpBridge` adapter is structurally typed (see
 * src/adapters/mcp-server.ts) — it works the same against the Alexa+ MCP
 * Toolkit's SDK package, since both follow the `registerTool` /
 * `registerResource` contract from the MCP spec.
 */
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import { createFsmMcpBridge, registerFsmMcpBridge } from "../src/index.js";
import { coffeeMachine, type CoffeeContext } from "./coffee-machine.js";

const bridge = createFsmMcpBridge<CoffeeContext>(coffeeMachine, {
  eventSchemas: {
    ORDER: z.object({
      drink: z.string().optional().describe("Drink name, e.g. latte"),
      size: z.enum(["small", "medium", "large"]).optional(),
    }),
  },
});

function createServer(): McpServer {
  const server = new McpServer({ name: "fsm-voice-mcp-coffee-example", version: "0.1.0" });
  registerFsmMcpBridge(server, bridge);
  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => {
  console.log(`fsm-voice-mcp coffee example listening on http://127.0.0.1:${port}/mcp`);
});
