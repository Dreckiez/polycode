import { useEffect, useMemo, useState, type ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Check,
  Copy,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  WandSparkles,
  X,
} from "../chrome/icons";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { CreateSkillForm } from "../chrome/SkillPicker";
import { copyText } from "../lib/clipboard";
import { listSkills, type DiscoveredSkill } from "../lib/fs";
import { prettyCwd } from "../lib/paths";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { playCue } from "../lib/sounds";
import {
  createBlankSkill,
  invalidateSkills,
  loadDisabledSkillPaths,
  saveDisabledSkillPaths,
  SKILLS_CHANGE_EVENT,
} from "../lib/skills";

/** Inspect and manage file skills with high visual clarity and ergonomic controls. */
export function SkillsPage({ cwd }: { cwd: string }): ReactNode {
  const [skills, setSkills] = useState<DiscoveredSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "user" | "project">("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [disabledPaths, setDisabledPaths] = useState<string[]>(() =>
    loadDisabledSkillPaths(),
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setError(null);
    listSkills(cwd)
      .then((next) => {
        if (cancelled) return;
        setSkills(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, reload]);

  useEffect(() => {
    const onChange = (): void => setDisabledPaths(loadDisabledSkillPaths());
    window.addEventListener(SKILLS_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SKILLS_CHANGE_EVENT, onChange);
  }, []);

  const totalCount = skills?.length ?? 0;
  const personalCount = useMemo(
    () => (skills ?? []).filter((s) => s.scope === "user").length,
    [skills],
  );
  const projectCount = useMemo(
    () => (skills ?? []).filter((s) => s.scope === "project").length,
    [skills],
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (skills ?? []).filter((skill) => {
        if (scopeFilter !== "all" && skill.scope !== scopeFilter) return false;
        if (!needle) return true;
        return (
          skill.name.toLowerCase().includes(needle) ||
          skill.description.toLowerCase().includes(needle) ||
          skill.source.toLowerCase().includes(needle) ||
          skill.path.toLowerCase().includes(needle)
        );
      }),
    [needle, scopeFilter, skills],
  );

  const onToggle = (path: string, currentlyDisabled: boolean): void => {
    playCue("switch");
    const next = currentlyDisabled
      ? disabledPaths.filter((item) => item !== path)
      : [...disabledPaths, path];
    try {
      saveDisabledSkillPaths(next);
      setActionError(null);
    } catch {
      setActionError("Could not save the skill preference. Try again.");
    }
  };

  const onReveal = (path: string): void => {
    setActionError(null);
    void revealItemInDir(path).catch((err: unknown) => {
      setActionError(
        `Could not open the folder: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  const onCopyPath = (path: string): void => {
    setActionError(null);
    void copyText(path)
      .then(() => {
        playCue("copy");
        setCopiedPath(path);
        setTimeout(() => {
          setCopiedPath((current) => (current === path ? null : current));
        }, 1500);
      })
      .catch(() => {
        setActionError("Could not copy the path to the clipboard.");
      });
  };

  const onCreate = (name: string, scope: "project" | "user"): void => {
    setBusy(true);
    setCreateError(null);
    void createBlankSkill({ cwd, name, scope })
      .then(() => {
        invalidateSkills();
        window.dispatchEvent(new Event(SKILLS_CHANGE_EVENT));
        setAdding(false);
        setReload((value) => value + 1);
      })
      .catch((err: unknown) => {
        setCreateError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      {/* Toolbar: Search, Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <label className="flex h-8 w-60 min-w-0 items-center gap-2 rounded-lg border border-content/10 bg-content/[0.03] px-2.5 text-content/50 focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
            <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills or commands…"
              aria-label="Filter skills"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-content outline-none placeholder:text-content/35"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="text-content/40 hover:text-content transition-colors"
              >
                <X className="size-3" strokeWidth={1.75} />
              </button>
            ) : null}
          </label>

          {/* Scope filter pills */}
          <div className="flex items-center gap-0.5 rounded-lg border border-content/10 bg-content/[0.03] p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => setScopeFilter("all")}
              className={`rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${
                scopeFilter === "all"
                  ? "bg-content/10 font-medium text-content shadow-2xs"
                  : "text-content/50 hover:text-content"
              }`}
            >
              All{" "}
              <span className="text-[10px] opacity-60 tabular-nums">
                ({totalCount})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("user")}
              className={`rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${
                scopeFilter === "user"
                  ? "bg-content/10 font-medium text-content shadow-2xs"
                  : "text-content/50 hover:text-content"
              }`}
            >
              Personal{" "}
              <span className="text-[10px] opacity-60 tabular-nums">
                ({personalCount})
              </span>
            </button>
            {projectCount > 0 ? (
              <button
                type="button"
                onClick={() => setScopeFilter("project")}
                className={`rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${
                  scopeFilter === "project"
                    ? "bg-content/10 font-medium text-content shadow-2xs"
                    : "text-content/50 hover:text-content"
                }`}
              >
                Project{" "}
                <span className="text-[10px] opacity-60 tabular-nums">
                  ({projectCount})
                </span>
              </button>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Refresh skills"
            title="Rescan skill folders"
            disabled={skills === null && !error}
            onClick={() => {
              invalidateSkills();
              window.dispatchEvent(new Event(SKILLS_CHANGE_EVENT));
              setReload((value) => value + 1);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-content/10 bg-content/[0.03] px-2.5 text-[12px] text-content/60 hover:bg-content/10 hover:text-content transition-colors"
          >
            <RefreshCw className="size-3.5" strokeWidth={1.75} />
            <span>Rescan</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={adding ? "Close skill form" : "Add skill"}
            disabled={busy}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${
              adding
                ? "border border-content/15 bg-content/5 text-content/80 hover:bg-content/10"
                : "border border-content/10 bg-content/5 text-content hover:bg-content/10"
            } disabled:opacity-40`}
            onClick={() => {
              setAdding((value) => !value);
              setCreateError(null);
            }}
            title="Create a starter SKILL.md you can edit"
          >
            {adding ? (
              <>
                <X className="size-3.5" strokeWidth={1.75} />
                <span>Cancel</span>
              </>
            ) : (
              <>
                <Plus className="size-3.5" strokeWidth={1.75} />
                <span>Add skill</span>
              </>
            )}
          </button>
        </div>
      </div>

      {adding ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-content/10 bg-content/[0.03] p-1 shadow-xs">
          <CreateSkillForm
            key={cwd}
            query={query}
            cwd={cwd}
            monospace={false}
            error={createError}
            busy={busy}
            onCancel={() => {
              setAdding(false);
              setCreateError(null);
            }}
            onCreate={onCreate}
          />
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-400/60 hover:text-red-400"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-[13px] text-red-400">
          {error}
        </div>
      ) : skills == null ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-content/10 bg-content/[0.02] text-content/40">
          <RefreshCw className="size-5 animate-spin opacity-50" />
          <p className="text-[12.5px]">Discovering available skills…</p>
        </div>
      ) : (
        <div className="divide-y divide-content/5 overflow-hidden rounded-xl border border-content/10 bg-content/[0.015] shadow-xs">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <div className="grid size-10 place-items-center rounded-full bg-content/5 text-content/35">
                <Search className="size-5" />
              </div>
              <p className="text-[13px] font-medium text-content/75">
                {skills.length === 0 ? "No skills configured yet" : "No matching skills found"}
              </p>
              <p className="max-w-md text-[12px] text-content/45">
                {skills.length === 0
                  ? "Click 'Add skill' to create your first SKILL.md, or place skills in your workspace or ~/.gemini/config/skills."
                  : `No skills match your filter "${query}". Try searching by skill name, description, or source.`}
              </p>
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-1 rounded-md border border-content/10 px-2.5 py-1 text-[11.5px] text-content/60 hover:bg-content/10 hover:text-content transition-colors"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            filtered.map((skill) => {
              const disabled = disabledPaths.includes(skill.path);
              const isHarness = HARNESSES.includes(skill.source as HarnessId);
              const sourceTitle = isHarness
                ? HARNESS_TITLE[skill.source as HarnessId]
                : skill.source === "agents"
                  ? "Agents"
                  : skill.source === "monocode"
                    ? "MonoCode"
                    : skill.source;
              const isCopied = copiedPath === skill.path;

              return (
                <div
                  key={skill.path}
                  className={`group p-4 transition-colors ${
                    disabled
                      ? "opacity-50 hover:opacity-75"
                      : "hover:bg-content/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Icon + Content */}
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-content/10 bg-content/[0.04] text-content/75 shadow-2xs">
                        {isHarness ? (
                          <HarnessIcon
                            harness={skill.source as HarnessId}
                            className="size-4"
                          />
                        ) : (
                          <WandSparkles
                            className="size-4 text-accent/85"
                            strokeWidth={1.75}
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Title Row & Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-semibold text-[13.5px] text-content tracking-tight"
                            title={skill.name}
                          >
                            {skill.name}
                          </span>
                          <code className="rounded bg-accent/10 border border-accent/20 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent select-all">
                            /{skill.name}
                          </code>
                          <span className="inline-flex items-center gap-1 rounded-full border border-content/10 bg-content/5 px-2 py-0.5 text-[10.5px] font-medium text-content/70">
                            {isHarness ? (
                              <HarnessIcon
                                harness={skill.source as HarnessId}
                                className="size-3"
                              />
                            ) : null}
                            {sourceTitle}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-content/10 bg-content/5 px-2 py-0.5 text-[10.5px] font-medium text-content/50">
                            {skill.scope === "user"
                              ? "Personal"
                              : skill.scope === "builtin"
                                ? "Built-in"
                                : "Project"}
                          </span>
                        </div>

                        {/* Description */}
                        {skill.description ? (
                          <p
                            className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-content/65"
                            title={skill.description}
                          >
                            {skill.description}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-[12px] italic text-content/35">
                            No description provided.
                          </p>
                        )}

                        {/* Footer: Path and Action Buttons */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-content/[0.04] pt-2.5 text-[11px]">
                          <div
                            className="flex min-w-0 max-w-lg items-center gap-1.5 font-mono text-content/40 hover:text-content/70 transition-colors"
                            title={skill.path}
                          >
                            <Folder className="size-3 shrink-0 opacity-55" />
                            <span className="truncate">
                              {prettyCwd(skill.path)}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onCopyPath(skill.path)}
                              title="Copy absolute path to clipboard"
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-all ${
                                isCopied
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                  : "border-content/5 bg-content/[0.02] text-content/50 hover:border-content/15 hover:bg-content/10 hover:text-content"
                              }`}
                            >
                              {isCopied ? (
                                <Check className="size-3" strokeWidth={2} />
                              ) : (
                                <Copy className="size-3" strokeWidth={1.75} />
                              )}
                              <span>{isCopied ? "Copied!" : "Copy path"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onReveal(skill.path)}
                              title="Reveal folder in File Explorer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-content/5 bg-content/[0.02] px-2 py-1 text-[11px] text-content/50 hover:border-content/15 hover:bg-content/10 hover:text-content transition-all"
                            >
                              <FolderOpen className="size-3" strokeWidth={1.75} />
                              <span>Reveal</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Toggle Switch */}
                    <div className="shrink-0 pt-1">
                      <button
                        type="button"
                        role="switch"
                        aria-label={`Include ${skill.name} in MonoCode catalog`}
                        aria-checked={!disabled}
                        onClick={() => onToggle(skill.path, disabled)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                          disabled
                            ? "bg-content/20 hover:bg-content/30"
                            : "bg-accent hover:brightness-105"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 size-4 rounded-full bg-white shadow-xs transition-[left] ${
                            disabled ? "left-0.5" : "left-4.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="pt-4 text-[12px] leading-relaxed text-content/40">
        Enabled skills appear in the chat composer autocomplete whenever you type <code className="font-mono text-content/60">/</code>.
        Skills are discovered from <span className="font-mono text-content/60">.agents/skills</span> for this project,
        <span className="font-mono text-content/60"> ~/.agents/skills</span>, and native agent directories
        like <span className="font-mono text-content/60">~/.gemini/config/skills</span> and <span className="font-mono text-content/60">.claude/skills</span>.
      </p>
    </>
  );
}
