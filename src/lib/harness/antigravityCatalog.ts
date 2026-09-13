import { homeDir } from "../fs";
import { setHarnessModels, type AgentModel } from "../models";
import { execChild, resolveAntigravityBinary } from "./child";

export const ANTIGRAVITY_MODEL_CATALOG: AgentModel[] = [
  {
    id: "antigravity:gemini-3.8-flash-high",
    harness: "antigravity",
    name: "Gemini 3.8 Flash (High)",
    nativeId: "gemini-3.8-flash-high",
  },
  {
    id: "antigravity:gemini-3.8-flash-medium",
    harness: "antigravity",
    name: "Gemini 3.8 Flash (Medium)",
    nativeId: "gemini-3.8-flash-medium",
  },
  {
    id: "antigravity:gemini-3.8-flash-low",
    harness: "antigravity",
    name: "Gemini 3.8 Flash (Low)",
    nativeId: "gemini-3.8-flash-low",
  },
  {
    id: "antigravity:gemini-3.7-flash-high",
    harness: "antigravity",
    name: "Gemini 3.7 Flash (High)",
    nativeId: "gemini-3.7-flash-high",
  },
  {
    id: "antigravity:gemini-3.1-pro-high",
    harness: "antigravity",
    name: "Gemini 3.1 Pro (High)",
    nativeId: "gemini-3.1-pro-high",
  },
  {
    id: "antigravity:claude-sonnet-4-6",
    harness: "antigravity",
    name: "Claude Sonnet 4.6 (Thinking)",
    nativeId: "claude-sonnet-4-6",
  },
  {
    id: "antigravity:claude-opus-4-6-thinking",
    harness: "antigravity",
    name: "Claude Opus 4.6 (Thinking)",
    nativeId: "claude-opus-4-6-thinking",
  },
  {
    id: "antigravity:gpt-oss-120b-medium",
    harness: "antigravity",
    name: "GPT-OSS 120B (Medium)",
    nativeId: "gpt-oss-120b-medium",
  },
];

let inflight: Promise<void> | null = null;

export function refreshAntigravityCatalog(): Promise<void> {
  if (inflight) return inflight;
  inflight = discoverAntigravityModels()
    .then((models) => {
      if (models.length > 0) setHarnessModels("antigravity", models);
    })
    .catch((error: unknown) => {
      console.debug("[monocode] antigravity catalog", error);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function discoverAntigravityModels(): Promise<AgentModel[]> {
  try {
    const { path } = await resolveAntigravityBinary();
    const cwd = await homeDir();
    const output = await execChild(path, ["models"], cwd);
    const parsed = parseModelsOutput(output);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    console.debug("[monocode] agy models failed", error);
  }
  return ANTIGRAVITY_MODEL_CATALOG;
}

export function parseModelsOutput(output: string): AgentModel[] {
  const lines = output.split(/\r?\n/);
  const models: AgentModel[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("fetching")) continue;
    const parts = trimmed.split(/\t+/);
    if (parts.length >= 2) {
      const nativeId = parts[0].trim();
      const name = parts[1].trim();
      if (!nativeId || seen.has(nativeId)) continue;
      seen.add(nativeId);
      models.push({
        id: `antigravity:${nativeId}`,
        harness: "antigravity",
        name: name || nativeId,
        nativeId,
      });
    }
  }

  return models;
}
