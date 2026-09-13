import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGithubWorkItemUrl,
  resolveLinkedWorkItem,
} from "./sessionWorkItem";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("session work items", () => {
  it("parses a GitHub pull request URL without repository lookup", () => {
    expect(
      parseGithubWorkItemUrl(
        "Please review https://github.com/openai/codex/pull/321?diff=split",
      ),
    ).toEqual({
      kind: "pr",
      repo: "openai/codex",
      number: 321,
      url: "https://github.com/openai/codex/pull/321",
    });
  });

  it("resolves an explicit PR number against the session repository", async () => {
    vi.mocked(invoke).mockResolvedValue("openai/codex");

    await expect(
      resolveLinkedWorkItem("Please fix PR #42", "/tmp/codex", null),
    ).resolves.toEqual({
      kind: "pr",
      repo: "openai/codex",
      number: 42,
      url: "https://github.com/openai/codex/pull/42",
    });
    expect(invoke).toHaveBeenCalledWith("git_github_repo", {
      cwd: "/tmp/codex",
    });
  });
});
