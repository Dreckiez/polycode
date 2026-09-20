import type { AgentModel } from "./models";

export const MODELS: AgentModel[] = [
  {
    id: "claude:sonnet-5",
    harness: "claude",
    name: "Claude Sonnet 5",
    nativeId: "claude-sonnet-5",
  },
  {
    id: "claude:opus-5",
    harness: "claude",
    name: "Claude Opus 5",
    nativeId: "claude-opus-5",
  },
  {
    id: "claude:fable-5",
    harness: "claude",
    name: "Claude Fable 5",
    nativeId: "claude-fable-5",
  },
  {
    id: "claude:opus-4.6",
    harness: "claude",
    name: "Opus 4.6",
    nativeId: "claude-opus-4-6",
  },
  {
    id: "claude:sonnet-4.6",
    harness: "claude",
    name: "Sonnet 4.6",
    nativeId: "claude-sonnet-4-6",
  },
  {
    id: "claude:haiku-4.5",
    harness: "claude",
    name: "Haiku 4.5",
    nativeId: "claude-haiku-4-5",
  },
  {
    id: "claude:opus-4.5",
    harness: "claude",
    name: "Opus 4.5",
    nativeId: "claude-opus-4-5",
  },

  {
    id: "cursor:composer-2.5",
    harness: "cursor",
    name: "Composer 2.5",
    nativeId: "composer-2.5",
  },
  {
    id: "cursor:gpt-5.4",
    harness: "cursor",
    name: "GPT-5.4",
    nativeId: "gpt-5.4",
  },
  {
    id: "cursor:claude-sonnet-4-6",
    harness: "cursor",
    name: "Sonnet 4.6",
    nativeId: "claude-sonnet-4-6",
  },
  {
    id: "cursor:grok-4.6",
    harness: "cursor",
    name: "Cursor Grok 4.6",
    nativeId: "grok-4.6",
  },

  {
    id: "grok:grok-4.6",
    harness: "grok",
    name: "Grok 4.6",
    nativeId: "grok-4.6",
    contextWindow: 500_000,
    settings: [
      {
        id: "effort",
        label: "Reasoning",
        kind: "select",
        value: "high",
        options: [
          { value: "xhigh", label: "Extra High" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ],
      },
    ],
  },
  {
    id: "grok:grok-4.5",
    harness: "grok",
    name: "Grok 4.5",
    nativeId: "grok-4.5",
    contextWindow: 500_000,
    settings: [
      {
        id: "effort",
        label: "Reasoning",
        kind: "select",
        value: "high",
        options: [
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ],
      },
    ],
  },

  { id: "opencode:glm-5", harness: "opencode", name: "GLM 5" },
  { id: "opencode:minimax-m2.5", harness: "opencode", name: "MiniMax M2.5" },
  { id: "opencode:kimi-k2.5", harness: "opencode", name: "Kimi K2.5" },
  {
    id: "opencode:deepseek-v4-flash",
    harness: "opencode",
    name: "DeepSeek V4 Flash",
  },
  { id: "opencode:qwen-3.5", harness: "opencode", name: "Qwen 3.5" },
  { id: "opencode:grok-4.5", harness: "opencode", name: "Grok 4.5" },
  {
    id: "opencode:claude-sonnet-4.6",
    harness: "opencode",
    name: "Claude Sonnet 4.6",
  },
  { id: "opencode:gpt-5.4", harness: "opencode", name: "GPT-5.4" },
  {
    id: "pi:default",
    harness: "pi",
    name: "Default",
    nativeId: "",
  },
  {
    id: "omp:default",
    harness: "omp",
    name: "Default",
    nativeId: "",
  },
  {
    id: "fx:zai/glm-5.2-fast",
    harness: "fx",
    name: "GLM 5.2 Fast",
    nativeId: "zai/glm-5.2-fast",
  },
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

export function getModelEffortBadge(
  model: AgentModel,
  values?: Record<string, string>,
): string | null {
  const effort = model.settings?.find(
    (s) =>
      s.kind === "select" &&
      (s.id === "effort" ||
        s.id === "reasoning" ||
        s.id === "reasoningEffort"),
  );
  if (effort) {
    const rawValue = values?.[effort.id];
    const isValid = rawValue
      ? effort.options.some((opt) => opt.value === rawValue)
      : false;
    const raw = isValid ? rawValue! : effort.value;
    const norm = raw.toLowerCase();
    if (norm === "xhigh" || norm === "extra-high" || norm === "extra_high")
      return "XHIGH";
    if (norm === "high") return "HIGH";
    if (norm === "medium" || norm === "med") return "MED";
    if (norm === "low") return "LOW";
    if (norm === "none" || norm === "off" || norm === "false") return "NONE";
    return norm.toUpperCase();
  }
  if (/thinking/i.test(model.name)) {
    return "THINK";
  }
  return null;
}