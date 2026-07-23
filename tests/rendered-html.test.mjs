import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function postPrompt(worker, body) {
  return worker.fetch(
    new Request("http://localhost/api/prompt-builder", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders development preview metadata", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), developmentPreviewMeta);
});

test("prompt builder returns a direct concise prompt", async () => {
  const worker = await loadWorker();
  const response = await postPrompt(worker, "clean report for management with risks and next steps");
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(data), ["prompt"]);
  assert.match(data.prompt, /^Clean report for management with risks and next steps/);
  assert.match(data.prompt, /Return only the requested report\./);
  assert.doesNotMatch(data.prompt, /\bGoal\b|\bInstructions\b|\bOutput\b/);
  assert.doesNotMatch(data.prompt, /Act as an expert assistant|Clarify the objective|formula guidance/);
  assert.doesNotMatch(data.prompt, /Preserve all stated restrictions|Deliver the requested report/);
  assert.doesNotMatch(data.prompt, /^```/);
});

test("simple email rewrite stays short and context-aware", async () => {
  const worker = await loadWorker();
  const response = await postPrompt(worker, "Rewrite this email in a friendly and natural tone while preserving the original meaning.");
  const data = await response.json();
  const lines = data.prompt.split("\n");

  assert.ok(lines.length >= 4 && lines.length <= 7);
  assert.equal((data.prompt.match(/original meaning/gi) || []).length, 1);
  assert.match(data.prompt, /Return only the ready-to-send email\./);
  assert.doesNotMatch(data.prompt, /source files|folders|external data|placeholders|validation|Deliver/);
});

test("simple summary stays short without file safeguards", async () => {
  const worker = await loadWorker();
  const response = await postPrompt(worker, "Summarize the discussion in five short bullets.");
  const data = await response.json();
  const lines = data.prompt.split("\n");

  assert.ok(lines.length >= 4 && lines.length <= 7);
  assert.match(data.prompt, /Keep the key facts, decisions, and actions\./);
  assert.match(data.prompt, /Return only the requested summary\./);
  assert.doesNotMatch(data.prompt, /source files|folders|placeholders|Deliver/);
});

test("prompt builder preserves workbook output and placeholders", async () => {
  const worker = await loadWorker();
  const raw = "go to folder [xxx] and find Excel workbook named [xx], get content of that workbook, and apply it on the dashboard Excel workbook named [x]. Return only the updated dashboard without any change on the style, and using only the [xx] workbook content.";
  const response = await postPrompt(worker, raw);
  const data = await response.json();
  const lines = data.prompt.split("\n");

  assert.equal(lines.length, 10);
  assert.equal(lines[0], "Open folder [xxx].");
  assert.match(data.prompt, /Find the Excel workbook named \[xx\]\./);
  assert.match(data.prompt, /Open the dashboard Excel workbook named \[x\]\./);
  assert.match(data.prompt, /Use only \[xx\] as the content source; do not add external data\./);
  assert.match(data.prompt, /Preserve the dashboard's existing style, layout, formatting, formulas, and structure\./);
  assert.equal(lines.at(-1), "Return only the updated dashboard Excel workbook [x].");
  assert.doesNotMatch(data.prompt, /guidance|Act as an expert|Clarify the objective/);
});

test("prompt builder keeps JSON as the requested output", async () => {
  const worker = await loadWorker();
  const response = await postPrompt(worker, "Convert the attached source data into JSON using only the provided file. Return only JSON.");
  const data = await response.json();

  assert.match(data.prompt, /using only the provided file/i);
  assert.match(data.prompt, /Return only the requested JSON\./);
  assert.equal((data.prompt.match(/(?:use|using) only/gi) || []).length, 1);
  assert.doesNotMatch(data.prompt, /Preserve all stated restrictions|Deliver the requested/);
  assert.doesNotMatch(data.prompt, /formula guidance|explanation/);
});
