/**
 * Call the OpenAI Codex API using a ChatGPT Plus/Pro subscription OAuth token.
 *
 * Endpoint: https://chatgpt.com/backend-api/codex/responses
 *
 * The API is SSE-only (stream: true).  Text fragments arrive as
 * `response.output_text.delta` events and are concatenated.
 *
 * The accountId is decoded directly from the JWT access token (field
 * `chatgpt_account_id` in the payload) — no need to pass it explicitly.
 *
 * Source: @mariozechner/pi-ai/dist/providers/openai-codex-responses.js
 */

import https from "node:https";
import { execFile } from "node:child_process";

const CODEX_API_URL = "https://chatgpt.com/backend-api/codex/responses";

/**
 * Default model for the OpenAI Codex endpoint.
 *
 * The `/backend-api/codex/responses` endpoint only accepts Codex-family models
 * (e.g. gpt-5.1, gpt-5.1-codex-mini, gpt-5.2-codex).  Standard chat models
 * like "gpt-4o" are explicitly rejected with HTTP 400.
 */
export const CODEX_DEFAULT_MODEL = "gpt-5.1-codex-mini";

// ─── Transport abstraction ────────────────────────────────────────────────────

/**
 * Minimal HTTP response interface used internally by callCodex.
 *
 * Mirrors the subset of the web `Response` API that callCodex consumes,
 * allowing both the real `httpsPost` transport and test mocks to conform to
 * the same contract without needing to return a full `Response` object.
 */
export type CodexHttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  body: ReadableStream<Uint8Array> | null;
};

/**
 * HTTP transport function signature used by callCodex.
 *
 * Accepts any function with this signature — e.g. the built-in `httpsPost`
 * (production) or a `vi.fn()` mock (tests).
 */
export type CodexTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<CodexHttpResponse>;

// ─── Public types ─────────────────────────────────────────────────────────────

export type CodexCallOptions = {
  /** OAuth access token from resolveToken("openai-codex"). */
  token: string;
  /**
   * Account ID from the stored OAuth credential.
   * When provided, JWT extraction is skipped (necessary for opaque access
   * tokens that do not carry the `chatgpt_account_id` JWT claim).
   */
  accountId?: string;
  /** Model ID, e.g. "gpt-4o", "gpt-4o-mini". */
  model: string;
  /** User prompt text. */
  prompt: string;
  /** Max tokens to generate (default: 1024). */
  maxTokens?: number;
  /**
   * Override the HTTP transport for testing.
   *
   * In production this defaults to `httpsPost` (Node.js `https` module).
   * Tests inject a `vi.fn()` mock here instead of patching the global `fetch`.
   *
   * @internal
   */
  _transport?: CodexTransport;
};

export type CodexCallResult = {
  text: string;
  model: string;
};

// ─── Pure helper functions (exported for testing) ─────────────────────────────

/**
 * Decode a JWT access token and return the `chatgpt_account_id` claim.
 *
 * Throws `"Failed to extract accountId from token"` if the token is malformed
 * or the claim is missing/empty.
 */
export function extractAccountIdFromToken(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Failed to extract accountId from token");
  }

  try {
    // base64url → base64: replace URL-safe chars and re-add stripped padding
    const base64 = (parts[1] ?? "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;

    const accountId = payload["chatgpt_account_id"];
    if (typeof accountId !== "string" || accountId.length === 0) {
      throw new Error("missing chatgpt_account_id");
    }
    return accountId;
  } catch {
    throw new Error("Failed to extract accountId from token");
  }
}

/**
 * Build the HTTP headers required by the Codex responses endpoint.
 *
 * All header names use lowercase keys (consistent with HTTP/2 wire format).
 *
 * @param token    OAuth access token (Bearer).
 * @param accountId Optional pre-resolved account ID from stored credentials.
 *   When provided, JWT extraction is skipped — required for opaque OAuth tokens
 *   that do not embed `chatgpt_account_id` in the JWT payload.
 */
export function buildCodexHeaders(token: string, accountId?: string): Record<string, string> {
  const resolvedAccountId = accountId ?? extractAccountIdFromToken(token);
  return {
    authorization: `Bearer ${token}`,
    "chatgpt-account-id": resolvedAccountId,
    "openai-beta": "responses=experimental",
    originator: "pi",
    accept: "text/event-stream",
    "content-type": "application/json",
  };
}

/**
 * Build the JSON request body for a single-turn Codex prompt.
 *
 * `stream` MUST be `true` — the endpoint does not support non-streaming mode.
 * `input` is an array of message objects, not a plain string.
 * `instructions` is REQUIRED by the Codex endpoint; omitting it causes HTTP 400
 *   "Instructions are required".  Pass an empty string for no system prompt.
 *
 * Source: @mariozechner/pi-ai buildRequestBody() in openai-codex-responses.js
 */
export function buildCodexBody(
  model: string,
  prompt: string,
  maxTokens: number,
  systemPrompt = "",
): Record<string, unknown> {
  // Note: max_output_tokens is NOT sent — the Codex endpoint rejects it (HTTP 400).
  // The maxTokens parameter is accepted for API compatibility but currently unused.
  void maxTokens;
  return {
    model,
    instructions: systemPrompt,
    input: [{ role: "user", content: prompt }],
    stream: true,
    store: false,
    text: { verbosity: "medium" },
    tool_choice: "auto",
    parallel_tool_calls: true,
  };
}

// ─── Proxy detection ─────────────────────────────────────────────────────────

/** Cached proxy URL: `undefined` = not yet probed, `null` = no proxy found. */
let _cachedProxyUrl: string | null | undefined;

/**
 * Parse HTTPS proxy settings from `scutil --proxy` output (macOS only).
 * Resolves to a URL string like `"http://127.0.0.1:7897"`, or `null`.
 */
function readMacOsHttpsProxy(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("scutil", ["--proxy"], { timeout: 2000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const enabled = /HTTPSEnable\s*:\s*1/.test(stdout);
      const hostMatch = stdout.match(/HTTPSProxy\s*:\s*([^\s\n]+)/);
      const portMatch = stdout.match(/HTTPSPort\s*:\s*(\d+)/);
      resolve(enabled && hostMatch && portMatch
        ? `http://${hostMatch[1]}:${portMatch[1]}`
        : null);
    });
  });
}

/**
 * Return the HTTPS proxy URL to use, or `null` if none is configured.
 *
 * Resolution order (first match wins):
 * 1. `HTTPS_PROXY` / `https_proxy` environment variables
 * 2. macOS system proxy via `scutil --proxy` (darwin only)
 *
 * The result is cached for the lifetime of the process (one CLI invocation).
 */
async function resolveProxyUrl(): Promise<string | null> {
  if (_cachedProxyUrl !== undefined) return _cachedProxyUrl;

  const envProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (envProxy) {
    return (_cachedProxyUrl = envProxy);
  }

  if (process.platform === "darwin") {
    _cachedProxyUrl = await readMacOsHttpsProxy();
    return _cachedProxyUrl;
  }

  return (_cachedProxyUrl = null);
}

// ─── Real HTTP transport (Node.js https module) ───────────────────────────────

/**
 * Send an HTTPS POST request, routing through a proxy when available.
 *
 * Proxy detection order: HTTPS_PROXY env var → macOS system proxy (scutil).
 * When a proxy is found, undici's ProxyAgent establishes an HTTP CONNECT
 * tunnel to chatgpt.com, which is necessary in environments where the host's
 * DNS is poisoned (e.g., GFW returning sinkhole IPs for chatgpt.com).
 *
 * When no proxy is configured, falls back to the Node.js built-in `https`
 * module (uses OpenSSL's TLS stack rather than undici/fetch).
 *
 * For non-OK responses the body is buffered and exposed via `text()`.
 * For OK (2xx) responses the body is streamed as a `ReadableStream<Uint8Array>`
 * suitable for SSE parsing.
 */
async function httpsPost(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
): Promise<CodexHttpResponse> {
  const proxyUrl = await resolveProxyUrl();

  if (proxyUrl) {
    // Route through an HTTP CONNECT proxy using undici's ProxyAgent.
    // This is required when DNS is poisoned (e.g., GFW) and the only path to
    // chatgpt.com is through a local proxy such as Clash or V2Ray.
    // undici is bundled with Node.js 18+ — no extra npm package needed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ProxyAgent, fetch: proxyFetch } = await import("undici") as { ProxyAgent: any; fetch: any };
    // `dispatcher` is an undici-specific extension of RequestInit — cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchInit: any = { method: init.method, headers: init.headers, body: init.body, dispatcher: new ProxyAgent(proxyUrl) };
    const res = await (proxyFetch as typeof fetch)(url, fetchInit) as CodexHttpResponse;
    return res;
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyBuf = Buffer.from(init.body, "utf-8");

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: init.method,
        headers: {
          ...init.headers,
          "content-length": String(bodyBuf.length),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const statusText = res.statusMessage ?? "";
        const ok = status >= 200 && status < 300;

        if (!ok) {
          // Buffer the full error body so callCodex can include it in the
          // thrown error message, then resolve (not reject — HTTP errors are
          // not transport errors).
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve({
              ok,
              status,
              statusText,
              text: () => Promise.resolve(buf.toString("utf-8")),
              body: null,
            });
          });
          res.on("error", reject);
        } else {
          // Stream the SSE body incrementally; resolving immediately lets
          // callCodex start consuming events without waiting for the full
          // response (which may be very long for streaming APIs).
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
              res.on("end", () => controller.close());
              res.on("error", (err) => controller.error(err));
            },
          });
          resolve({ ok, status, statusText, text: () => Promise.resolve(""), body });
        }
      },
    );

    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ─── SSE parser (internal) ────────────────────────────────────────────────────

/**
 * Read an SSE stream from the Codex API and return the concatenated text.
 *
 * Event format:
 *   data: {"type":"response.output_text.delta","delta":"…"}\n\n
 *   data: {"type":"response.completed","response":{…}}\n\n
 *   data: [DONE]\n\n
 */
async function parseSseText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  /** Process all complete SSE events currently in `buffer`, returning the tail. */
  function drainBuffer(buf: string): string {
    const events = buf.split("\n\n");
    const tail = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          // Silently skip malformed lines (defensive — real API should not produce these)
          continue;
        }

        if (
          parsed !== null &&
          typeof parsed === "object" &&
          (parsed as Record<string, unknown>)["type"] === "response.output_text.delta" &&
          typeof (parsed as Record<string, unknown>)["delta"] === "string"
        ) {
          text += (parsed as Record<string, unknown>)["delta"] as string;
        }
      }
    }

    return tail;
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      // Flush any buffered multi-byte UTF-8 tail from the TextDecoder, then
      // process whatever remains in the buffer (stream may close without a
      // final \n\n if proxied or truncated).
      buffer += decoder.decode(); // { stream: false } — flushes the decoder
      if (buffer.length > 0) {
        // Append a synthetic event boundary so drainBuffer treats the
        // remaining content as a complete event rather than a tail.
        drainBuffer(buffer + "\n\n");
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Each SSE event ends with a blank line (\n\n).
    // We keep the last (potentially incomplete) segment in the buffer.
    buffer = drainBuffer(buffer);
  }

  return text;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Send a single-turn message to ChatGPT Codex using a subscription token.
 *
 * Pass `accountId` from the resolved OAuth credential to avoid JWT parsing —
 * OpenAI access tokens do not always embed `chatgpt_account_id` as a claim.
 *
 * In production the request is sent via the Node.js `https` module (not the
 * global `fetch`/undici) to avoid Cloudflare TLS fingerprint rejection.
 */
export async function callCodex(options: CodexCallOptions): Promise<CodexCallResult> {
  const { token, accountId, model, prompt, maxTokens = 1024 } = options;
  const transport = options._transport ?? httpsPost;

  const response = await transport(CODEX_API_URL, {
    method: "POST",
    headers: buildCodexHeaders(token, accountId),
    body: JSON.stringify(buildCodexBody(model, prompt, maxTokens)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `OpenAI Codex API error ${response.status} ${response.statusText}: ${errorText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const text = await parseSseText(response.body);
  return { text, model };
}
