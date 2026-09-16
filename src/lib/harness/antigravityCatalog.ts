import { homeDir } from "../fs";
import { setHarnessModels, type AgentModel } from "../models";
import { execChild, resolveAntigravityBinary } from "./child";

export const ANTIGRAVITY_MODEL_CATALOG: AgentModel[] = [
  {
    id: "antigravity:gemini-3.8-flash",
    harness: "antigravity",
    name: "Gemini 3.8 Flash",
    nativeId: "gemini-3.8-flash",
    contextWindow: 1_000_000,
    settings: [
      {
        id: "effort",
        label: "Effort",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "antigravity:gemini-3.7-flash",
    harness: "antigravity",
    name: "Gemini 3.7 Flash",
    nativeId: "gemini-3.7-flash",
    contextWindow: 1_000_000,
    settings: [
      {
        id: "effort",
        label: "Effort",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "antigravity:gemini-3.6-flash",
    harness: "antigravity",
    name: "Gemini 3.6 Flash",
    nativeId: "gemini-3.6-flash",
    contextWindow: 1_000_000,
    settings: [
      {
        id: "effort",
        label: "Effort",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "antigravity:gemini-3.1-pro",
    harness: "antigravity",
    name: "Gemini 3.1 Pro",
    nativeId: "gemini-3.1-pro",
    contextWindow: 1_000_000,
    settings: [
      {
        id: "effort",
        label: "Effort",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
      },
    ],
  },
  {
    id: "antigravity:claude-sonnet-4-6",
    harness: "antigravity",
    name: "Claude Sonnet 4.6 (Thinking)",
    nativeId: "claude-sonnet-4-6",
    contextWindow: 200_000,
  },
  {
    id: "antigravity:claude-opus-4-6-thinking",
    harness: "antigravity",
    name: "Claude Opus 4.6 (Thinking)",
    nativeId: "claude-opus-4-6-thinking",
    contextWindow: 200_000,
  },
  {
    id: "antigravity:gpt-oss-120b-medium",
    harness: "antigravity",
    name: "GPT-OSS 120B (Medium)",
    nativeId: "gpt-oss-120b-medium",
    contextWindow: 128_000,
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

export async function discoverAntigravityModels(): Promise<AgentModel[]> {
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

const EFFORT_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

function inferAntigravityContextWindow(id: string): number {
  if (/claude/i.test(id)) return 200_000;
  if (/gpt-oss/i.test(id)) return 128_000;
  return 1_000_000;
}

export function parseModelsOutput(output: string): AgentModel[] {
  const lines = output.split(/\r?\n/);
  const seen = new Set<string>();

  type Grouped = {
    baseId: string;
    baseName: string;
    effortChoices: Array<{ value: string; label: string }>;
    rawItems: Array<{ nativeId: string; name: string }>;
  };
  const groupedMap = new Map<string, Grouped>();
  const order: string[] = [];
  const standalone: AgentModel[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("fetching")) continue;
    const parts = trimmed.split(/\t+/);
    if (parts.length >= 2) {
      const nativeId = parts[0].trim();
      const name = parts[1].trim();
      if (!nativeId || seen.has(nativeId)) continue;
      seen.add(nativeId);

      const match = nativeId.match(/^(.*)-(low|medium|high)$/i);
      if (match) {
        const baseId = match[1];
        const effort = match[2].toLowerCase();
        const effortLabel = effort.charAt(0).toUpperCase() + effort.slice(1);
        const cleanName = name
          .replace(/\s*[\(\[\-]?\s*(Low|Medium|High)[\)\]]?$/i, "")
          .trim();

        let group = groupedMap.get(baseId);
        if (!group) {
          group = {
            baseId,
            baseName: cleanName || baseId,
            effortChoices: [],
            rawItems: [],
          };
          groupedMap.set(baseId, group);
          order.push(baseId);
        }
        group.rawItems.push({ nativeId, name });
        if (!group.effortChoices.some((c) => c.value === effort)) {
          group.effortChoices.push({ value: effort, label: effortLabel });
        }
      } else {
        standalone.push({
          id: `antigravity:${nativeId}`,
          harness: "antigravity",
          name: name || nativeId,
          nativeId,
          contextWindow: inferAntigravityContextWindow(nativeId),
        });
      }
    }
  }

  const result: AgentModel[] = [];
  for (const baseId of order) {
    const group = groupedMap.get(baseId)!;
    if (group.effortChoices.length < 2) {
      for (const item of group.rawItems) {
        result.push({
          id: `antigravity:${item.nativeId}`,
          harness: "antigravity",
          name: item.name || item.nativeId,
          nativeId: item.nativeId,
          contextWindow: inferAntigravityContextWindow(item.nativeId),
        });
      }
      continue;
    }

    group.effortChoices.sort(
      (a, b) => (EFFORT_ORDER[a.value] ?? 0) - (EFFORT_ORDER[b.value] ?? 0),
    );
    const hasHigh = group.effortChoices.some((c) => c.value === "high");
    const defaultValue = hasHigh
      ? "high"
      : group.effortChoices[0]?.value ?? "medium";

    result.push({
      id: `antigravity:${baseId}`,
      harness: "antigravity",
      name: group.baseName,
      nativeId: baseId,
      contextWindow: inferAntigravityContextWindow(baseId),
      settings: [
        {
          id: "effort",
          label: "Effort",
          kind: "select",
          value: defaultValue,
          options: group.effortChoices,
        },
      ],
    });
  }

  return [...result, ...standalone];
}
