import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handlePromptBuilderRequest } from "../app/api/prompt-builder/prompt-builder.mjs";

async function postPrompt(body, { headers = {}, apiKey } = {}) {
  return handlePromptBuilderRequest(new Request("http://localhost/api/prompt-builder", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), apiKey);
}

async function withOpenAiMock(mock, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

test("keeps the OpenAI key in the Cloudflare server route only", async () => {
  const route = await readFile(new URL("../app/api/prompt-builder/route.ts", import.meta.url), "utf8");
  assert.match(route, /import \{ env \} from "cloudflare:workers"/);
  assert.match(route, /OPENAI_API_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_OPENAI|VITE_OPENAI/);
});

test("uses one compact OpenAI request and returns a prompt-only workbook workflow", async () => {
  const raw = "go to folder [xxx] and find Excel workbook named [xx], get content of that workbook, and apply it on the dashboard Excel workbook named [x] without any change on the style, and using only the [xx] workbook content.";
  const expected = "Go to the folder [xxx] and locate the Excel workbook named [xx].\n\nUse workbook [xx] as the only source of data.\n\nOpen the dashboard Excel workbook named [x] and update it using only the content from workbook [xx].\n\nPreserve the dashboard's existing style, layout, formatting, formulas, charts, colors, and structure.\n\nDo not use any other files, assumptions, previous versions, or external data.\n\nDo not modify the source workbook [xx].\n\nIf any required mapping is unclear, stop and ask only the necessary clarification.\n\nReturn only the updated dashboard Excel workbook named [x].";

  await withOpenAiMock(async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    assert.equal(payload.input, raw);
    assert.equal(payload.model, "gpt-4.1-mini");
    assert.equal(payload.temperature, 0.2);
    assert.equal(payload.max_output_tokens, 700);
    assert.equal(payload.store, false);
    assert.ok(payload.instructions.length < 550);
    assert.doesNotMatch(payload.instructions, /(?:^|\n)(?:Goal|Objective|Output):/im);
    assert.match(payload.instructions, /never do the task/i);
    assert.match(payload.instructions, /email, report, JSON, formula, table, or document/i);
    assert.match(payload.instructions, /Keep unavailable items as written/i);
    assert.match(payload.instructions, /4-7 lines for simple tasks and 8-12 for workflows\/file updates/i);
    return json({ output_text: expected });
  }, async () => {
    const response = await postPrompt({ request: raw }, { apiKey: "test-key" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { prompt: expected });
  });
});

test("keeps email and JSON requests as optimized prompts for another AI", async () => {
  const emailRequest = "write an email to [employee name] about [y]";
  const emailPrompt = "Write a concise, friendly email to [employee name] about [y].\nPreserve the provided facts and names exactly.\nUse a warm, professional tone.\nReturn only the ready-to-send email.";
  const jsonRequest = "create JSON for [employee name] using [y]";
  const jsonPrompt = "Create valid JSON for [employee name] using [y].\nPreserve the placeholders and requested values exactly.\nUse only the requested fields and structure.\nReturn only the JSON.";
  const requests = [emailRequest, jsonRequest];
  const outputs = [emailPrompt, jsonPrompt];
  let call = 0;

  await withOpenAiMock(async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.input, requests[call]);
    assert.match(payload.instructions, /prompt for another AI/i);
    assert.match(payload.instructions, /never do the task/i);
    const output = outputs[call++];
    return json({ output: [{ content: [{ type: "output_text", text: `\`\`\`text\n${output}\n\`\`\`` }] }] });
  }, async () => {
    const emailResponse = await postPrompt({ request: emailRequest }, { apiKey: "test-key" });
    assert.equal(emailResponse.status, 200);
    assert.deepEqual(await emailResponse.json(), { prompt: emailPrompt });
    assert.doesNotMatch(emailPrompt, /^Dear\b/i);

    const jsonResponse = await postPrompt({ request: jsonRequest }, { apiKey: "test-key" });
    assert.equal(jsonResponse.status, 200);
    assert.deepEqual(await jsonResponse.json(), { prompt: jsonPrompt });
    assert.doesNotMatch(jsonPrompt, /^\s*\{/);
  });
});

test("rejects empty, oversized, and invalid JSON requests clearly", async () => {
  const empty = await postPrompt({ request: "   " });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /Add a short request/);

  const oversized = await postPrompt({ request: "x".repeat(12_001) });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /too long/i);

  const invalid = await postPrompt("{", { headers: { "content-type": "application/json" } });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /valid JSON/i);
});

test("reports missing server configuration without exposing a key", async () => {
  const response = await postPrompt({ request: "Create a short prompt" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
});

test("maps OpenAI failures, rate limits, timeouts, and unusable responses to safe errors", async () => {
  const apiKey = "test-key";
  await withOpenAiMock(async () => json({ error: { message: "Provider failed" } }, 500), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { apiKey });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /temporarily unavailable/i);
  });

  await withOpenAiMock(async () => json({ error: { message: "Too many requests" } }, 429), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { apiKey });
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /busy/i);
  });

  await withOpenAiMock(async () => { throw new DOMException("Aborted", "AbortError"); }, async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { apiKey });
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /timed out/i);
  });

  await withOpenAiMock(async () => new Response("not json", { status: 200 }), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { apiKey });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /no usable text/i);
  });

  await withOpenAiMock(async () => json({ output_text: "" }), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { apiKey });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /no usable text/i);
  });
});


