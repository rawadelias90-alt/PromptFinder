import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const TEST_ENV_KEY = "__promptFinderTestEnv";
let viteServer;
let route;

async function loadRoute() {
  if (!viteServer) {
    viteServer = await createServer({
      root: projectRoot,
      configFile: false,
      appType: "custom",
      plugins: [{
        name: "prompt-builder-test-cloudflare-workers",
        enforce: "pre",
        resolveId(id) {
          return id === "cloudflare:workers" ? "\0prompt-builder-test-cloudflare-workers" : null;
        },
        load(id) {
          return id === "\0prompt-builder-test-cloudflare-workers"
            ? `export const env = new Proxy({}, { get: (_, key) => globalThis.${TEST_ENV_KEY}?.[key] });`
            : null;
        },
      }],
      server: { middlewareMode: true },
      ssr: { noExternal: true },
    });
  }

  route ??= await viteServer.ssrLoadModule("/app/api/prompt-builder/route.ts");
  return route;
}

after(async () => { await viteServer?.close(); });

async function postPrompt(body, { headers = {}, env = {} } = {}) {
  globalThis[TEST_ENV_KEY] = env;
  const { POST } = await loadRoute();
  return POST(new Request("http://localhost/api/prompt-builder", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
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

test("uses one compact OpenAI request and returns the workbook prompt without local templates", async () => {
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
    assert.ok(payload.instructions.length < 500);
    assert.doesNotMatch(payload.instructions, /Goal|Objective|Output|example/i);
    return json({ output_text: expected });
  }, async () => {
    const response = await postPrompt({ request: raw }, { env: { OPENAI_API_KEY: "test-key" } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { prompt: expected });
  });
});

test("returns a second optimized prompt exactly as supplied by the model", async () => {
  const expected = "Review the provided text and rewrite it as a concise, friendly email. Preserve all facts and names exactly. Return only the ready-to-send email.";

  await withOpenAiMock(
    async () => json({ output: [{ content: [{ type: "output_text", text: `\`\`\`text\n${expected}\n\`\`\`` }] }] }),
    async () => {
      const response = await postPrompt({ request: "rewrite this into a friendly email" }, { env: { OPENAI_API_KEY: "test-key" } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { prompt: expected });
    },
  );
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
  const env = { OPENAI_API_KEY: "test-key" };

  await withOpenAiMock(async () => json({ error: { message: "Provider failed" } }, 500), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { env });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /temporarily unavailable/i);
  });

  await withOpenAiMock(async () => json({ error: { message: "Too many requests" } }, 429), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { env });
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /busy/i);
  });

  await withOpenAiMock(async () => { throw new DOMException("Aborted", "AbortError"); }, async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { env });
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /timed out/i);
  });

  await withOpenAiMock(async () => new Response("not json", { status: 200 }), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { env });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /no usable text/i);
  });

  await withOpenAiMock(async () => json({ output_text: "" }), async () => {
    const response = await postPrompt({ request: "Create a prompt" }, { env });
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /no usable text/i);
  });
});

