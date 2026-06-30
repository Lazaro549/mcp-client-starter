/**
 * example-server.ts
 *
 * A minimal MCP server exposing a couple of demo tools:
 *  - get_current_time: returns the current server time
 *  - calculate: evaluates a simple arithmetic expression
 *
 * Run with: npm run server
 * It communicates over stdio, which is what the client in src/index.ts expects.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "example-mcp-server",
  version: "1.0.0",
});

server.tool(
  "get_current_time",
  "Returns the current date and time on the server.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: new Date().toISOString(),
        },
      ],
    };
  }
);

server.tool(
  "calculate",
  "Evaluates a simple arithmetic expression, e.g. '2 + 2 * 3'.",
  {
    expression: z.string().describe("The arithmetic expression to evaluate"),
  },
  async ({ expression }) => {
    try {
      // NOTE: this uses a restricted Function constructor purely for demo
      // purposes. Do not use eval-like patterns like this with untrusted
      // input in production code.
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Could not evaluate expression: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Example MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
