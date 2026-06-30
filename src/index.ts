/**
 * index.ts
 *
 * An MCP client that:
 *  1. Spawns and connects to an MCP server over stdio (src/example-server.ts by default).
 *  2. Lists the tools that server exposes.
 *  3. Bridges those tools to Claude via the Anthropic API, so Claude can call
 *     them as part of a multi-turn, tool-use conversation.
 *
 * Run with: npm run dev
 * Requires ANTHROPIC_API_KEY to be set (see .env.example).
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

const MODEL = "claude-sonnet-4-6";

class MCPClient {
  private anthropic: Anthropic;
  private mcp: Client;
  private transport: StdioClientTransport;
  private tools: Tool[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-starter", version: "1.0.0" });
    this.transport = new StdioClientTransport({
      command: "tsx",
      args: ["src/example-server.ts"],
    });
  }

  async connect() {
    await this.mcp.connect(this.transport);

    const toolsResult = await this.mcp.listTools();
    this.tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema as Tool["input_schema"],
    }));

    console.log(
      "Connected to MCP server. Available tools:",
      this.tools.map((t) => t.name).join(", ")
    );
  }

  async chat(userMessage: string): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    const finalTextParts: string[] = [];

    // Simple agent loop: keep going while Claude wants to use a tool.
    while (true) {
      const response = await this.anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages,
        tools: this.tools,
      });

      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      for (const block of response.content) {
        if (block.type === "text") {
          finalTextParts.push(block.text);
        }
      }

      if (toolUseBlocks.length === 0) {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.MessageParam["content"] = [];
      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== "tool_use") continue;
        console.log(`Calling tool: ${toolUse.name}`, toolUse.input);

        const result = await this.mcp.callTool({
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result.content),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return finalTextParts.join("\n");
  }

  async close() {
    await this.mcp.close();
  }
}

async function main() {
  const client = new MCPClient();
  try {
    await client.connect();

    const question =
      process.argv[2] ??
      "What time is it right now, and what is 12 * (4 + 3)?";

    console.log("\nUser:", question);
    const answer = await client.chat(question);
    console.log("\nClaude:", answer);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
