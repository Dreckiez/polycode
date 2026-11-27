import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  checkHarnessUpdatesOnLaunch,
  type HarnessUpdate,
} from "../lib/harnessUpdates";
import { LAYER } from "../lib/layers";
import { HARNESS_TITLE } from "../lib/session";
import { HarnessIcon } from "./HarnessIcon";
import { X } from "./icons";

export function HarnessUpdateNotice({
  topOffset,
  onHeightChange,
}: {
  topOffset: number;
  onHeightChange: (height: number) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [updates, setUpdates] = useState<HarnessUpdate[]>([]);

  useEffect(() => {
    let cancelled = false;
    void checkHarnessUpdatesOnLaunch().then((next) => {
      if (!cancelled) setUpdates(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = updates.length > 0;
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => onHeightChange(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      onHeightChange(0);
    };
  }, [visible, onHeightChange]);
  if (!visible) return null;

  return createPortal(
    <section
      ref={panelRef}
      aria-label="CLI updates"
      role="status"
      style={{ zIndex: LAYER.toast, top: topOffset }}
      className="fixed right-3 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border border-content/15 bg-background-base/95 text-content shadow-xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-content/10 px-3 py-2">
        <span className="min-w-0 flex-1 text-[12px] font-semibold">
          {updates.length === 1
            ? "CLI update available"
            : "CLI updates available"}
        </span>
        <button
          type="button"
          aria-label="Dismiss CLI updates"
          onClick={() => setUpdates([])}
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      </div>
      <ul className="divide-y divide-content/10">
        {updates.map(({ harness, installed, latest }) => (
          <li key={harness} className="flex items-center gap-2 px-3 py-2.5">
            <HarnessIcon harness={harness} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {HARNESS_TITLE[harness]}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-content/55">
              {installed} → {latest}
            </span>
          </li>
        ))}
      </ul>
    </section>,
    document.body,
  );
}
