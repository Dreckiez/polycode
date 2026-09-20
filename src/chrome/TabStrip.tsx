import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Terminal,
  X,
} from "./icons";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { HarnessId } from "../lib/session";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { useSortable } from "../hooks/useSortable";
import { FileTypeIcon } from "./FileTypeIcon";
import { HarnessIcon } from "./HarnessIcon";
import { TerminalSpinner } from "./TerminalSpinner";
import { MOD } from "../lib/platform";
import { ExplorerMenu, type ExplorerMenuItem } from "./ExplorerMenu";

export type Tab = {
  id: string;
  /** Project folder name, e.g. `agent-terminal`. */
  project: string;
  /** Focused conversation title; empty for a fresh session. */
  title: string;
  /** Other conversation titles in this tab, focused session omitted. */
  more: string[];
  sessionCount: number;
  harnesses: HarnessId[];
  /** Harnesses with an in-flight turn in this tab. */
  busyHarnesses: HarnessId[];
  /** Open file basenames, active files first. */
  files: string[];
  /** Split layout with more than one pane in this tab. */
  multiPane?: boolean;
  /** Focus is on a file/terminal pane rather than a conversation pane. */
  fileFocused?: boolean;
  /** The sole pane is a fresh conversation with no user turn or open file. */
  blank?: boolean;
  /** Explicit tab group; absent means ungrouped. */
  groupId?: string;
  dirty?: boolean;
  terminal?: boolean;
};

type Props = {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew?: () => void;
  onClose: (id: string) => void;
  onCloseMany: (ids: string[], fallbackId: string) => void;
  onReorder: (ids: string[], movedId?: string) => void;
};

function sessionMeta(tab: Tab): string {
  if (tab.more.length === 1) return tab.more[0];
  if (tab.sessionCount > 1) return `${tab.sessionCount} sessions`;
  return "";
}

export function tabCopy(tab: Tab): {
  headline: string;
  meta: string;
  tooltip: string;
} {
  const project = tab.project.trim() || "~";
  const conversation = tab.title.trim();
  const file = tab.files[0] ?? "";
  const sessions = sessionMeta(tab);
  const untitled = "New session";

  let headline: string;
  const metaParts: string[] = [];

  if (tab.multiPane) {
    if (tab.fileFocused && file) {
      headline = file;
      if (conversation) metaParts.push(conversation);
      else if (sessions) metaParts.push(sessions);
    } else if (conversation) {
      headline = conversation;
      if (file) metaParts.push(file);
      else if (sessions) metaParts.push(sessions);
    } else if (file) {
      headline = file;
      if (sessions) metaParts.push(sessions);
    } else {
      headline = untitled;
      if (sessions) metaParts.push(sessions);
    }
  } else {
    headline = conversation || file || untitled;
    if (sessions) metaParts.push(sessions);
  }

  const meta = metaParts.join(" · ");

  const tooltipParts = [project];
  if (conversation) tooltipParts.push(conversation);
  tooltipParts.push(...tab.more);
  if (tab.files.length > 0) tooltipParts.push(tab.files.join(", "));
  if (tab.dirty) tooltipParts.push("Unsaved changes");

  return { headline, meta, tooltip: tooltipParts.join(" · ") };
}

/** Which tab-strip edges still have overflow to scroll toward. */
export function tabStripOverflow(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): { left: boolean; right: boolean } {
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= 1) return { left: false, right: false };
  return {
    left: scrollLeft > 1,
    right: scrollLeft < maxScroll - 1,
  };
}

export function titleTabClosable(tab: Tab, tabCount: number): boolean {
  return tabCount > 1 || !tab.blank;
}

export type TitleTabContextAction = "others" | "right" | "left";

/** Tab ids affected by a context-menu action relative to its clicked tab. */
export function titleTabContextCloseIds(
  tabs: readonly Tab[],
  targetId: string,
  action: TitleTabContextAction,
): string[] {
  const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (targetIndex < 0) return [];
  if (action === "left") {
    return tabs.slice(0, targetIndex).map((tab) => tab.id);
  }
  if (action === "right") {
    return tabs.slice(targetIndex + 1).map((tab) => tab.id);
  }
  return tabs.filter((tab) => tab.id !== targetId).map((tab) => tab.id);
}

function TabHarnesses({
  harnesses,
  busyHarnesses,
  dimmed,
}: {
  harnesses: HarnessId[];
  busyHarnesses: HarnessId[];
  dimmed: boolean;
}) {
  const shown = harnesses.slice(0, 3);
  const extra = harnesses.length - shown.length;
  const opacity = dimmed ? "opacity-55" : "opacity-100";
  const busy = new Set(busyHarnesses);

  return (
    <span className="flex shrink-0 items-center">
      {shown.map((harness, i) => (
        <span
          key={harness}
          className={`grid size-3.5 shrink-0 place-items-center ${opacity} ${
            i > 0 ? "-ml-0.5" : ""
          }`}
        >
          {busy.has(harness) ? (
            <TerminalSpinner className="inline-block w-3.5 select-none text-center text-[11px] leading-none text-accent" />
          ) : (
            <HarnessIcon harness={harness} className="size-3.5 shrink-0" />
          )}
        </span>
      ))}
      {extra > 0 ? (
        <span
          className={`pl-0.5 text-[10px] leading-none ${dimmed ? "text-content/50" : "text-content"}`}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

type SortableApi = ReturnType<typeof useSortable>;

const TitleTabItem = memo(function TitleTabItem({
  tab,
  index,
  active,
  closable,
  canDrag,
  sortable,
  onSelect,
  onClose,
  onContextMenu,
  itemRef,
}: {
  tab: Tab;
  index: number;
  active: boolean;
  closable: boolean;
  canDrag: boolean;
  sortable: SortableApi;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu: (id: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  itemRef?: (el: HTMLDivElement | null) => void;
}) {
  const dragging = canDrag && sortable.draggingId === tab.id;
  const { headline, meta, tooltip } = tabCopy(tab);
  const fileIcon = tab.files[0];
  const showStart =
    canDrag &&
    sortable.draggingId &&
    sortable.toIndex === index &&
    sortable.fromIndex !== null &&
    sortable.toIndex < sortable.fromIndex;
  const showEnd =
    canDrag &&
    sortable.draggingId &&
    sortable.toIndex === index &&
    sortable.fromIndex !== null &&
    sortable.toIndex > sortable.fromIndex;

  return (
    <div
      ref={(el) => {
        sortable.setItemRef(tab.id, el);
        itemRef?.(el);
      }}
      className={`group @container relative flex h-full cursor-default touch-none items-center self-stretch min-w-0 w-full ${dragging ? "opacity-40" : ""}`}
      data-tauri-drag-region="false"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(tab.id, event);
      }}
      onMouseDownCapture={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1 || !closable) return;
        event.preventDefault();
        event.stopPropagation();
        onClose(tab.id);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
          return;
        }
        onSelect(tab.id);
        if (canDrag) sortable.onItemPointerDown(tab.id, event);
      }}
    >
      {showStart ? (
        <div className="pointer-events-none absolute inset-y-1.5 left-0 z-20 w-0.5 rounded-full bg-accent" />
      ) : null}
      {showEnd ? (
        <div className="pointer-events-none absolute inset-y-1.5 right-0 z-20 w-0.5 rounded-full bg-accent" />
      ) : null}
      <button
        type="button"
        title={tooltip}
        aria-label={tooltip}
        data-tauri-drag-region="false"
        onClick={() => {
          if (sortable.consumeClick()) return;
          onSelect(tab.id);
        }}
        className={`relative flex h-7.5 min-w-0 flex-1 cursor-default items-center gap-1.5 self-center rounded-md px-2.5 text-left ${
          closable ? "pr-7" : "pr-2.5"
        } ${
          active
            ? "bg-content/10 text-content"
            : "text-content/50 hover:bg-content/5 hover:text-content"
        }`}
      >
        {tab.harnesses.length > 0 ? (
          <TabHarnesses
            harnesses={tab.harnesses}
            busyHarnesses={tab.busyHarnesses}
            dimmed={!active}
          />
        ) : tab.terminal || !fileIcon ? (
          <Terminal
            className={`size-3.5 shrink-0 ${
              active ? "text-content" : "text-content/55"
            }`}
            strokeWidth={1.75}
          />
        ) : (
          <span className={!active ? "opacity-55" : undefined}>
            <FileTypeIcon name={fileIcon} isDir={false} size={14} />
          </span>
        )}
        {/* Keep two-line tabs compact while leaving room for descenders. */}
        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="flex min-w-0 items-center gap-1">
            <span
              className={`min-w-0 truncate leading-tight ${
                meta
                  ? "text-[13px] @min-[11rem]:text-[10px] @min-[11rem]:font-medium"
                  : "text-[13px]"
              }`}
            >
              {headline}
            </span>
            {tab.dirty ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-content/70"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            ) : null}
          </span>
          {meta ? (
            <span className="hidden min-w-0 truncate text-[10px] leading-tight text-content/45 @min-[11rem]:block">
              {meta}
            </span>
          ) : null}
        </span>
      </button>
      {closable ? (
        <button
          type="button"
          title="Close Tab"
          aria-label={`Close ${headline}`}
          data-no-drag
          data-tauri-drag-region="false"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-content/50 opacity-0 hover:bg-content/10 hover:text-content group-hover:opacity-100"
        >
          <X className="size-3" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
});

function TabStripChevron({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const label = side === "left" ? "Scroll tabs left" : "Scroll tabs right";
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-tauri-drag-region="false"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className={`absolute top-1/2 z-40 grid size-6.5 -translate-y-1/2 place-items-center rounded-md bg-content/10 backdrop-blur-xl text-content/70 hover:bg-content/15 hover:text-content ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
    </button>
  );
}

export const TabStrip = memo(function TabStrip({
  tabs,
  activeId,
  onSelect,
  onNew,
  onClose,
  onCloseMany,
  onReorder,
}: Props) {
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const sortable = useSortable(tabIds, onReorder);
  const onActiveTabRef = useCallback((el: HTMLDivElement | null) => {
    activeTabRef.current = el;
  }, []);
  const onContextMenuTab = useCallback(
    (tabId: string, event: ReactMouseEvent<HTMLDivElement>) => {
      setTabMenu({
        tabId,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const setTabStripRef = useCallback(
    (el: HTMLDivElement | null) => {
      tabStripRef.current = el;
      lockOverscroll(el);
    },
    [lockOverscroll],
  );
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const [tabMenu, setTabMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const syncTabOverflow = useCallback(() => {
    const el = tabStripRef.current;
    const next = el
      ? tabStripOverflow(el.scrollLeft, el.clientWidth, el.scrollWidth)
      : { left: false, right: false };
    setTabOverflow((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }, []);
  const scrollTabsBy = useCallback((direction: -1 | 1) => {
    const el = tabStripRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.6, 112);
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }, []);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const canDrag = tabs.length > 1;

  useEffect(() => {
    if (sortable.draggingId) return;
    activeTabRef.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [activeId, sortable.draggingId]);

  useLayoutEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    syncTabOverflow();
    el.addEventListener("scroll", syncTabOverflow, { passive: true });
    const ro = new ResizeObserver(syncTabOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncTabOverflow);
      ro.disconnect();
    };
  }, [syncTabOverflow]);

  useLayoutEffect(() => {
    syncTabOverflow();
  }, [activeId, syncTabOverflow, tabs]);

  const contextTab = tabMenu
    ? tabs.find((tab) => tab.id === tabMenu.tabId)
    : undefined;
  const contextCloseIds = contextTab
    ? {
        others: titleTabContextCloseIds(tabs, contextTab.id, "others"),
        right: titleTabContextCloseIds(tabs, contextTab.id, "right"),
        left: titleTabContextCloseIds(tabs, contextTab.id, "left"),
      }
    : null;
  const contextMenuItems: ExplorerMenuItem[] = contextTab
    ? [
        {
          kind: "item",
          id: "close",
          label: "Close Tab",
          shortcut: `${MOD}W`,
          disabled: !titleTabClosable(contextTab, tabs.length),
        },
        { kind: "sep" },
        {
          kind: "item",
          id: "others",
          label: "Close Other Tabs",
          disabled: contextCloseIds?.others.length === 0,
        },
        {
          kind: "item",
          id: "right",
          label: "Close Tabs to the Right",
          disabled: contextCloseIds?.right.length === 0,
        },
        {
          kind: "item",
          id: "left",
          label: "Close Tabs to the Left",
          disabled: contextCloseIds?.left.length === 0,
        },
      ]
    : [];

  const onPickTabMenu = (id: string) => {
    if (!contextTab || !contextCloseIds) return;
    setTabMenu(null);
    if (id === "close") {
      onClose(contextTab.id);
      return;
    }
    if (id === "others" || id === "right" || id === "left") {
      onCloseMany(contextCloseIds[id], contextTab.id);
    }
  };

  return (
    <>
      <div
        className="relative h-full min-w-0 flex-1 overflow-hidden"
        onWheel={(event) => {
          const el = tabStripRef.current;
          if (!el || el.scrollWidth <= el.clientWidth) return;
          if (event.deltaX === 0 && event.deltaY !== 0) {
            el.scrollLeft += event.deltaY;
          }
        }}
      >
        {tabOverflow.left ? (
          <TabStripChevron side="left" onClick={() => scrollTabsBy(-1)} />
        ) : null}
        {tabOverflow.right ? (
          <TabStripChevron side="right" onClick={() => scrollTabsBy(1)} />
        ) : null}
        <div
          ref={setTabStripRef}
          className="scrollbar-none flex h-full min-w-0 cursor-default items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-none px-1.5"
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              className="relative flex h-full w-56 min-w-28 shrink cursor-default items-center"
              data-tauri-drag-region="false"
            >
              <TitleTabItem
                tab={tab}
                index={index}
                active={tab.id === activeId}
                closable={titleTabClosable(tab, tabs.length)}
                canDrag={canDrag}
                sortable={sortable}
                onSelect={onSelect}
                onClose={onClose}
                onContextMenu={onContextMenuTab}
                itemRef={tab.id === activeId ? onActiveTabRef : undefined}
              />
            </div>
          ))}
          {onNew ? (
            <button
              type="button"
              onClick={onNew}
              aria-label={`New session (${MOD}T)`}
              title={`New session (${MOD}T)`}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-content/40 hover:bg-content/10 hover:text-content ml-0.5 transition-colors"
              data-tauri-drag-region="false"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>
      {tabMenu && contextTab ? (
        <ExplorerMenu
          x={tabMenu.x}
          y={tabMenu.y}
          width={244}
          items={contextMenuItems}
          ariaLabel={`Tab actions for ${tabCopy(contextTab).headline}`}
          onPick={onPickTabMenu}
          onClose={() => setTabMenu(null)}
        />
      ) : null}
    </>
  );
});
