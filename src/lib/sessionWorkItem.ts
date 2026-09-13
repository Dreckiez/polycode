import { invoke } from "@tauri-apps/api/core";
import { gitPrStatus } from "./fs";
import type { LinkedWorkItem } from "./session";
import type { GeneratedWorkItemHint } from "./sessionTitle";

export type GithubTaskKind = "issue" | "pr";

export async function githubRepo(cwd: string): Promise<string> {
  return invoke<string>("git_github_repo", { cwd });
}

const GITHUB_URL_RE =
  /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(pull|issues)\/(\d+)\b/i;

function validNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function githubUrl(repo: string, kind: GithubTaskKind, number: number): string {
  return `https://github.com/${repo}/${kind === "pr" ? "pull" : "issues"}/${number}`;
}

export function parseGithubWorkItemUrl(message: string): LinkedWorkItem | null {
  const match = GITHUB_URL_RE.exec(message);
  if (!match) return null;
  const number = Number(match[4]);
  if (!validNumber(number)) return null;
  const repo = `${match[1]}/${match[2]}`;
  const kind = match[3].toLowerCase() === "pull" ? "pr" : "issue";
  return { kind, repo, number, url: githubUrl(repo, kind, number) };
}

function explicitHint(message: string): GeneratedWorkItemHint | null {
  const patterns: Array<[GithubTaskKind, RegExp]> = [
    ["pr", /\b(?:pr|pull\s+request)\s*#?\s*(\d+)\b/i],
    ["issue", /\bissue\s*#?\s*(\d+)\b/i],
  ];
  for (const [kind, pattern] of patterns) {
    const match = pattern.exec(message);
    const number = Number(match?.[1]);
    if (match && validNumber(number)) return { kind, number };
  }
  return null;
}

function validRepo(repo: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

function repoFromGithubUrl(url: string): string | null {
  const match = GITHUB_URL_RE.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

function referencesCurrentPr(message: string): boolean {
  return /\b(?:this|the|current)\s+(?:pr|pull\s+request)\b/i.test(message);
}

/** Resolve explicit first-message context to one stable GitHub identity. */
export async function resolveLinkedWorkItem(
  message: string,
  cwd: string,
  generatedHint: GeneratedWorkItemHint | null,
): Promise<LinkedWorkItem | null> {
  const fromUrl = parseGithubWorkItemUrl(message);
  if (fromUrl) return fromUrl;

  const hint = explicitHint(message) ?? generatedHint;
  if (hint && validNumber(hint.number)) {
    try {
      const repo = await githubRepo(cwd);
      if (!validRepo(repo)) return null;
      return {
        ...hint,
        repo,
        url: githubUrl(repo, hint.kind, hint.number),
      };
    } catch {
      return null;
    }
  }

  if (!referencesCurrentPr(message)) return null;
  try {
    const pr = await gitPrStatus(cwd);
    if (!pr || !validNumber(pr.number)) return null;
    const repo = repoFromGithubUrl(pr.url) ?? (await githubRepo(cwd));
    if (!validRepo(repo)) return null;
    return {
      kind: "pr",
      repo,
      number: pr.number,
      url: pr.url || githubUrl(repo, "pr", pr.number),
    };
  } catch {
    return null;
  }
}
