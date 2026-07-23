const FOLLOW_UP_TRIGGERS = new Set([
  "write something",
  "make something",
  "create something",
  "fix it",
  "improve it",
  "do this",
]);

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let rawRequest = "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    rawRequest = typeof body === "string" ? body : String(body?.request || body?.rawRequest || "");
  } else {
    rawRequest = await request.text();
  }

  return Response.json({ prompt: buildOptimizedPrompt(rawRequest) });
}

function buildOptimizedPrompt(rawValue: string) {
  const raw = rawValue.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (raw.length < 16 || FOLLOW_UP_TRIGGERS.has(lower)) {
    return "Provide the exact task and required final output.";
  }

  const workbookTransfer = buildWorkbookTransferPrompt(raw, lower);
  if (workbookTransfer) return workbookTransfer;

  const output = inferOutputContract(raw, lower);
  const simplePrompt = buildSimplePrompt(raw, lower, output);
  if (simplePrompt) return simplePrompt;

  const lines = splitIntoDirectSteps(raw);
  const sourceRestricted = mentionsSpecifiedSources(lower);

  if (hasPlaceholders(raw) && !lines.some((line) => /preserve (?:every|all) placeholder/i.test(line))) {
    lines.push("Preserve every placeholder exactly as written.");
  }
  if (sourceRestricted && !lines.some((line) => /\b(use|using)\s+only\b|\bsource[- ]only\b/i.test(line))) {
    lines.push("Use only the specified source files, folders, links, or data; do not add external content.");
  } else if (prohibitsExternalData(lower) && !lines.some((line) => /\bexternal (?:data|content)\b/i.test(line))) {
    lines.push("Do not use external data or add unsupported content.");
  }
  if (requiresNoStyleChanges(lower) && !lines.some((line) => /\b(style|layout|formatting)\b/i.test(line))) {
    lines.push("Preserve the existing style, layout, formatting, and structure.");
  }
  if (requiresExactContent(lower) && !lines.some((line) => /\b(as is|exact|unchanged|do not (?:rewrite|change))\b/i.test(line))) {
    lines.push("Do not rewrite, shorten, expand, or change content that must remain exact.");
  }

  lines.push(`Return only ${output}.`);
  return uniqueLines(lines).join("\n");
}

function buildSimplePrompt(raw: string, lower: string, output: string) {
  if (isFileBasedTask(lower)) return "";

  const isEmail = /\bemail\b/.test(lower);
  const isMessage = /\b(message|reply)\b/.test(lower);
  const isSummary = /\bsummary\b|\bsummari[sz]e\b/.test(lower);
  const isRewrite = /\b(rewrite|rephrase|refine|polish|improve the wording)\b/.test(lower);
  if (!isEmail && !isMessage && !isSummary && !isRewrite) return "";

  const lines = [makeDirectInstruction(raw)];

  if (isSummary) {
    lines.push("Keep the key facts, decisions, and actions.");
    lines.push("Do not add information that is not in the source.");
    lines.push("Keep it concise and easy to scan.");
  } else if (isRewrite) {
    if (!/\b(preserv\w*|keep\w*)\b[^.]{0,40}\b(original )?(meaning|facts)\b/.test(lower)) {
      lines.push("Preserve the original meaning and facts.");
    }
    lines.push("Improve clarity, grammar, and flow.");
    lines.push(isEmail || isMessage ? "Keep the wording natural, concise, and ready to send." : "Keep the wording natural and concise.");
  } else {
    lines.push("Use clear, natural language suited to the audience.");
    lines.push("Keep it concise and ready to send.");
  }

  lines.push(`Return only ${output}.`);
  return uniqueLines(lines).join("\n");
}

function splitIntoDirectSteps(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\n+/g, ". ").trim();
  const parts = normalized
    .split(/(?<=[.!?;])\s+|,\s+(?:and\s+)?(?=(?:find|get|review|open|apply|update|copy|transfer|use|keep|preserve|validate|check|create|return|do not)\b)/i)
    .map((part) => part.replace(/^[\s,;]+|[\s,;]+$/g, "").trim())
    .filter(Boolean)
    .filter((part) => !/^return only\b/i.test(part));

  const steps = parts.map((part) => {
    const direct = makeDirectInstruction(part).replace(/[.!?]+$/g, "");
    return `${direct}.`;
  });

  return steps.length ? steps : [makeDirectInstruction(raw)];
}

function buildWorkbookTransferPrompt(raw: string, lower: string) {
  if (!lower.includes("workbook") || !lower.includes("folder") || !lower.includes("dashboard")) return "";
  if (!/\b(apply|transfer|copy|populate|update|merge)\b/i.test(raw)) return "";

  const folder = raw.match(/\bfolder\s+(\[[^\]\n]+\]|"[^"\n]+"|'[^'\n]+')/i)?.[1];
  const dashboard = raw.match(/\bdashboard(?:\s+excel)?\s+workbook\s+named\s+(\[[^\]\n]+\]|"[^"\n]+"|'[^'\n]+')/i)?.[1];
  const workbookMatches = [...raw.matchAll(/\b(?:excel\s+)?workbook\s+named\s+(\[[^\]\n]+\]|"[^"\n]+"|'[^'\n]+')/gi)];
  const source = workbookMatches.map((match) => match[1]).find((name) => name !== dashboard);

  if (!folder || !source || !dashboard) return "";

  return [
    `Open folder ${folder}.`,
    `Find the Excel workbook named ${source}.`,
    `Review and use the content from ${source}.`,
    `Open the dashboard Excel workbook named ${dashboard}.`,
    `Apply the relevant content from ${source} to ${dashboard}.`,
    `Use only ${source} as the content source; do not add external data.`,
    "Preserve the dashboard's existing style, layout, formatting, formulas, and structure.",
    "Do not make any unrelated changes.",
    `Validate that the applied content matches ${source} and that the dashboard remains intact.`,
    `Return only the updated dashboard Excel workbook ${dashboard}.`,
  ].join("\n");
}

function makeDirectInstruction(raw: string) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const withoutLeadIn = cleaned
    .replace(/^(?:please\s+)?(?:i\s+(?:want|need)\s+you\s+to|can\s+you|could\s+you|would\s+you)\s+/i, "")
    .trim();
  const lower = withoutLeadIn.toLowerCase();
  const executable = /^(add|analyse|analyze|apply|build|check|clean|compare|convert|copy|create|draft|edit|extract|find|fix|generate|get|go|identify|implement|import|open|prepare|produce|refine|remove|replace|research|return|review|rewrite|search|send|summarize|summarise|transfer|update|use|validate|write)\b/.test(lower);

  if (executable) return capitalize(withoutLeadIn);
  if (/^(a|an)\s+/.test(lower)) return `Create ${withoutLeadIn}.`;
  return `Complete the following task: ${withoutLeadIn}`;
}

function inferOutputContract(raw: string, lower: string) {
  const updating = /\b(update|updated|edit|edited|revise|revised|complete|completed|apply)\b/i.test(raw);
  if (/\bdashboard(?:\s+excel)?\s+workbook\b/i.test(raw)) return "the updated dashboard Excel workbook";
  if (/\b(?:excel\s+)?workbook\b/i.test(raw)) return updating ? "the updated workbook file" : "the requested workbook file";
  if (/\b(?:word\s+)?document\b/i.test(raw)) return updating ? "the updated document file" : "the requested document file";
  if (/\b(?:powerpoint\s+)?presentation\b|\bslide deck\b/i.test(raw)) return updating ? "the updated presentation file" : "the requested presentation file";
  if (/\bjson\b/i.test(raw)) return "the requested JSON";
  if (/\b(?:updated|edited|revised|completed)\s+(?:file|artifact)\b/i.test(raw)) return "the updated file or artifact";
  if (/\bfile\b/i.test(raw)) return updating ? "the updated file" : "the requested file";
  if (/\bemail\b/i.test(raw)) return "the ready-to-send email";
  if (/\b(message|reply)\b/i.test(raw)) return "the ready-to-send message";
  if (/\btable\b/i.test(raw)) return "the requested table";
  if (/\breport\b/i.test(raw)) return "the requested report";
  if (lower.includes("summary") || /\bsummari[sz]e\b/.test(lower)) return "the requested summary";
  if (/\b(rewrite|rephrase|refine|polish)\b/.test(lower)) return "the final rewritten text";
  if (lower.includes("code") || lower.includes("script")) return "the implementation-ready code";
  if (lower.includes("guidance") || lower.includes("explain")) return "the requested guidance";
  return "the completed task result";
}

function isFileBasedTask(lower: string) {
  return /\b(file|folder|workbook|spreadsheet|document|presentation|slide deck|attached|uploaded)\b/.test(lower);
}

function hasPlaceholders(raw: string) {
  return /\[[^\]\n]+\]|\{[^\}\n]+\}|<[^>\n]+>/.test(raw);
}

function mentionsSpecifiedSources(lower: string) {
  return /\b(source[- ]only|using only|use only|specified source|attached|uploaded|provided file|source file|source folder)\b/.test(lower);
}

function prohibitsExternalData(lower: string) {
  return /\b(no external data|without external data|do not use external|using only|use only|source[- ]only)\b/.test(lower);
}

function requiresNoStyleChanges(lower: string) {
  return /\b(no style changes?|without (?:any )?(?:change|changes) (?:to|on) (?:the )?style|keep (?:the )?(?:style|formatting|layout)|preserve (?:the )?(?:style|formatting|layout))\b/.test(lower);
}

function requiresExactContent(lower: string) {
  return /\b(as is|exact wording|exactly as written|do not rewrite|do not change (?:the )?content|unchanged content)\b/.test(lower);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function uniqueLines(lines: string[]) {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}
