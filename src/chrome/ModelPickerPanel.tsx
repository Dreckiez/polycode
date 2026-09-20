import { Check, Search, Star, X } from "./icons";
import {
  memo,
  useEffect,
  useRef,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  type AgentModel,
  type ModelPickerTab,
} from "../lib/models";
import {
  harnessUnavailableHint,
  isHarnessAvailable,
} from "../lib/harness/availability";
import { HARNESS_TITLE, type HarnessId } from "../lib/session";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { HarnessIcon } from "./HarnessIcon";
import { Popover } from "./Popover";

type Props = {
  visibleTab: ModelPickerTab;
  pickerHarnesses: HarnessId[];
  models: AgentModel[];
  current: AgentModel;
  activeModel: number;
  favorites: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onQueryClear: () => void;
  onPick: (item: AgentModel) => void;
  onToggleFavorite: (id: string) => void;
  onSelect: (tab: ModelPickerTab) => void;
  onActiveChange: Dispatch<SetStateAction<number>>;
};

export const ModelPickerPanel = memo(function ModelPickerPanel({
  visibleTab,
  pickerHarnesses,
  models,
  current,
  activeModel,
  favorites,
  query,
  onQueryChange,
  onQueryClear,
  onPick,
  onToggleFavorite,
  onSelect,
  onActiveChange,
}: Props) {
  const search = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeModel]);

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onActiveChange((index) => Math.min(models.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onActiveChange((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = models[activeModel];
      if (item) onPick(item);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.stopPropagation();
    }
  };

  return (
    <>
      {/* Section 1: Provider Navigation Rail */}
      <nav
        role="tablist"
        aria-label="Providers"
        aria-orientation="vertical"
        className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-content/10 p-1.5"
      >
        <ProviderTabButton
          title="Favorites"
          selected={visibleTab === "favorites"}
          onSelect={() => onSelect("favorites")}
        >
          <Star
            className="size-4"
            strokeWidth={1.75}
            fill={visibleTab === "favorites" ? "currentColor" : "none"}
          />
        </ProviderTabButton>
        {pickerHarnesses.map((harnessId) => (
          <ProviderTabButton
            key={harnessId}
            title={HARNESS_TITLE[harnessId]}
            selected={visibleTab === harnessId}
            onSelect={() => onSelect(harnessId)}
          >
            <HarnessIcon harness={harnessId} className="size-4" />
          </ProviderTabButton>
        ))}
      </nav>

      {/* Section 2: Model Search & List */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <label className="flex shrink-0 items-center gap-2 border-b border-content/10 px-3 py-2.5 text-content/50">
          <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
          <input
            ref={search}
            type="text"
            value={query}
            placeholder="Search models"
            aria-label="Search models"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none placeholder:text-content/40"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onSearchKey}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                onQueryClear();
                search.current?.focus();
              }}
              className="cursor-pointer text-content/40 hover:text-content"
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          ) : null}
        </label>

        <div
          ref={lockOverscroll}
          role="listbox"
          aria-label="Models"
          className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1.5"
        >
          {models.length === 0 ? (
            <div className="px-2 py-4 text-center text-[12px] text-content/50">
              {visibleTab === "favorites" && !query.trim()
                ? "No favorite models"
                : visibleTab !== "favorites" &&
                    !isHarnessAvailable(visibleTab)
                  ? harnessUnavailableHint(visibleTab)
                  : "No matching models"}
            </div>
          ) : (
            models.map((item, index) => {
              const selected = item.id === current.id;
              const highlighted = index === activeModel;
              const favorited = favorites.includes(item.id);
              const disabled = !isHarnessAvailable(item.harness);

              return (
                <div
                  key={item.id}
                  className={`group relative flex h-9 items-center rounded-lg px-2 transition-all ${
                    disabled
                      ? "cursor-not-allowed border border-transparent text-content/30"
                      : selected
                        ? "cursor-pointer border border-accent/25 bg-accent/10 text-content shadow-xs"
                        : highlighted
                          ? "cursor-pointer border border-transparent bg-content/10 text-content"
                          : "cursor-pointer border border-transparent text-content hover:bg-content/5"
                  }`}
                  onMouseEnter={() => onActiveChange(index)}
                  onClick={() => !disabled && onPick(item)}
                >
                  {/* Left Selection Indicator Bar */}
                  <div
                    data-indicator={selected ? "active" : undefined}
                    className={`mr-1.5 h-4.5 w-1 shrink-0 rounded-full transition-all ${
                      selected ? "bg-accent/75 opacity-90" : "opacity-0"
                    }`}
                  />

                  <button
                    ref={highlighted ? activeOptionRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    title={
                      disabled
                        ? harnessUnavailableHint(item.harness)
                        : undefined
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(item)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[13px] text-content disabled:cursor-not-allowed"
                  >
                    <HarnessIcon
                      harness={item.harness}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate font-medium">
                      {item.name}
                    </span>
                  </button>

                  <button
                    type="button"
                    title={
                      favorited
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    aria-label={
                      favorited
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(item.id);
                    }}
                    className={`grid size-6 shrink-0 cursor-pointer place-items-center rounded-md transition-all ${
                      favorited
                        ? "text-amber-400 hover:text-amber-300"
                        : "text-content/35 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-content"
                    }`}
                  >
                    <Star
                      className="size-3.5"
                      strokeWidth={1.75}
                      fill={favorited ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
});

export const RecentModelsMenu = memo(function RecentModelsMenu({
  anchor,
  models,
  current,
  active,
  menuId,
  onDismiss,
  onActiveChange,
  onPick,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  models: AgentModel[];
  current: AgentModel;
  active: number;
  menuId: string;
  onDismiss: () => void;
  onActiveChange: Dispatch<SetStateAction<number>>;
  onPick: (item: AgentModel) => void;
}) {
  return (
    <Popover
      anchor={anchor}
      side="top"
      width={280}
      autoFocus
      onDismiss={onDismiss}
      role="menu"
      aria-label="Recently used models"
      aria-activedescendant={`${menuId}-${active}`}
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
      data-model-picker
      className="p-1 font-sans"
    >
      {models.map((item, index) => {
        const selected = item.id === current.id;
        const highlighted = index === active;
        const disabled = !isHarnessAvailable(item.harness);
        return (
          <button
            key={item.id}
            id={`${menuId}-${index}`}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            disabled={disabled}
            title={
              disabled ? harnessUnavailableHint(item.harness) : undefined
            }
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActiveChange(index)}
            onClick={() => onPick(item)}
            className={`flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left disabled:cursor-not-allowed ${
              disabled
                ? "text-content/30"
                : highlighted
                  ? "bg-content/10 text-content"
                  : "text-content hover:bg-content/5"
            }`}
          >
            <HarnessIcon
              harness={item.harness}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-4 font-medium">
                {item.name}
              </span>
              <span className="block truncate text-[11px] leading-4 text-content/45">
                {HARNESS_TITLE[item.harness]}
              </span>
            </span>
            {selected ? (
              <Check
                className="size-3.5 shrink-0 text-accent"
                strokeWidth={2}
              />
            ) : null}
          </button>
        );
      })}
    </Popover>
  );
});

function ProviderTabButton({
  title,
  selected,
  onSelect,
  children,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      title={title}
      aria-label={title}
      aria-selected={selected}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={selected ? undefined : onSelect}
      onClick={onSelect}
      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-md transition-colors ${
        selected
          ? "border border-accent/25 bg-accent/10 text-content shadow-xs"
          : "text-content/45 hover:bg-content/8 hover:text-content"
      }`}
    >
      <span className="shrink-0">{children}</span>
    </button>
  );
}