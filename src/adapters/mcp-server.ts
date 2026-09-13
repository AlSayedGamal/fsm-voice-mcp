import type { z } from "zod";

import type { FsmMcpBridge } from "../bridge.js";
import type { FsmMcpCallContext, McpToolResult } from "../types.js";

/**
 * Minimal structural shape of `@modelcontextprotocol/sdk`'s `McpServer`
 * (and the Alexa+ MCP Toolkit SDK, which follows the same `registerTool` /
 * `registerResource` contract). This file imports neither package — it only
 * needs the shape, so it compiles against whichever SDK build the host app
 * already depends on.
 */
export interface McpServerLike {
  registerTool(
    name: string,
    config: { title?: string; description: string; inputSchema: z.ZodObject<any> },
    handler: (args: Record<string, unknown>, extra?: unknown) => Promise<McpToolResult>,
  ): unknown;
  registerResource(
    name: string,
    uri: string,
    config: { description?: string; mimeType?: string },
    read: (
      uri: URL | string,
      extra?: unknown,
    ) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>,
  ): unknown;
}

export interface RegisterOptions {
  /** Derive the FsmMcpCallContext (e.g. a session id) from whatever "extra" the host SDK hands the tool/resource callback. */
  toCallContext?: (extra: unknown) => FsmMcpCallContext | undefined;
}

/** Register every tool and resource from an `FsmMcpBridge` onto a real MCP server instance. */
export function registerFsmMcpBridge(
  server: McpServerLike,
  bridge: FsmMcpBridge<any>,
  options: RegisterOptions = {},
): void {
  const toCallContext = options.toCallContext ?? (() => undefined);

  for (const tool of bridge.tools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      (args, extra) => tool.handler(args, toCallContext(extra)),
    );
  }

  for (const resource of bridge.resources) {
    server.registerResource(
      resource.name,
      resource.uri,
      { description: resource.description, mimeType: resource.mimeType },
      (_uri, extra) => resource.read(toCallContext(extra)),
    );
  }
}
