import { env } from "cloudflare:workers";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4.1-mini";
const MAX_REQUEST_CHARS = 12_000;
const TIMEOUT_MS = 18_000;
const MAX_OUTPUT_TOKENS = 700;

// Kept deliberately short so each request contains only the user's request and
// the rules needed to turn it into an immediately usable prompt.
const PROMPT_BUILDER_INSTRUCTIONS =
  "Turn the user's request into one complete, ready-to-use execution prompt. Preserve intent and exact placeholders, links, names, paths, and tools. Infer only task-relevant actions, constraints, sources, and deliverable. Do not use generic headings unless useful. Never claim to inspect unavailable attachments. Ask one necessary clarification only when execution is impossible. Reason internally; return only the optimized prompt.";

type RuntimeEnv = { OPENAI_API_KEY?: string };
type OpenAIResponse = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
};

class RouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function POST(request: Request) {
  try {
    const rawRequest = await readPromptRequest(request);
    const apiKey = ((env as unknown as RuntimeEnv).OPENAI_API_KEY || "").trim();

    if (!apiKey) {
      throw new RouteError(503, "Prompt generation is not configured. Add OPENAI_API_KEY to the site's server environment.");
    }

    const prompt = await generatePrompt(rawRequest, apiKey);
    return Response.json({ prompt });
  } catch (error) {
    const routeError = toRouteError(error);
    return Response.json({ error: routeError.message }, { status: routeError.status });
  }
}

async function readPromptRequest(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_CHARS) {
    throw new RouteError(413, `Your request is too long. Keep it under ${MAX_REQUEST_CHARS.toLocaleString()} characters.`);
  }

  const contentType = request.headers.get("content-type") || "";
  let value: unknown;

  if (contentType.includes("application/json")) {
    try {
      value = await request.json();
    } catch {
      throw new RouteError(400, "The request body must contain valid JSON.");
    }
    value = typeof value === "string" ? value : value && typeof value === "object" ? (value as { request?: unknown }).request : undefined;
  } else {
    value = await request.text();
  }

  if (typeof value !== "string") {
    throw new RouteError(400, "Provide your request as text or as a JSON object with a request field.");
  }

  const rawRequest = value.trim();
  if (!rawRequest) {
    throw new RouteError(400, "Add a short request before generating a prompt.");
  }
  if (rawRequest.length > MAX_REQUEST_CHARS) {
    throw new RouteError(413, `Your request is too long. Keep it under ${MAX_REQUEST_CHARS.toLocaleString()} characters.`);
  }

  return rawRequest;
}

async function generatePrompt(rawRequest: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: PROMPT_BUILDER_INSTRUCTIONS,
        input: rawRequest,
        temperature: 0.2,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new RouteError(response.status === 429 ? 429 : 502, openAiFailureMessage(response.status, payload));
    }

    const prompt = extractPrompt(payload);
    if (!prompt) {
      throw new RouteError(502, "Prompt generation returned no usable text. Please try again.");
    }
    return prompt;
  } catch (error) {
    if (error instanceof RouteError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RouteError(504, "Prompt generation timed out. Please try again.");
    }
    throw new RouteError(502, "Prompt generation is temporarily unavailable. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

function extractPrompt(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as OpenAIResponse;
  const outputText = typeof response.output_text === "string" ? response.output_text : "";
  const contentText = response.output
    ?.flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n") || "";

  return stripMarkdownFence(outputText || contentText).trim();
}

function stripMarkdownFence(value: string) {
  return value.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "");
}

function openAiFailureMessage(status: number, payload: unknown) {
  if (status === 401 || status === 403) return "Prompt generation could not authenticate. Check the server-side OPENAI_API_KEY.";
  if (status === 429) return "Prompt generation is busy right now. Please wait a moment and try again.";
  if (status >= 500) return "Prompt generation is temporarily unavailable. Please try again.";
  const message = payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: { message?: unknown } }).error?.message === "string"
    ? (payload as { error: { message: string } }).error.message
    : "Prompt generation could not be completed. Please try again.";
  return message.slice(0, 240);
}

function toRouteError(error: unknown) {
  if (error instanceof RouteError) return error;
  return new RouteError(500, "An unexpected error occurred while generating the prompt.");
}

