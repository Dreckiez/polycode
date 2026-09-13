import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  File,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  WandSparkles,
  X,
} from "../chrome/icons";
import { HarnessIcon } from "../chrome/HarnessIcon";
import { Popover } from "../chrome/Popover";
import {
  importSkill,
  listSkills,
  pickFolder,
  pickSkillFile,
  type DiscoveredSkill,
} from "../lib/fs";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { playCue } from "../lib/sounds";
import {
  invalidateSkills,
  loadDisabledSkillPaths,
  saveDisabledSkillPaths,
  SKILLS_CHANGE_EVENT,
} from "../lib/skills";

const KNOWN_SOURCES: { id: string; title: string; isHarness: boolean }[] = [
  { id: "antigravity", title: "Antigravity", isHarness: true },
  { id: "claude", title: "Claude", isHarness: true },
  { id: "codex", title: "Codex", isHarness: true },
  { id: "opencode", title: "OpenCode", isHarness: true },
  { id: "pi", title: "Pi", isHarness: true },
  { id: "omp", title: "OpenMP", isHarness: true },
  { id: "fx", title: "FX", isHarness: true },
  { id: "grok", title: "Grok", isHarness: true },
  { id: "cursor", title: "Cursor", isHarness: false },
  { id: "agents", title: "Agents", isHarness: false },
  { id: "monocode", title: "MonoCode", isHarness: false },
];

type SkillGroup = {
  id: string;
  title: string;
  isHarness: boolean;
  harnessId?: HarnessId;
  skills: DiscoveredSkill[];
};

/** Inspect and manage global agent skills grouped by agent/harness. */
export function SkillsPage({ cwd }: { cwd: string }): ReactNode {
  const [skills, setSkills] = useState<DiscoveredSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [disabledPaths, setDisabledPaths] = useState<string[]>(() =>
    loadDisabledSkillPaths(),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

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

  // Filter out project-specific skills: only show global skills
  const globalSkills = useMemo(
    () => (skills ?? []).filter((s) => s.scope !== "project"),
    [skills],
  );

  const needle = query.trim().toLowerCase();
  const filteredSkills = useMemo(
    () =>
      globalSkills.filter((skill) => {
        if (!needle) return true;
        return (
          skill.name.toLowerCase().includes(needle) ||
          skill.description.toLowerCase().includes(needle) ||
          skill.source.toLowerCase().includes(needle)
        );
      }),
    [globalSkills, needle],
  );

  // Group skills by agent / source section
  const sections = useMemo<SkillGroup[]>(() => {
    const sourceMap = new Map<string, DiscoveredSkill[]>();
    for (const skill of filteredSkills) {
      const list = sourceMap.get(skill.source) ?? [];
      list.push(skill);
      sourceMap.set(skill.source, list);
    }

    const groups: SkillGroup[] = [];
    const seenSources = new Set<string>();

    for (const known of KNOWN_SOURCES) {
      const groupSkills = sourceMap.get(known.id);
      if (groupSkills && groupSkills.length > 0) {
        seenSources.add(known.id);
        groups.push({
          id: known.id,
          title: known.title,
          isHarness: known.isHarness,
          harnessId: known.isHarness ? (known.id as HarnessId) : undefined,
          skills: groupSkills.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    // Append any dynamic sources not in KNOWN_SOURCES
    for (const [source, groupSkills] of sourceMap.entries()) {
      if (!seenSources.has(source) && groupSkills.length > 0) {
        const isHarness = HARNESSES.includes(source as HarnessId);
        const title = isHarness
          ? HARNESS_TITLE[source as HarnessId]
          : source.charAt(0).toUpperCase() + source.slice(1);
        groups.push({
          id: source,
          title,
          isHarness,
          harnessId: isHarness ? (source as HarnessId) : undefined,
          skills: groupSkills.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    return groups;
  }, [filteredSkills]);

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

  const handleSelectFolder = async (): Promise<void> => {
    setActionError(null);
    try {
      const selected = await pickFolder("Select skill folder");
      if (!selected) return;
      setBusy(true);
      await importSkill(selected);
      playCue("turnFinished");
      invalidateSkills();
      window.dispatchEvent(new Event(SKILLS_CHANGE_EVENT));
      setReload((v) => v + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSelectFile = async (): Promise<void> => {
    setActionError(null);
    try {
      const selected = await pickSkillFile("Select SKILL.md file");
      if (!selected) return;
      setBusy(true);
      await importSkill(selected);
      playCue("turnFinished");
      invalidateSkills();
      window.dispatchEvent(new Event(SKILLS_CHANGE_EVENT));
      setReload((v) => v + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Toolbar: Search, Rescan & Add Skill */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <label className="flex h-8 w-60 min-w-0 items-center gap-2 rounded-lg border border-content/10 bg-content/[0.03] px-2.5 text-content/50 focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/20 transition-all">
            <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills…"
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

        <div className="relative shrink-0">
          <button
            ref={addBtnRef}
            type="button"
            aria-label="Add skill"
            disabled={busy}
            onClick={() => setAddMenuOpen((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-content/10 bg-content/5 px-3 text-[12px] font-medium text-content hover:bg-content/10 transition-colors disabled:opacity-40"
            title="Add a skill by selecting a folder or SKILL.md file"
          >
            {busy ? (
              <RefreshCw className="size-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Plus className="size-3.5" strokeWidth={1.75} />
            )}
            <span>Add skill</span>
            <ChevronDown
              className={`size-3 text-content/50 transition-transform ${addMenuOpen ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
          </button>

          {addMenuOpen ? (
            <Popover
              anchor={addBtnRef.current}
              side="bottom"
              align="end"
              width={240}
              autoFocus
              onDismiss={() => setAddMenuOpen(false)}
              className="p-1"
            >
              <button
                type="button"
                onClick={() => {
                  setAddMenuOpen(false);
                  void handleSelectFolder();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-content/5 transition-colors"
              >
                <FolderOpen className="size-4 shrink-0 text-content/70" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-content">Skill folder…</div>
                  <div className="text-[11px] text-content/45">Directory with SKILL.md</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMenuOpen(false);
                  void handleSelectFile();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-content/5 transition-colors"
              >
                <File className="size-4 shrink-0 text-content/70" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-content">SKILL.md file…</div>
                  <div className="text-[11px] text-content/45">Standalone markdown file</div>
                </div>
              </button>
            </Popover>
          ) : null}
        </div>
      </div>

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
      ) : globalSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-content/10 bg-content/[0.015] px-6 py-12 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-content/5 text-content/35">
            <WandSparkles className="size-5" />
          </div>
          <p className="text-[13px] font-medium text-content/75">
            No global skills configured yet
          </p>
          <p className="max-w-md text-[12px] text-content/45">
            Click &quot;Add skill&quot; to import a skill folder or SKILL.md file into your global skills catalog.
          </p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-content/10 bg-content/[0.015] px-6 py-12 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-content/5 text-content/35">
            <Search className="size-5" />
          </div>
          <p className="text-[13px] font-medium text-content/75">
            No matching skills found
          </p>
          <p className="max-w-md text-[12px] text-content/45">
            No skills match your filter &quot;{query}&quot;. Try searching by name or agent source.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-1 rounded-md border border-content/10 px-2.5 py-1 text-[11.5px] text-content/60 hover:bg-content/10 hover:text-content transition-colors"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((group) => (
            <div key={group.id} className="space-y-2">
              {/* Section Header with Agent Icon, Title, and Count */}
              <div className="flex items-center gap-2 px-1">
                <div className="grid size-5 place-items-center text-content/70">
                  {group.isHarness ? (
                    <HarnessIcon
                      harness={group.harnessId as HarnessId}
                      className="size-4"
                    />
                  ) : (
                    <WandSparkles
                      className="size-3.5 text-accent/85"
                      strokeWidth={1.75}
                    />
                  )}
                </div>
                <h3 className="font-semibold text-[13px] text-content tracking-tight">
                  {group.title}
                </h3>
                <span className="rounded-full bg-content/5 px-2 py-0.5 text-[10.5px] font-medium text-content/50 tabular-nums">
                  {group.skills.length}
                </span>
              </div>

              {/* Skills list card */}
              <div className="divide-y divide-content/5 overflow-hidden rounded-xl border border-content/10 bg-content/[0.015] shadow-xs">
                {group.skills.map((skill) => {
                  const disabled = disabledPaths.includes(skill.path);

                  return (
                    <div
                      key={skill.path}
                      className={`group flex items-center justify-between gap-4 px-4 py-3 transition-colors ${
                        disabled
                          ? "opacity-50 hover:opacity-75"
                          : "hover:bg-content/[0.025]"
                      }`}
                      title={
                        skill.description
                          ? `${skill.name} — ${skill.description}`
                          : skill.name
                      }
                    >
                      {/* Left: Skill Name */}
                      <div className="flex min-w-0 flex-1 items-center">
                        <span
                          className="min-w-0 truncate font-semibold text-[13.5px] text-content tracking-tight"
                          title={skill.name}
                        >
                          {skill.name}
                        </span>
                      </div>

                      {/* Right: Reveal folder in Explorer + Toggle Switch */}
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onReveal(skill.path)}
                          aria-label={`Reveal ${skill.name} in file manager`}
                          title="Reveal folder in Explorer"
                          className="grid size-7 place-items-center rounded-md border border-content/5 bg-content/[0.02] text-content/40 hover:border-content/15 hover:bg-content/10 hover:text-content transition-all"
                        >
                          <FolderOpen className="size-3.5" strokeWidth={1.75} />
                        </button>
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
