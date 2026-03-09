/**
 * Call the Anthropic Claude API using a subscription bearer token.
 *
 * Required headers for OAuth/setup-token mode:
 *   Authorization: Bearer sk-ant-oat-...
 *   anthropic-version: 2023-06-01
 *   anthropic-beta: claude-code-20250219,oauth-2025-04-20
 *
 * Source: openclaw/src/agents/pi-embedded-runner/extra-params.ts
 */
import Anthropic from "@anthropic-ai/sdk";

export type AnthropicCallOptions = {
  /** Bearer token (sk-ant-oat-...) from resolveToken("anthropic"). */
  token: string;
  /** Model ID, e.g. "claude-opus-4-5", "claude-sonnet-4-5". */
  model: string;
  /** User prompt text. */
  prompt: string;
  /** Max tokens to generate (default: 1024). */
  maxTokens?: number;
};

export type AnthropicCallResult = {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

/**
 * Send a single-turn message to Claude using a subscription token.
 * Streams and collects the full response text.
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<AnthropicCallResult> {
  const { token, model, prompt, maxTokens = 1024 } = options;

  // Use authToken to send Authorization: Bearer <token>
  // (as opposed to apiKey which sends x-api-key)
  const client = new Anthropic({
    authToken: token,
    defaultHeaders: {
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    },
  });

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content.find((block) => block.type === "text");
  const text = textContent?.type === "text" ? textContent.text : "";

  return {
    text,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
