import { env } from "cloudflare:workers";
import { handlePromptBuilderRequest } from "./prompt-builder.mjs";

type RuntimeEnv = { OPENAI_API_KEY?: string };

export async function POST(request: Request) {
  return handlePromptBuilderRequest(request, (env as unknown as RuntimeEnv).OPENAI_API_KEY);
}

