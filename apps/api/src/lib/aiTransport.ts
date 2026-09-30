import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env.js";

type Completion = { content: Array<{ type: "text"; text: string } | { type: "tool_use"; input: unknown }> };
const client = env.aiProvider === "anthropic" && env.aiApiKey ? new Anthropic({ apiKey: env.aiApiKey }) : null;
const geminiResponse = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({ function: z.object({ name: z.string(), arguments: z.string() }) })).optional(),
    }),
  })),
});

/** Shared transport: vendor credentials stay on the API server. No paid-provider failover. */
export async function requestAI(params: Anthropic.MessageCreateParamsNonStreaming, options: { timeout: number }): Promise<Completion> {
  if (env.aiProvider === "anthropic") {
    if (!client) throw new Error("AI is not configured");
    const result = await client.messages.create(params, options);
    return { content: result.content.flatMap((block): Completion["content"] => {
      if (block.type === "text") return [{ type: "text", text: block.text }];
      if (block.type === "tool_use") return [{ type: "tool_use", input: block.input }];
      return [];
    }) };
  }
  if (!env.aiApiKey) throw new Error("AI is not configured");
  const tools = params.tools?.map((tool) => ({ type: "function", function: {
    name: tool.name, description: tool.description, parameters: tool.input_schema,
  } }));
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.aiApiKey}` },
    signal: AbortSignal.timeout(options.timeout),
    body: JSON.stringify({
      model: env.aiModel,
      max_tokens: params.max_tokens,
      messages: [{ role: "system", content: params.system }, ...params.messages],
      ...(tools ? { tools, tool_choice: { type: "function", function: { name: "record_intent" } } } : {}),
    }),
  });
  // Do not log the response body or request headers: either may contain private data.
  if (!response.ok) throw new Error(`AI request failed (HTTP ${response.status})`);
  const message = geminiResponse.parse(await response.json()).choices[0]?.message;
  const content: Completion["content"] = [];
  if (message?.content) content.push({ type: "text", text: message.content });
  for (const call of message?.tool_calls ?? []) {
    if (call.function.name === "record_intent") content.push({ type: "tool_use", input: JSON.parse(call.function.arguments) });
  }
  return { content };
}
