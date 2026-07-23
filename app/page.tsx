"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { categories, prompts, type Prompt } from "./prompt-data";

type PlatformId = keyof typeof AI_PLATFORMS;
type View = "library" | "search";
type MobileTab = "library" | "search" | "create" | "run";
type Draft = Prompt & { draft: true; createdAt: string; updatedAt: string };
type PendingRun = { platformId: PlatformId; platformName: string; promptText: string; url: string; copied: boolean; copyFailed: boolean };

const PROMPT_BUILDER_ENDPOINT = "/api/prompt-builder";

const AI_PLATFORMS = {
  chatgpt: {
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    supportsQuerystring: true
  },
  claude: {
    name: "Claude",
    baseUrl: "https://claude.ai/new",
    supportsQuerystring: true
  },
  gemini: {
    name: "Gemini",
    baseUrl: "https://gemini.google.com/app",
    supportsQuerystring: false
  },
  copilot: {
    name: "Microsoft Copilot",
    baseUrl: "https://copilot.microsoft.com",
    supportsQuerystring: false
  }
} as const;

function buildAIUrl(platformId: PlatformId, promptText: string) {
  const encodedPrompt = encodeURIComponent(promptText);
  switch (platformId) {
    case "chatgpt":
      return `https://chatgpt.com/?q=${encodedPrompt}`;
    case "claude":
      return `https://claude.ai/new?q=${encodedPrompt}`;
    default:
      return AI_PLATFORMS[platformId].baseUrl;
  }
}

const aiTools = (Object.keys(AI_PLATFORMS) as PlatformId[]).map((id) => ({ id, name: AI_PLATFORMS[id].name }));
const productivityTools = [
  { name: "Word" }, { name: "Excel" }, { name: "PowerPoint" }, { name: "Outlook" }, { name: "SharePoint" }, { name: "Teams" },
];
const allTools = [...aiTools, ...productivityTools];
const officeNames: Record<string, string> = { word: "Word", excel: "Excel", powerpoint: "PowerPoint" };

const brandIcons: Record<string, { color: string; body: string }> = {
  ChatGPT: { color: "#111111", body: '<path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-.141-.085-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z"/>' },
  Claude: { color: "#D97757", body: '<path fill="currentColor" d="m4.714 15.956 4.718-2.648.079-.23-.08-.128h-.23l-.79-.048-2.695-.073-2.337-.097-2.265-.122-.57-.121-.535-.704.055-.353.48-.321.685.06 1.518.104 2.277.157 1.651.098 2.447.255h.389l.054-.158-.133-.097-.103-.098-2.356-1.596-2.55-1.688-1.336-.972-.722-.491L2 6.223l-.158-1.008.656-.722.88.06.224.061.893.686 1.906 1.476 2.49 1.833.364.304.146-.104.018-.072-.164-.274-1.354-2.446-1.445-2.49-.644-1.032-.17-.619a3 3 0 0 1-.103-.729L6.287.133 6.7 0l.995.134.42.364.619 1.415L9.735 4.14l1.555 3.03.455.898.243.832.09.255h.159V9.01l.127-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.583.28.48.685-.067.444-.286 1.851-.558 2.903-.365 1.942h.213l.243-.242.983-1.306 1.652-2.064.728-.82.85-.904.547-.431h1.032l.759 1.129-.34 1.166-1.063 1.347-.88 1.142-1.263 1.7-.79 1.36.074.11.188-.02 2.853-.606 1.542-.28 1.84-.315.832.388.09.395-.327.807-1.967.486-2.307.462-3.436.813-.043.03.049.061 1.548.146.662.036h1.62l3.018.225.79.522.473.638-.08.485-1.213.62-1.64-.389-3.825-.91-1.31-.329h-.183v.11l1.093 1.068 2.003 1.81 2.508 2.33.127.578-.321.455-.34-.049-2.204-1.657-.85-.747-1.925-1.62h-.127v.17l.443.649 2.343 3.521.122 1.08-.17.353-.607.213-.668-.122-1.372-1.924-1.415-2.168-1.141-1.943-.14.08-.674 7.254-.316.37-.728.28-.607-.461-.322-.747.322-1.476.388-1.924.316-1.53.285-1.9.17-.632-.012-.042-.14.018-1.432 1.967-2.18 2.945-1.724 1.845-.413.164-.716-.37.066-.662.401-.589 2.386-3.036 1.439-1.882.929-1.086-.006-.158h-.055L4.138 18.56l-1.13.146-.485-.456.06-.746.231-.243 1.907-1.312Z"/>' },
  Gemini: { color: "#3285FF", body: '<path fill="currentColor" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"/>' },
  Word: { color: "#2B579A", body: '<path fill="currentColor" d="M23.004 1.5q.41 0 .703.293t.293.703v19.008q0 .41-.293.703t-.703.293H6.996q-.41 0-.703-.293T6 21.504V18H.996q-.41 0-.703-.293T0 17.004V6.996q0-.41.293-.703T.996 6H6V2.496q0-.41.293-.703t.703-.293zM6.035 11.203l1.442 4.735h1.64l1.57-7.876H9.036l-.937 4.653-1.325-4.5H5.38l-1.406 4.523-.938-4.675H1.312l1.57 7.874h1.641zM22.5 21v-3h-15v3zm0-4.5v-3.75H12v3.75zm0-5.25V7.5H12v3.75zm0-5.25V3h-15v3Z"/>' },
  Excel: { color: "#217346", body: '<path fill="currentColor" d="M23 1.5q.41 0 .7.3.3.29.3.7v19q0 .41-.3.7-.29.3-.7.3H7q-.41 0-.7-.3-.3-.29-.3-.7V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h5V2.5q0-.41.3-.7.29-.3.7-.3zM6 13.28l1.42 2.66h2.14l-2.38-3.87 2.34-3.8H7.46l-1.3 2.4-.05.08-.04.09-.64-1.28-.66-1.29H2.59l2.27 3.82-2.48 3.85h2.16zM14.25 21v-3H7.5v3zm0-4.5v-3.75H12v3.75zm0-5.25V7.5H12v3.75zm0-5.25V3H7.5v3zm8.25 15v-3h-6.75v3zm0-4.5v-3.75h-6.75v3.75zm0-5.25V7.5h-6.75v3.75zm0-5.25V3h-6.75v3Z"/>' },
  PowerPoint: { color: "#B7472A", body: '<path fill="currentColor" d="M13.5 1.5q1.453 0 2.795.375t2.508 1.06 2.12 1.641q.956.955 1.641 2.121.686 1.166 1.061 2.508T24 12t-.375 2.795-1.06 2.508q-.686 1.166-1.641 2.12-.955.956-2.121 1.641-1.166.686-2.508 1.061T13.5 22.5q-1.29 0-2.52-.305-1.23-.304-2.337-.884T6.58 19.893Q5.625 19.055 4.887 18H.997q-.411 0-.704-.293T0 17.004V6.996q0-.41.293-.703T.996 6h3.89q.739-1.055 1.694-1.893.955-.837 2.063-1.418 1.107-.58 2.337-.884T13.5 1.5m.75 1.535v8.215h8.215q-.14-1.64-.826-3.076t-1.782-2.531q-1.095-1.096-2.537-1.782t-3.07-.826m-5.262 7.57q0-.68-.228-1.166-.229-.486-.627-.79-.399-.305-.938-.446-.539-.14-1.172-.14H2.848v7.863h1.84v-2.742H5.93q.574 0 1.119-.17t.978-.493q.434-.322.698-.802t.263-1.114M13.5 21q1.172 0 2.262-.287t2.056-.82 1.776-1.278q.808-.744 1.418-1.664t.984-1.986q.375-1.067.469-2.227h-9.703V3.035q-1.735.14-3.27.908T6.797 6h4.207q.41 0 .703.293t.293.703v10.008q0 .41-.293.703t-.703.293H6.797q.644.715 1.412 1.271.768.557 1.623.944t1.781.586T13.5 21M5.812 9.598q.575 0 .915.228.34.229.34.838 0 .27-.124.44-.123.17-.31.275-.188.105-.422.146t-.445.041H4.687V9.598Z"/>' },
  Outlook: { color: "#0078D4", body: '<path fill="currentColor" d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87.34-.76q.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55t.31.77q.1.43.1.88M24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75v8.3l1.24.72h.01q.1.07.18.18.07.12.07.25m-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83-1.55-.3q-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z"/>' },
  SharePoint: { color: "#038387", body: '<path fill="currentColor" d="M24 13.5q0 1.242-.475 2.332-.474 1.09-1.289 1.904-.814.815-1.904 1.29-1.09.474-2.332.474-.762 0-1.523-.2-.106.997-.557 1.858t-1.154 1.494-1.606.99q-.902.358-1.91.358-1.09 0-2.045-.416t-1.664-1.125-1.125-1.664T6 18.75q0-.188.018-.375.017-.188.04-.375H.997q-.41 0-.703-.293T0 17.004V6.996q0-.41.293-.703T.996 6h3.54q.14-1.277.726-2.373T6.75 1.723Q7.652.914 8.807.457 9.96 0 11.25 0q1.395 0 2.625.533T16.02 1.98t1.447 2.145T18 6.75q0 .188-.012.375-.011.188-.035.375 1.242 0 2.344.469t1.928 1.277 1.3 1.904Q24 12.246 24 13.5m-12.75-12q-.973 0-1.857.34-.885.34-1.577.943-.691.604-1.154 1.43T6.06 6h4.945q.41 0 .703.293t.293.703v4.945l.21-.035q.212-.75.61-1.424.399-.673.944-1.218t1.213-.944q.668-.398 1.43-.61.093-.503.093-.96 0-1.09-.416-2.045T14.96 3.041t-1.664-1.125T11.25 1.5M6.117 15.902q.54 0 1.06-.111.522-.111.932-.37.41-.257.662-.679t.252-1.055-.263-1.054-.662-.703-.856-.463l-.855-.34q-.399-.158-.662-.334-.264-.176-.264-.445 0-.2.14-.323t.335-.193q.193-.07.404-.094.21-.023.351-.023.598 0 1.055.152.457.153.95.457V8.543q-.282-.082-.522-.14-.24-.06-.475-.1t-.486-.059q-.252-.017-.557-.017-.515 0-1.054.117-.54.117-.979.375-.44.258-.715.68-.275.421-.275 1.03 0 .598.263.997.264.398.663.68.398.28.855.474l.856.363q.398.17.662.358.263.187.263.457 0 .222-.123.351-.123.13-.31.2-.188.07-.393.087-.205.018-.369.018-.703 0-1.248-.234t-1.107-.621v1.875q1.195.468 2.472.468M11.25 22.5q.773 0 1.453-.293t1.19-.803.808-1.195Q15 19.523 15 18.75q0-.668-.223-1.277-.222-.61-.62-1.096-.4-.486-.95-.826T12 15.071v1.933q0 .41-.293.703t-.703.293H7.57q-.07.375-.07.75 0 .773.293 1.459t.803 1.195q.51.51 1.195.803.686.293 1.459.293M18 18q.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752 0-.926-.352-1.746-.351-.82-.966-1.436-.616-.615-1.436-.966Q18.926 9 18 9t-1.74.357q-.815.358-1.43.973t-.973 1.43q-.357.814-.357 1.74 0 .129.006.258t.017.258q.551.27 1.02.65t.838.855.627 1.026q.258.55.387 1.148Q17.18 18 18 18"/>' },
  Teams: { color: "#6264A7", body: '<path fill="currentColor" d="M20.625 8.127q-.55 0-1.025-.205t-.832-.563-.563-.832T18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837t.205 1.02q0 .55-.205 1.025t-.563.832q-.357.358-.837.563t-1.02.205m0-3.75q-.469 0-.797.328t-.328.797.328.797.797.328.797-.328.328-.797-.328-.797-.797-.328M24 10.002v5.578q0 .774-.293 1.46t-.803 1.194q-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729t-1.319 1.336-1.67.861-1.898.305q-1.148 0-2.162-.398-1.014-.399-1.805-1.102t-1.312-1.664-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275 1.114.75q.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328t.328.797M12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773t.158.78q.159.368.428.638.27.27.639.428t.779.158.773-.158q.364-.159.64-.428.274-.27.433-.639t.158-.779-.158-.773q-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158M6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752m5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879"/>' },
};

const synonymGroups = [
  ["clean", "refine", "rewrite", "improve", "enhance", "edit", "professional", "polish", "format"],
  ["report", "document", "brief", "summary", "executive", "output", "word"],
  ["email", "message", "communication", "outlook", "reply", "draft"],
  ["slides", "powerpoint", "presentation", "deck"],
  ["sheet", "excel", "spreadsheet", "workbook", "table"],
  ["find", "search", "research", "review", "analyse", "analyze"],
  ["prompt", "instruction", "workflow", "template"],
];
const synonyms = Object.fromEntries(synonymGroups.flatMap((group) => group.map((word) => [word, group.filter((item) => item !== word)])));

function Icon({ name }: { name: "spark" | "search" | "copy" | "check" | "plus" | "library" | "chevron" | "close" | "play" | "arrow" | "trash" | "save" }) {
  const paths = {
    spark: <><path d="M12 2.8l1.45 4.35L18 8.6l-4.55 1.45L12 14.6l-1.45-4.55L6 8.6l4.55-1.45L12 2.8Z"/><path d="m5 15 .85 2.15L8 18l-2.15.85L5 21l-.85-2.15L2 18l2.15-.85L5 15Z"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.3 4.3"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    check: <path d="m5 12 4 4L19 6"/>, plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    library: <><rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>, close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
    play: <path d="m9 7 8 5-8 5V7Z"/>, arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
    save: <><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Logo({ name, size = 22 }: { name: string; size?: number }) {
  if (name === "Microsoft Copilot") return <span className="copilot-logo" style={{ width: size, height: size }} role="img" aria-label="Microsoft Copilot logo"><i/><i/><i/><i/></span>;
  const icon = brandIcons[name];
  return <svg className="app-logo" width={size} height={size} viewBox="0 0 24 24" style={{ color: icon?.color }} role="img" aria-label={`${name} logo`} dangerouslySetInnerHTML={{ __html: icon?.body || "" }}/>;
}

function appFor(prompt: Prompt) {
  const value = [prompt.title, prompt.category, prompt.description, prompt.outputFormat, ...prompt.tags].join(" ").toLowerCase();
  return value.includes("excel") || value.includes("spreadsheet") ? "excel" : value.includes("powerpoint") || value.includes("presentation") ? "powerpoint" : value.includes("word") || value.includes("document") ? "word" : null;
}

function indexText(prompt: Prompt) {
  const tool = appFor(prompt) || "ai";
  return [prompt.title, prompt.description, prompt.category, prompt.prompt, prompt.requiredInputs, prompt.outputFormat, prompt.complexity, tool, ...prompt.tags].join(" ").toLowerCase();
}

export default function Home() {
  const [view, setView] = useState<View>("library");
  const [mobileTab, setMobileTab] = useState<MobileTab>("library");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All prompts");
  const [selected, setSelected] = useState<Prompt>(prompts[0]);
  const [copied, setCopied] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem("prompt-picker-drafts") || "[]");
        setDrafts(Array.isArray(stored) ? stored : []);
      } catch { setDrafts([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".run-menu, .mobile-sheet, .create-run")) return;
      if (!menuRef.current?.contains(event.target as Node)) setRunOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    document.body.style.overflow = (runOpen || createOpen || mobileDetail || pendingRun) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [runOpen, createOpen, mobileDetail, pendingRun]);

  const searchablePrompts = useMemo(() => [...drafts, ...prompts], [drafts]);
  const filtered = useMemo(() => {
    const raw = query.toLowerCase().match(/[a-z0-9]+/g) || [];
    const terms = [...new Set(raw.flatMap((word) => [word, ...(synonyms[word] || [])]))];
    return searchablePrompts
      .filter((prompt) => category === "All prompts" || prompt.category === category)
      .map((prompt) => {
        const haystack = indexText(prompt);
        const score = terms.reduce((total, word) => total + (haystack.includes(word) ? (word.length > 5 ? 3 : 2) : 0), 0)
          + (raw.some((word) => prompt.title.toLowerCase().includes(word)) ? 6 : 0)
          + (raw.some((word) => prompt.description.toLowerCase().includes(word)) ? 3 : 0);
        return { prompt, score };
      })
      .filter((item) => raw.length === 0 || item.score > 0)
      .sort((a, b) => b.score - a.score || a.prompt.id - b.prompt.id)
      .map((item) => item.prompt);
  }, [searchablePrompts, query, category]);

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400); };
  const showError = (message: string) => { setError(message); window.setTimeout(() => setError(""), 4200); };
  const copyPrompt = async (text = selected.prompt) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      flash("Prompt copied");
      window.setTimeout(() => setCopied(false), 1800);
      return true;
    } catch {
      showError("Copy failed. Select the prompt text and copy it manually.");
      return false;
    }
  };
  const handleRun = (platformId: PlatformId, text = selected.prompt, event?: MouseEvent<HTMLAnchorElement>) => {
    const platform = AI_PLATFORMS[platformId];
    const promptText = text;
    const url = buildAIUrl(platformId, promptText);
    if (platform.supportsQuerystring) {
      const opened = window.open(url, "_blank");
      if (opened) opened.opener = null;
      if (opened) event?.preventDefault();
      if (opened) setRunOpen(false);
      else window.setTimeout(() => setRunOpen(false), 0);
      return;
    }

    setRunOpen(false);
    if (!navigator.clipboard?.writeText) {
      setPendingRun({ platformId, platformName: platform.name, promptText, url, copied: false, copyFailed: true });
      return;
    }
    navigator.clipboard.writeText(promptText)
      .then(() => setPendingRun({ platformId, platformName: platform.name, promptText, url, copied: true, copyFailed: false }))
      .catch(() => setPendingRun({ platformId, platformName: platform.name, promptText, url, copied: false, copyFailed: true }));
  };
  const openPendingRun = () => {
    if (!pendingRun) return;
    const opened = window.open(pendingRun.url, "_blank");
    if (!opened) showError("External navigation was blocked in this preview frame. Test from the published site.");
    setPendingRun(null);
  };
  const manualCopyPendingRun = async () => {
    if (!pendingRun) return;
    try {
      await navigator.clipboard.writeText(pendingRun.promptText);
      setPendingRun({ ...pendingRun, copied: true, copyFailed: false });
      flash("Prompt copied");
    } catch {
      showError("Copy failed. Select the prompt text and copy it manually.");
    }
  };
  const openSearch = (nextQuery = "", nextCategory = "All prompts") => {
    setView("search"); setMobileTab("search"); setQuery(nextQuery); setCategory(nextCategory); setMobileDetail(false);
    window.setTimeout(() => searchRef.current?.focus(), 60);
  };
  const openLibrary = () => { setView("library"); setMobileTab("library"); setMobileDetail(false); };
  const openCreate = () => { setCreateOpen(true); setMobileTab("create"); };
  const choosePrompt = (prompt: Prompt) => { setSelected(prompt); setMobileDetail(true); };
  const mobileNavigate = (tab: MobileTab) => {
    if (tab === "library") openLibrary();
    if (tab === "search") openSearch(query, category);
    if (tab === "create") openCreate();
    if (tab === "run") { setMobileTab("run"); setRunOpen(true); }
  };

  return <main className="shell">
    <header className="topbar">
      <button className="brand" onClick={openLibrary}><span className="brand-orb"><Icon name="spark"/></span><span>Prompt Finder</span></button>
      <nav>
        <button className={view === "library" ? "active" : ""} onClick={openLibrary}><Icon name="library"/> Library</button>
        <button className={view === "search" ? "active" : ""} onClick={() => openSearch()}><Icon name="search"/> Search</button>
        <button onClick={openCreate}><Icon name="plus"/> Create Prompt</button>
      </nav>
      <div className="profile"><span><b>Prompt Finder</b><small>Prompt workspace</small></span><i>PF</i></div>
    </header>

    {view === "library" ? <LibraryDashboard drafts={drafts} onCreate={openCreate} onFind={() => openSearch()} onTool={(name) => openSearch(name)} onCategory={(name) => openSearch("", name)}/> :
      <SearchView query={query} setQuery={setQuery} category={category} setCategory={setCategory} selected={selected} filtered={filtered} copied={copied} runOpen={runOpen} mobileFilters={mobileFilters} setMobileFilters={setMobileFilters} searchRef={searchRef} menuRef={menuRef} onChoose={choosePrompt} onCopy={() => copyPrompt()} onRunToggle={() => setRunOpen(!runOpen)} onRun={handleRun}/>
    }

    <nav className="bottom-nav" aria-label="Mobile navigation">
      {([['library', 'library', 'Library'], ['search', 'search', 'Search'], ['create', 'plus', 'Create'], ['run', 'play', 'Run in AI']] as const).map(([tab, icon, label]) =>
        <button key={tab} className={mobileTab === tab ? "active" : ""} onClick={() => mobileNavigate(tab)}><Icon name={icon}/><span>{label}</span></button>)}
    </nav>

    {mobileDetail && <div className="mobile-detail">
      <header><button onClick={() => setMobileDetail(false)}><Icon name="arrow"/> Back</button></header>
      <DetailPanel selected={selected} copied={copied} runOpen={runOpen} menuRef={menuRef} onCopy={() => copyPrompt()} onRunToggle={() => setRunOpen(!runOpen)} onRun={handleRun}/>
    </div>}
    {runOpen && <RunSheet selected={selected} onClose={() => { setRunOpen(false); setMobileTab(view); }} onRun={handleRun}/>} 
    {createOpen && <CreatePrompt drafts={drafts} onDrafts={setDrafts} onClose={() => { setCreateOpen(false); setMobileTab(view); }} onRun={handleRun} flash={flash} showError={showError}/>} 
    {pendingRun && <RunConfirmation pendingRun={pendingRun} onClose={() => setPendingRun(null)} onOpen={openPendingRun} onManualCopy={manualCopyPendingRun}/>}
    {notice && <div className="toast success"><Icon name="check"/>{notice}</div>}
    {error && <div className="toast error">{error}</div>}
  </main>;
}

function LibraryDashboard({ drafts, onCreate, onFind, onTool, onCategory }: { drafts: Draft[]; onCreate: () => void; onFind: () => void; onTool: (name: string) => void; onCategory: (name: string) => void }) {
  return <section className="library-dashboard">
    <div className="dashboard-hero">
      <div><span className="eyebrow"><Icon name="spark"/> PROMPT LIBRARY</span><h1>Your prompt workspace.<br/><em>Ready when you are.</em></h1><p>Browse your library, find the right prompt, or create a new draft for a specific task.</p><div className="dashboard-actions"><button className="dashboard-primary" onClick={onCreate}><Icon name="plus"/> Create Prompt</button><button className="raised" onClick={onFind}><Icon name="search"/> Find a Prompt</button></div></div>
      <div className="count-panel"><small>Total prompts</small><strong>{prompts.length}</strong><span>Ready to use</span>{drafts.length > 0 && <div><b>{drafts.length}</b> Draft prompts</div>}</div>
    </div>
    <div className="dashboard-section"><div className="section-heading"><div><span>TOOLS</span><h2>Work with your preferred app</h2></div><small>Select a tool to find related prompts.</small></div><div className="tool-grid">{allTools.map((tool) => <button key={tool.name} onClick={() => onTool(tool.name)}><span><Logo name={tool.name} size={28}/></span><b>{tool.name}</b><Icon name="arrow"/></button>)}</div></div>
    <div className="dashboard-section category-section"><div className="section-heading"><div><span>CATEGORIES</span><h2>Browse by work area</h2></div></div><div className="category-pills">{categories.filter((item) => item !== "All prompts").map((item) => <button key={item} onClick={() => onCategory(item)}>{item}</button>)}</div></div>
  </section>;
}

function SearchView({ query, setQuery, category, setCategory, selected, filtered, copied, runOpen, mobileFilters, setMobileFilters, searchRef, menuRef, onChoose, onCopy, onRunToggle, onRun }: { query: string; setQuery: (value: string) => void; category: string; setCategory: (value: string) => void; selected: Prompt; filtered: Prompt[]; copied: boolean; runOpen: boolean; mobileFilters: boolean; setMobileFilters: (value: boolean) => void; searchRef: RefObject<HTMLInputElement | null>; menuRef: RefObject<HTMLDivElement | null>; onChoose: (prompt: Prompt) => void; onCopy: () => void; onRunToggle: () => void; onRun: (platformId: PlatformId, text?: string, event?: MouseEvent<HTMLAnchorElement>) => void }) {
  return <><section className="search-intro"><span className="eyebrow"><Icon name="search"/> FIND A PROMPT</span><h1>What do you need to do?</h1><p>Search by task, purpose, tool, output, or a short phrase.</p></section><section className="workspace"><aside className="browser-panel">
    <div className="search-wrap"><Icon name="search"/><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “clean report” or “improve email”" aria-label="Search prompts"/>{query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close"/></button>}</div>
    <button className="mobile-filter" onClick={() => setMobileFilters(!mobileFilters)}>{category}<Icon name="chevron"/></button>
    <div className={`filter-row ${mobileFilters ? "show" : ""}`}>{categories.map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => { setCategory(item); setMobileFilters(false); }}>{item}</button>)}</div>
    <div className="result-line"><strong>{filtered.length} prompts</strong><span>Best matches first</span></div>
    <div className="prompt-grid">{filtered.map((prompt) => { const app = appFor(prompt); return <button key={`${prompt.sourceId}-${prompt.id}`} className={`prompt-card ${selected.sourceId === prompt.sourceId ? "selected" : ""}`} onClick={() => onChoose(prompt)}><span className="card-head">{app ? <Logo name={officeNames[app]}/> : <span className="mini-orb"><Icon name="spark"/></span>}<small>{prompt.category}</small></span><strong>{prompt.title}</strong><p>{prompt.description}</p><span className="card-bottom"><span>{prompt.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span><Icon name="arrow"/></span></button>; })}{filtered.length === 0 && <div className="empty"><Icon name="search"/><strong>No matching prompts</strong><span>Try another phrase or category.</span></div>}</div>
  </aside><DetailPanel selected={selected} copied={copied} runOpen={runOpen} menuRef={menuRef} onCopy={onCopy} onRunToggle={onRunToggle} onRun={onRun}/></section></>;
}

function DetailPanel({ selected, copied, runOpen, menuRef, onCopy, onRunToggle, onRun }: { selected: Prompt; copied: boolean; runOpen: boolean; menuRef: RefObject<HTMLDivElement | null>; onCopy: () => void; onRunToggle: () => void; onRun: (platformId: PlatformId, text?: string, event?: MouseEvent<HTMLAnchorElement>) => void }) {
  return <section className="detail-panel"><div className="detail-scroll"><div className="detail-meta"><span>{selected.category}</span><small>{selected.readiness.replace(/^\d+%\s*\|\s*/, "")}</small></div><h2>{selected.title}</h2><p className="lead">{selected.description}</p><div className="info-grid"><div><small>Required inputs</small><p>{selected.requiredInputs}</p></div><div><small>Output</small><p>{selected.outputFormat}</p></div></div><div className="prompt-block"><div><span>Prompt</span><button onClick={onCopy}><Icon name={copied ? "check" : "copy"}/>{copied ? "Copied" : "Copy"}</button></div><pre>{selected.prompt}</pre></div></div><div className="detail-actions"><button className="raised copy-main" onClick={onCopy}><Icon name={copied ? "check" : "copy"}/>{copied ? "Prompt copied" : "Copy prompt"}</button><div className="run-menu" ref={menuRef}><button className="run-main" onClick={onRunToggle} aria-expanded={runOpen}><Icon name="play"/> Run in AI <Icon name="chevron"/></button>{runOpen && <div className="ai-popover"><small>CHOOSE AN AI TOOL</small>{aiTools.map((tool) => AI_PLATFORMS[tool.id].supportsQuerystring ? <a key={tool.id} href={buildAIUrl(tool.id, selected.prompt)} target="_blank" rel="noopener noreferrer" onClick={(event) => onRun(tool.id, selected.prompt, event)}><Logo name={tool.name}/><span><b>{tool.name}</b><small>Open with prompt included</small></span></a> : <button key={tool.id} onClick={() => onRun(tool.id)}><Logo name={tool.name}/><span><b>{tool.name}</b><small>Copy prompt, then confirm open</small></span></button>)}</div>}</div></div></section>;
}

function RunSheet({ onClose, selected, onRun }: { onClose: () => void; selected: Prompt; onRun: (platformId: PlatformId, text?: string, event?: MouseEvent<HTMLAnchorElement>) => void }) {
  return <div className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Run in AI" onClick={onClose}><div onClick={(event) => event.stopPropagation()}><i/><header><div><h3>Run in AI</h3><p>ChatGPT and Claude open with the prompt included. Gemini and Copilot copy first.</p></div><button onClick={onClose} aria-label="Close"><Icon name="close"/></button></header><section>{aiTools.map((tool) => AI_PLATFORMS[tool.id].supportsQuerystring ? <a key={tool.id} href={buildAIUrl(tool.id, selected.prompt)} target="_blank" rel="noopener noreferrer" onClick={(event) => onRun(tool.id, selected.prompt, event)}><Logo name={tool.name}/><span><b>{tool.name}</b><small>Open with prompt included</small></span><Icon name="arrow"/></a> : <button key={tool.id} onClick={() => onRun(tool.id)}><Logo name={tool.name}/><span><b>{tool.name}</b><small>Copy prompt, then confirm open</small></span><Icon name="arrow"/></button>)}</section></div></div>;
}

function RunConfirmation({ pendingRun, onClose, onOpen, onManualCopy }: { pendingRun: PendingRun; onClose: () => void; onOpen: () => void; onManualCopy: () => void }) {
  return <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={`Open ${pendingRun.platformName}`} onClick={onClose}><section className="confirm-dialog" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow"><Icon name={pendingRun.copied ? "check" : "copy"}/> RUN IN AI</span><h2>{pendingRun.copied ? "Prompt copied." : "Copy the prompt manually."}</h2><p>{pendingRun.copied ? `Open ${pendingRun.platformName} and paste it into the chat.` : `Clipboard access failed. Copy the prompt below before opening ${pendingRun.platformName}.`}</p></div><button onClick={onClose} aria-label="Close"><Icon name="close"/></button></header>{pendingRun.copyFailed && <div className="copy-fallback"><strong>Manual fallback</strong><p>Use the manual copy button, or select and copy the prompt below before opening {pendingRun.platformName}.</p><textarea value={pendingRun.promptText} readOnly/><button className="raised" onClick={onManualCopy}><Icon name="copy"/> Manual Copy</button></div>}<div className="confirm-actions"><button className="raised" onClick={onClose}>Cancel</button><button className="run-main" onClick={onOpen}><Icon name="arrow"/> Open {pendingRun.platformName}</button></div></section></div>;
}

function CreatePrompt({ drafts, onDrafts, onClose, onRun, flash, showError }: { drafts: Draft[]; onDrafts: (drafts: Draft[]) => void; onClose: () => void; onRun: (platformId: PlatformId, text?: string, event?: MouseEvent<HTMLAnchorElement>) => void; flash: (message: string) => void; showError: (message: string) => void }) {
  const [request, setRequest] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState("");
  const [runOpen, setRunOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!request.trim()) { showError("Add a short request first."); return; }
    setGenerating(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(PROMPT_BUILDER_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: request.trim() }), signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The prompt could not be generated. Please try again.");
      const generated = typeof data?.prompt === "string" ? data.prompt : "";
      if (!generated) throw new Error("No prompt returned");
      setPreview(generated);
      if (!title.trim()) setTitle(makeDraftTitle(request));
      flash("Prompt generated");
    } catch (error) { showError(error instanceof Error && error.name === "AbortError" ? "Prompt generation timed out. Please try again." : error instanceof Error ? error.message : "The prompt could not be generated. Please try again."); }
    finally { window.clearTimeout(timeout); setGenerating(false); }
  };
  const clear = () => { setRequest(""); setTitle(""); setPreview(""); setRunOpen(false); };
  const save = () => {
    if (!preview.trim()) { showError("Generate or enter a prompt before saving."); return; }
    const now = new Date().toISOString();
    const id = Date.now();
    const draftTitle = title.trim() || makeDraftTitle(request) || "Untitled draft";
    const draft: Draft = { id, sourceId: `DRAFT-${id}`, title: draftTitle, category: "Draft", description: "Locally saved prompt builder draft", prompt: preview, tags: ["draft", "prompt builder"], status: "Draft", readiness: "Draft", requiredInputs: request.trim() || "Not specified", outputFormat: "Optimized prompt", complexity: "Draft", frequency: "Not set", value: "", draft: true, createdAt: now, updatedAt: now };
    const next = [draft, ...drafts];
    onDrafts(next); localStorage.setItem("prompt-picker-drafts", JSON.stringify(next)); flash("Draft saved locally");
  };
  const copy = async () => { try { await navigator.clipboard.writeText(preview); flash("Prompt copied"); } catch { showError("Copy failed. Select the prompt text and copy it manually."); } };

  return <div className="create-overlay" onClick={onClose}><section className="create-drawer" role="dialog" aria-modal="true" aria-label="Prompt Builder" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow"><Icon name="spark"/> PROMPT BUILDER</span><h2>Build a stronger prompt</h2><p>Describe the task in natural language, then edit the optimized prompt before using it.</p></div><button onClick={onClose} aria-label="Close"><Icon name="close"/></button></header><div className="create-content builder-content"><form onSubmit={(event) => { event.preventDefault(); generate(); }}>
    <label className="builder-request"><span>Your request <b>Required</b></span><textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Describe what you want AI to do..."/></label>
    <button className="generate-button" type="submit" disabled={generating}><Icon name="spark"/>{generating ? "Generating..." : "Generate Prompt"}</button>
  </form><aside className="preview-card"><div><span>OUTPUT EDITOR</span><i className={preview ? "ready" : ""}>{preview ? "Editable" : "Waiting"}</i></div><label className="draft-title"><span>Draft title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title for saved draft"/></label><textarea value={preview} onChange={(event) => setPreview(event.target.value)} placeholder="The optimized prompt will appear here. You can edit it before copying, running, or saving."/><div className="create-actions"><button className="raised" disabled={!preview} onClick={copy}><Icon name="copy"/> Copy Prompt</button><div className="create-run"><button className="run-main" disabled={!preview} onClick={() => setRunOpen(!runOpen)}><Icon name="play"/> Run in AI</button>{runOpen && <div className="ai-popover">{aiTools.map((tool) => AI_PLATFORMS[tool.id].supportsQuerystring ? <a key={tool.id} href={buildAIUrl(tool.id, preview)} target="_blank" rel="noopener noreferrer" onClick={(event) => onRun(tool.id, preview, event)}><Logo name={tool.name}/><b>{tool.name}</b></a> : <button key={tool.id} onClick={() => onRun(tool.id, preview)}><Logo name={tool.name}/><b>{tool.name}</b></button>)}</div>}</div><button className="raised" disabled={!preview} onClick={save}><Icon name="save"/> Save Draft</button><button className="raised" onClick={clear}><Icon name="trash"/> Clear</button></div></aside></div></section></div>;
}

function makeDraftTitle(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > 56 ? `${cleaned.slice(0, 53).trim()}...` : cleaned;
}

