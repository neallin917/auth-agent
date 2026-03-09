import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCodexBody,
  buildCodexHeaders,
  callCodex,
  extractAccountIdFromToken,
  CODEX_DEFAULT_MODEL,
} from "../src/llm/codex-call.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Encode a string to base64url (no padding). */
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Build a minimal but structurally-valid JWT for testing. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  return `${header}.${body}.fake_sig`;
}

/** Build a ReadableStream<Uint8Array> from an array of SSE text chunks. */
function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

// ─── extractAccountIdFromToken ────────────────────────────────────────────────

describe("extractAccountIdFromToken", () => {
  it("returns accountId when JWT contains chatgpt_account_id", () => {
    const token = makeJwt({ sub: "user_123", chatgpt_account_id: "acc_abc" });
    expect(extractAccountIdFromToken(token)).toBe("acc_abc");
  });

  it("throws when token is not a valid JWT (not 3 segments)", () => {
    expect(() => extractAccountIdFromToken("not.a.valid.jwt.here")).toThrow(
      "Failed to extract accountId from token",
    );
  });

  it("throws when token has 3 segments but no dots make 2 dots", () => {
    expect(() => extractAccountIdFromToken("onlyone")).toThrow(
      "Failed to extract accountId from token",
    );
  });

  it("throws when JWT payload lacks chatgpt_account_id field", () => {
    const token = makeJwt({ sub: "user_123" }); // no chatgpt_account_id
    expect(() => extractAccountIdFromToken(token)).toThrow(
      "Failed to extract accountId from token",
    );
  });

  it("throws when chatgpt_account_id is an empty string", () => {
    const token = makeJwt({ chatgpt_account_id: "" });
    expect(() => extractAccountIdFromToken(token)).toThrow(
      "Failed to extract accountId from token",
    );
  });

  it("throws when chatgpt_account_id is a non-string type (e.g. number)", () => {
    const token = makeJwt({ chatgpt_account_id: 12345 });
    expect(() => extractAccountIdFromToken(token)).toThrow(
      "Failed to extract accountId from token",
    );
  });
});

// ─── buildCodexHeaders ────────────────────────────────────────────────────────

describe("buildCodexHeaders", () => {
  const token = makeJwt({ chatgpt_account_id: "acc_xyz" });

  it("sets authorization (lowercase) to Bearer {token}", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["authorization"]).toBe(`Bearer ${token}`);
  });

  it("sets chatgpt-account-id in all lowercase with extracted accountId", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["chatgpt-account-id"]).toBe("acc_xyz");
  });

  it("sets openai-beta (lowercase) to responses=experimental", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["openai-beta"]).toBe("responses=experimental");
  });

  it("sets originator to pi", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["originator"]).toBe("pi");
  });

  it("sets accept to text/event-stream", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["accept"]).toBe("text/event-stream");
  });

  it("sets content-type to application/json", () => {
    const headers = buildCodexHeaders(token);
    expect(headers["content-type"]).toBe("application/json");
  });

  it("all header keys are lowercase", () => {
    const headers = buildCodexHeaders(token);
    for (const key of Object.keys(headers)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("does NOT include old mixed-case ChatGPT-Account-Id header", () => {
    const headers = buildCodexHeaders(token);
    expect(Object.keys(headers)).not.toContain("ChatGPT-Account-Id");
  });

  it("uses explicit accountId when provided, skipping JWT extraction", () => {
    // A plain opaque token (not a JWT) + explicit accountId should work fine
    const opaqueToken = "opaque-access-token-no-jwt-claims";
    const headers = buildCodexHeaders(opaqueToken, "explicit-account-id-123");
    expect(headers["chatgpt-account-id"]).toBe("explicit-account-id-123");
    expect(headers["authorization"]).toBe(`Bearer ${opaqueToken}`);
  });

  it("falls back to JWT extraction when accountId is not provided", () => {
    const jwtToken = makeJwt({ chatgpt_account_id: "acc_from_jwt" });
    const headers = buildCodexHeaders(jwtToken);
    expect(headers["chatgpt-account-id"]).toBe("acc_from_jwt");
  });
});

// ─── buildCodexBody ───────────────────────────────────────────────────────────

describe("buildCodexBody", () => {
  it("sets stream to true", () => {
    const body = buildCodexBody("gpt-4o", "hello", 512);
    expect(body.stream).toBe(true);
  });

  it("sets store to false", () => {
    const body = buildCodexBody("gpt-4o", "hello", 512);
    expect(body.store).toBe(false);
  });

  it("wraps prompt in input array with role=user", () => {
    const body = buildCodexBody("gpt-4o", "test prompt", 512);
    expect(body.input).toEqual([{ role: "user", content: "test prompt" }]);
  });

  it("does NOT include max_output_tokens (Codex API rejects it with HTTP 400)", () => {
    // The endpoint returns "Unsupported parameter: max_output_tokens"
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 2048);
    expect(body).not.toHaveProperty("max_output_tokens");
  });

  it("includes the model field", () => {
    const body = buildCodexBody("gpt-4o-mini", "hi", 256);
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("does NOT set stream to false (old bug regression)", () => {
    const body = buildCodexBody("gpt-4o", "hi", 512);
    expect(body.stream).not.toBe(false);
  });

  // ── New required fields discovered from API (HTTP 400 "Instructions are required") ──

  it("includes instructions field (required by Codex API)", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512);
    expect(body).toHaveProperty("instructions");
    expect(typeof body.instructions).toBe("string");
  });

  it("sets instructions to empty string when no system prompt given", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512);
    expect(body.instructions).toBe("");
  });

  it("accepts optional systemPrompt and uses it as instructions", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512, "You are a helpful assistant.");
    expect(body.instructions).toBe("You are a helpful assistant.");
  });

  it("includes text.verbosity set to medium", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512);
    expect(body.text).toEqual({ verbosity: "medium" });
  });

  it("includes tool_choice set to auto", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512);
    expect(body.tool_choice).toBe("auto");
  });

  it("includes parallel_tool_calls set to true", () => {
    const body = buildCodexBody("gpt-5.1-codex-mini", "hi", 512);
    expect(body.parallel_tool_calls).toBe(true);
  });
});

// ─── callCodex integration ────────────────────────────────────────────────────

describe("callCodex", () => {
  const token = makeJwt({ chatgpt_account_id: "acc_call_test" });
  const opaqueToken = "opaque-access-token-no-jwt-claims";
  // baseOptions() returns fresh options each call so mockFetch is always the
  // current beforeEach instance — no global fetch stub needed.
  const baseOptions = () => ({
    token,
    model: "gpt-4o",
    prompt: "hi",
    maxTokens: 512,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _transport: mockFetch as any,
  });

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it("posts to the correct Codex API URL", async () => {
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"hi"}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(
      new Response(sseBody, { status: 200 }),
    );

    await callCodex(baseOptions());

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
  });

  it("returns accumulated text from a single delta event", async () => {
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"Hello"}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex(baseOptions());
    expect(result.text).toBe("Hello");
  });

  it("concatenates multiple delta events in order", async () => {
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"Hello"}\n\n`,
      `data: {"type":"response.output_text.delta","delta":" World"}\n\n`,
      `data: {"type":"response.completed","response":{}}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex(baseOptions());
    expect(result.text).toBe("Hello World");
  });

  it("handles delta events split across multiple stream chunks", async () => {
    // Simulate chunk boundaries cutting an SSE event in half
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"foo"}`,
      `\n\ndata: {"type":"response.output_text.delta","delta":"bar"}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex(baseOptions());
    expect(result.text).toBe("foobar");
  });

  it("throws an error containing the status code on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(callCodex(baseOptions())).rejects.toThrow("404");
  });

  it("throws 'No response body' when response.body is null", async () => {
    const fakeResponse = {
      ok: true,
      body: null,
      status: 200,
      statusText: "OK",
      text: async () => "",
    };
    mockFetch.mockResolvedValueOnce(fakeResponse);

    await expect(callCodex(baseOptions())).rejects.toThrow("No response body");
  });

  it("returns the model that was requested", async () => {
    const sseBody = makeSseStream([`data: [DONE]\n\n`]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex({ ...baseOptions(), model: "gpt-4o-mini" });
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("returns empty string when stream has no delta events", async () => {
    const sseBody = makeSseStream([
      `data: {"type":"response.completed","response":{}}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex(baseOptions());
    expect(result.text).toBe("");
  });

  it("collects text from a final delta event not terminated by \\n\\n (stream cut early)", async () => {
    // Simulate a proxy that closes the stream without trailing \n\n
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"partial"}`,
      // No trailing \n\n — stream ends here
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex(baseOptions());
    // The implementation should still extract the delta from the flushed buffer
    expect(result.text).toBe("partial");
  });

  it("uses explicit accountId option instead of extracting from JWT", async () => {
    // opaqueToken is NOT a valid JWT — would throw if JWT extraction were attempted
    const sseBody = makeSseStream([
      `data: {"type":"response.output_text.delta","delta":"ok"}\n\n`,
      `data: [DONE]\n\n`,
    ]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await callCodex({
      token: opaqueToken,
      accountId: "stored-account-id-xyz",
      model: "gpt-4o",
      prompt: "hi",
      maxTokens: 512,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _transport: mockFetch as any,
    });

    expect(result.text).toBe("ok");
    // Verify the correct accountId was sent in the request
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["chatgpt-account-id"]).toBe("stored-account-id-xyz");
  });

  it("passes accountId from cli resolvedToken to Codex API headers", async () => {
    // Regression test: ensures the CLI flow works end-to-end with opaque tokens
    const sseBody = makeSseStream([`data: [DONE]\n\n`]);
    mockFetch.mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    await callCodex({
      token: opaqueToken,
      accountId: "e2f525f9-d8d2-4f57-86bc-9efec4179418",
      model: "gpt-4o",
      prompt: "What is PKCE?",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _transport: mockFetch as any,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["chatgpt-account-id"]).toBe("e2f525f9-d8d2-4f57-86bc-9efec4179418");
    expect(headers["authorization"]).toBe(`Bearer ${opaqueToken}`);
  });
});

// ─── CODEX_DEFAULT_MODEL constant ─────────────────────────────────────────────

describe("CODEX_DEFAULT_MODEL", () => {
  it("is a Codex-family model, not a standard chat model like gpt-4o", () => {
    // The Codex endpoint rejects non-Codex models (HTTP 400).
    // Default must be from the codex family to work out of the box.
    expect(CODEX_DEFAULT_MODEL).not.toBe("gpt-4o");
    expect(CODEX_DEFAULT_MODEL).not.toBe("gpt-4o-mini");
    expect(CODEX_DEFAULT_MODEL).not.toBe("gpt-4-turbo");
  });

  it("matches a known valid Codex endpoint model ID", () => {
    const validCodexModels = [
      "gpt-5.1",
      "gpt-5.1-codex",
      "gpt-5.1-codex-max",
      "gpt-5.1-codex-mini",
      "gpt-5.2",
      "gpt-5.2-codex",
      "gpt-5.3-codex",
    ];
    expect(validCodexModels).toContain(CODEX_DEFAULT_MODEL);
  });
});
