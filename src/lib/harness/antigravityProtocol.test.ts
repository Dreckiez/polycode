import { describe, expect, it } from "vitest";
import {
  buildAgySpawnArgs,
  buildAgyUserMessage,
  parseJsonLine,
  previewFromTool,
  toolKindFromName,
  toolTitle,
} from "./antigravityProtocol";
import { parseModelsOutput } from "./antigravityCatalog";

describe("buildAgySpawnArgs", () => {
  it("includes stream-json and auto-approval flags", () => {
    const args = buildAgySpawnArgs({});
    expect(args).toContain("--input-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--output-format");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args[args.length - 1]).toBe("-p=");
  });

  it("adds model without antigravity prefix", () => {
    const args = buildAgySpawnArgs({ model: "antigravity:gemini-3.8-flash-high" });
    const idx = args.indexOf("--model");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("gemini-3.8-flash-high");
  });

  it("adds effort, mode, and resume conversation", () => {
    const args = buildAgySpawnArgs({
      effort: "high",
      mode: "plan",
      resume: "conv-1234",
    });
    expect(args).toContain("--effort");
    expect(args[args.indexOf("--effort") + 1]).toBe("high");
    expect(args).toContain("--mode");
    expect(args[args.indexOf("--mode") + 1]).toBe("plan");
    expect(args).toContain("--conversation");
    expect(args[args.indexOf("--conversation") + 1]).toBe("conv-1234");
    expect(args[args.length - 1]).toBe("-p=");
  });

  it("normalizes base model and effort arguments", () => {
    const args = buildAgySpawnArgs({
      model: "antigravity:gemini-3.8-flash",
      effort: "medium",
    });
    const modelIdx = args.indexOf("--model");
    const effortIdx = args.indexOf("--effort");
    expect(args[modelIdx + 1]).toBe("gemini-3.8-flash");
    expect(args[effortIdx + 1]).toBe("medium");
  });

  it("strips legacy suffix when explicit effort is supplied", () => {
    const args = buildAgySpawnArgs({
      model: "antigravity:gemini-3.8-flash-high",
      effort: "low",
    });
    const modelIdx = args.indexOf("--model");
    const effortIdx = args.indexOf("--effort");
    expect(args[modelIdx + 1]).toBe("gemini-3.8-flash");
    expect(args[effortIdx + 1]).toBe("low");
  });
});

describe("buildAgyUserMessage", () => {
  it("formats user prompt text into an NDJSON message block", () => {
    const msg = buildAgyUserMessage({ text: "hello world" });
    expect(msg).toEqual({
      event: "user",
      message: {
        content: [{ type: "text", text: "hello world" }],
      },
    });
  });

  it("appends attachments to the message prompt", () => {
    const msg = buildAgyUserMessage({
      text: "check this file",
      attachments: [
        {
          id: "att-1",
          name: "data.txt",
          mimeType: "text/plain",
          kind: "file",
          size: 120,
          path: "/workspace/data.txt",
        },
      ],
    });
    const content = (msg.message as { content: Array<{ text: string }> }).content;
    expect(content[0].text).toContain("check this file");
    expect(content[0].text).toContain("/workspace/data.txt");
  });
});

describe("parseJsonLine", () => {
  it("parses valid json lines", () => {
    expect(parseJsonLine('{"event":"init"}')).toEqual({ event: "init" });
  });

  it("returns null for non-json or empty lines", () => {
    expect(parseJsonLine("")).toBeNull();
    expect(parseJsonLine("some plain log output")).toBeNull();
    expect(parseJsonLine("{bad json")).toBeNull();
  });
});

describe("toolKindFromName and toolTitle", () => {
  it("identifies tool kind correctly", () => {
    expect(toolKindFromName("run_command")).toBe("execute");
    expect(toolKindFromName("view_file")).toBe("read");
    expect(toolKindFromName("replace_file_content")).toBe("edit");
    expect(toolKindFromName("grep_search")).toBe("search");
    expect(toolKindFromName("invoke_subagent")).toBe("agent");
  });

  it("prefers toolSummary if available", () => {
    expect(
      toolTitle("run_command", {
        toolSummary: "Check git status",
        CommandLine: "git status",
      }),
    ).toBe("Check git status");
  });

  it("falls back to friendly parameter description", () => {
    expect(toolTitle("run_command", { CommandLine: "npm test" })).toBe("Run: npm test");
    expect(toolTitle("view_file", { AbsolutePath: "/repo/src/App.tsx" })).toBe("Read App.tsx");
    expect(toolTitle("replace_file_content", { TargetFile: "/repo/src/App.tsx" })).toBe("Edit App.tsx");
  });
});

describe("previewFromTool", () => {
  it("creates preview for shell commands", () => {
    const preview = previewFromTool("run_command", {
      CommandLine: "cat package.json",
    });
    expect(preview?.kind).toBe("shell");
    expect(preview?.fileName).toBe("package.json");
  });

  it("creates preview for file reading", () => {
    const preview = previewFromTool("view_file", {
      AbsolutePath: "/repo/package.json",
    });
    expect(preview?.kind).toBe("read");
    expect(preview?.path).toBe("/repo/package.json");
  });
});

describe("parseModelsOutput", () => {
  it("groups models with effort suffixes and generates an effort setting", () => {
    const raw = `
gemini-3.8-flash-high\tGemini 3.8 Flash (High)
gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)
gemini-3.8-flash-low\tGemini 3.8 Flash (Low)
claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)
gpt-oss-120b-medium\tGPT-OSS 120B (Medium)
`;
    const models = parseModelsOutput(raw);
    expect(models).toHaveLength(3);

    const flash = models.find((m) => m.nativeId === "gemini-3.8-flash");
    expect(flash).toBeDefined();
    expect(flash?.name).toBe("Gemini 3.8 Flash");
    expect(flash?.settings).toBeDefined();
    const effortSetting = flash?.settings?.find((s) => s.id === "effort");
    expect(effortSetting).toBeDefined();
    expect(effortSetting?.value).toBe("high");
    expect(effortSetting?.options.map((o) => o.value)).toEqual([
      "low",
      "medium",
      "high",
    ]);

    const claude = models.find((m) => m.nativeId === "claude-sonnet-4-6");
    expect(claude).toBeDefined();
    expect(claude?.settings).toBeUndefined();

    const gpt = models.find((m) => m.nativeId === "gpt-oss-120b-medium");
    expect(gpt).toBeDefined();
    expect(gpt?.name).toBe("GPT-OSS 120B (Medium)");
    expect(gpt?.settings).toBeUndefined();
  });
});

