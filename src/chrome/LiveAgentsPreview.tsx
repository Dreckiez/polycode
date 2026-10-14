import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert } from "./icons";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { formatLiveElapsed, type LiveAgent } from "../lib/liveAgents";
import { projectKey, projectName } from "../lib/paths";
import {
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupMascot,
} from "../lib/tabGroups";
import { HarnessIcon } from "./HarnessIcon";
import { ProjectMascot } from "./ProjectMascot";
import { TerminalSpinner } from "./TerminalSpinner";

const LIVE_AGENT_MIN = 2;
const LIVE_AGENT_CAP = 4;

/** Small working-agent card used by the sidebar; independent of the old project rail. */
export function LiveAgentsPreview({
  agents,
  activeSessionId,
  onSelect,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agents: LiveAgent[];
  activeSessionId?: string;
  onSelect?: (sessionId: string) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lockList = useLockOverscroll<HTMLDivElement>();
  const ticking =
    agents.length >= LIVE_AGENT_MIN &&
    agents.some((agent) => !agent.done && agent.startedAt != null);

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (agents.length < LIVE_AGENT_MIN) return null;

  const extra = agents.length - LIVE_AGENT_CAP;
  const visible = expanded || extra <= 0 ? agents : agents.slice(0, LIVE_AGENT_CAP);

  return (
    <div className="shrink-0 px-2">
      <div role="status" aria-label="Working agents" className="overflow-hidden rounded-lg bg-content/5">
        <div className="flex items-center gap-2 px-3.5 py-1.5">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)] animate-pulse" />
          <span className="min-w-0 flex-1 truncate text-xs text-content/50">Working</span>
          <span className="text-[11px] tabular-nums text-content/40">{agents.length}</span>
        </div>
        <div ref={expanded ? lockList : undefined} className={`flex flex-col gap-px px-1 ${extra > 0 ? "" : "pb-1"} ${expanded ? "max-h-[45vh] overflow-y-auto overscroll-none" : ""}`}>
          {visible.map((agent) => (
            <LiveAgentCard
              key={agent.id}
              agent={agent}
              now={now}
              selected={agent.id === activeSessionId}
              onSelect={onSelect}
              groupLabels={groupLabels}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupMascots={groupMascots}
            />
          ))}
        </div>
        {extra > 0 ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)} className="flex w-full cursor-pointer items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-content/50 hover:bg-content/8 hover:text-content">
            {expanded ? <ChevronUp className="size-3" strokeWidth={1.75} /> : <ChevronDown className="size-3" strokeWidth={1.75} />}
            {expanded ? "Show less" : `${extra} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LiveAgentCard({
  agent,
  now,
  selected,
  onSelect,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agent: LiveAgent;
  now: number;
  selected: boolean;
  onSelect?: (sessionId: string) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  const seed = projectName(agent.cwd);
  const key = projectKey(agent.cwd);
  const project = resolveTabGroupLabel(key, groupLabels, seed);
  const color = resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const elapsed = agent.done
    ? agent.durationMs != null ? formatLiveElapsed(0, agent.durationMs) : ""
    : agent.startedAt != null ? formatLiveElapsed(agent.startedAt, now) : "";
  const activity = agent.needsApproval ? "Need approval" : agent.done ? "Done" : agent.activity;
  const live = !agent.needsApproval && !agent.done;

  return (
    <button
      type="button"
      title={[agent.title, project, activity, elapsed].filter(Boolean).join("\n")}
      aria-label={[agent.title, project, activity, elapsed].filter(Boolean).join(", ")}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect?.(agent.id)}
      className={`relative flex w-full flex-col rounded-md px-2 py-1.5 text-left ${selected ? "bg-content/10 cursor-default" : "hover:bg-content/8 cursor-pointer"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ProjectMascot project={key} color={color} name={resolveTabGroupMascot(key, groupMascots)} className="size-2 shrink-0" active={live} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug">{agent.title}</span>
      </span>
      <span className={`mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-[11px] leading-tight ${agent.needsApproval ? "text-amber-400" : agent.done ? "text-emerald-400" : "text-content/50"}`}>
        {agent.needsApproval ? <CircleAlert className="size-3 shrink-0" strokeWidth={1.75} /> : agent.done ? <Check className="size-3 shrink-0" strokeWidth={2.25} /> : <TerminalSpinner className="inline-block w-3 select-none text-center text-[11px] leading-none" />}
        <span className="min-w-0 truncate">{activity}</span>
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5 pl-4 text-[11px] leading-tight text-content/45">
        <HarnessIcon harness={agent.harness} className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{project}</span>
        {elapsed ? <span className="shrink-0 tabular-nums">{elapsed}</span> : null}
      </span>
    </button>
  );
}
