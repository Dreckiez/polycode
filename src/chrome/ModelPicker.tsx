import { Check, ChevronDown, Gauge, Search, Star, X } from "./icons";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  coerceModelPickerTab,
  findModel,
  getModelEffortBadge,
  getModelSnapshot,
  getPickerVisibilitySnapshot,
  loadFavoriteModels,
  loadRecentModelChoices,
  modelsFor,
  resolveModel,
  saveFavoriteModels,
  showProviderInModelPicker,
  subscribeModels,
  subscribePickerVisibility,
  type AgentModel,
  type ModelPickerTab,
  type ModelSetting,
} from "../lib/models";
import {
  harnessUnavailableHint,
  hasProbedHarnessAvailability,
  isHarnessAvailable,
  probeHarnessAvailability,
  subscribeHarnessAvailability,
  getHarnessAvailabilitySnapshot,
} from "../lib/harness/availability";
import { refreshHarnessCatalogs } from "../lib/harness/registry";
import { HARNESSES, HARNESS_TITLE, type HarnessId } from "../lib/session";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { LAYER } from "../lib/layers";
import { HarnessIcon } from "./HarnessIcon";
import { Popover } from "./Popover";
import { MOD } from "../lib/platform";

type Props = {
  harness: HarnessId;
  model: string;
  values: Record<string, string>;
  hideEffort?: boolean;
  hotkeys?: boolean;
  onChange: (harness: HarnessId, model: string) => void;
  onSettingsChange: (settings: Record<string, string>) => void;
  onClose?: () => void;
};

type RecentMenu = { models: AgentModel[] };

const POPUP_WIDTH = 390;
const POPUP_HEIGHT = 380;
const SETTING_MENU_WIDTH = 210;
const SELF = "[data-model-picker]";

function shortEffortLabel(label: string): string {
  if (/^medium$/i.test(label)) return "Med";
  if (/^extra[- ]?high$/i.test(label)) return "XHigh";
  return label;
}

const EFFORT_SETTING_IDS = new Set(["effort", "reasoning", "reasoningEffort"]);

function isEffortSetting(setting: ModelSetting): boolean {
  return EFFORT_SETTING_IDS.has(setting.id);
}

function effortSetting(model: AgentModel): ModelSetting | undefined {
  return model.settings?.find(
    (setting) => setting.kind === "select" && isEffortSetting(setting),
  );
}

function settingValue(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  const raw = values[setting.id];
  if (raw && setting.options.some((option) => option.value === raw)) {
    return raw;
  }
  return setting.value;
}

function settingValueLabel(
  setting: ModelSetting,
  values: Record<string, string>,
): string {
  const value = settingValue(setting, values);
  return (
    setting.options.find((option) => option.value === value)?.label ?? value
  );
}

function recentMenuModels(current: AgentModel): AgentModel[] {
  const models = loadRecentModelChoices().flatMap((choice) => {
    const item = findModel(choice.model);
    return item?.harness === choice.harness ? [item] : [];
  });
  if (!models.some((item) => item.id === current.id)) models.push(current);
  return models.slice(0, 6);
}

export function ModelPicker({
  harness,
  model,
  values,
  hideEffort = false,
  hotkeys = false,
  onChange,
  onSettingsChange,
  onClose,
}: Props) {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const availabilityVersion = useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const visibilityVersion = useSyncExternalStore(
    subscribePickerVisibility,
    getPickerVisibilitySnapshot,
    getPickerVisibilitySnapshot,
  );
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ModelPickerTab>(harness);
  const [activeModel, setActiveModel] = useState(0);
  const [recentMenu, setRecentMenu] = useState<RecentMenu | null>(null);
  const [recentActive, setRecentActive] = useState(0);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(loadFavoriteModels);
  const recentMenuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const recentOpenRef = useRef(recentMenu != null);
  const currentRef = useRef<AgentModel | null>(null);
  const lastHotkey = useRef(0);
  onCloseRef.current = onClose;
  openRef.current = open;
  recentOpenRef.current = recentMenu != null;

  const current = resolveModel(harness, model);
  currentRef.current = current;
  const currentEffort = effortSetting(current);

  const triggerEffortSetting = hideEffort ? undefined : effortSetting(current);
  const triggerEffortLabel = triggerEffortSetting
    ? settingValueLabel(triggerEffortSetting, values)
    : undefined;
  const triggerTitle = [
    HARNESS_TITLE[current.harness],
    current.name,
    triggerEffortLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const pickerHarnesses = useMemo(() => {
    void availabilityVersion;
    void visibilityVersion;
    return HARNESSES.filter((id) =>
      showProviderInModelPicker(
        id,
        isHarnessAvailable(id),
        hasProbedHarnessAvailability(),
      ),
    );
  }, [availabilityVersion, visibilityVersion]);
  const providerKey = pickerHarnesses.join(",");
  const visibleTab = coerceModelPickerTab(tab, (id) =>
    pickerHarnesses.includes(id),
  );

  const visibleModels = useMemo(() => {
    void catalogVersion;
    const needle = query.trim().toLowerCase();
    const pool =
      visibleTab === "favorites"
        ? favorites
            .map((id) => findModel(id))
            .filter(
              (item): item is AgentModel =>
                item != null && pickerHarnesses.includes(item.harness),
            )
        : modelsFor(visibleTab);
    if (!needle) return pool;
    return pool.filter((item) =>
      `${item.name} ${HARNESS_TITLE[item.harness]}`
        .toLowerCase()
        .includes(needle),
    );
  }, [catalogVersion, favorites, providerKey, query, visibleTab]);

  const dismiss = (restore: boolean) => {
    setOpen(false);
    setRecentMenu(null);
    if (restore) onCloseRef.current?.();
  };

  const togglePicker = () => {
    if (openRef.current) dismiss(true);
    else {
      setRecentMenu(null);
      setOpen(true);
    }
  };

  const openRecentMenu = () => {
    const selected = currentRef.current;
    if (!selected) return;
    const models = recentMenuModels(selected);
    const selectedIndex = models.findIndex((item) => item.id === selected.id);
    setOpen(false);
    setRecentActive(selectedIndex >= 0 ? selectedIndex : 0);
    setRecentMenu({ models });
  };

  const toggleRecentMenu = () => {
    if (recentOpenRef.current) {
      setRecentMenu(null);
      onCloseRef.current?.();
    } else {
      openRecentMenu();
    }
  };

  const toggleFromHotkey = () => {
    const now = performance.now();
    if (now - lastHotkey.current < 80) return;
    lastHotkey.current = now;
    toggleRecentMenu();
  };

  useEffect(() => {
    if (!open) return;
    void probeHarnessAvailability();
    void refreshHarnessCatalogs([current.harness]);
    setTab(
      coerceModelPickerTab(current.harness, (id) =>
        pickerHarnesses.includes(id),
      ),
    );
    setQuery("");
    setFavorites(loadFavoriteModels());
  }, [open, current.harness]);

  useEffect(() => {
    if (visibleTab === tab) return;
    setTab(visibleTab);
  }, [tab, visibleTab]);

  useEffect(() => {
    if (!open || visibleTab === "favorites") return;
    void refreshHarnessCatalogs([visibleTab]);
  }, [open, visibleTab]);

  useEffect(() => {
    if (!open) return;
    const index = visibleModels.findIndex((item) => item.id === current.id);
    setActiveModel(index >= 0 ? index : 0);
  }, [open, visibleTab, query, current.id]);

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeModel]);

  useEffect(() => {
    const inBlockingUi = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest(".monocode-terminal")) return true;
      return Boolean(
        target.closest(
          "[data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-access-picker], [data-effort-picker]",
        ),
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (
        hotkeys &&
        mod &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "." || event.code === "Period")
      ) {
        if (!openRef.current && inBlockingUi(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        toggleFromHotkey();
        return;
      }
      if (!openRef.current || event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    };

    const onMenu = () => {
      if (!hotkeys) return;
      if (inBlockingUi(document.activeElement)) return;
      toggleFromHotkey();
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("open_model_picker", onMenu);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("open_model_picker", onMenu);
    };
  }, [hotkeys]);

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveModel((index) => Math.min(visibleModels.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveModel((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visibleModels[activeModel];
      if (item) pickModel(item);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.stopPropagation();
    }
  };

  const pickModel = (item: AgentModel) => {
    if (!isHarnessAvailable(item.harness)) return;
    const effort = effortSetting(item);
    if (effort) {
      const currentVal = values[effort.id];
      if (currentVal && !effort.options.some((opt) => opt.value === currentVal)) {
        onSettingsChange({ ...values, [effort.id]: effort.value });
      }
    }
    onChange(item.harness, item.id);
    dismiss(true);
  };

  const onEffortBadgeClick = (event: React.MouseEvent, item: AgentModel) => {
    event.stopPropagation();
    const setting = effortSetting(item);
    if (!setting || setting.options.length === 0) return;
    if (item.id !== current.id) {
      onChange(item.harness, item.id);
    }
    const currentVal = settingValue(setting, values);
    const idx = setting.options.findIndex((opt) => opt.value === currentVal);
    const nextIndex = idx >= 0 ? (idx + 1) % setting.options.length : 0;
    const nextVal = setting.options[nextIndex]?.value;
    if (nextVal) {
      onSettingsChange({ ...values, [setting.id]: nextVal });
    }
  };

  useEffect(() => {
    if (!recentMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setRecentActive(
          (index) =>
            (index + direction + recentMenu.models.length) %
            recentMenu.models.length,
        );
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const item = recentMenu.models[recentActive];
      if (item) pickModel(item);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recentActive, recentMenu]);

  const toggleFavorite = (id: string) => {
    setFavorites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      saveFavoriteModels(next);
      return next;
    });
  };

  const selectTab = (next: ModelPickerTab) => {
    setTab(next);
    setQuery("");
    setActiveModel(0);
  };

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveModel((index) => Math.min(visibleModels.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveModel((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visibleModels[activeModel];
      if (item) pickModel(item);
      return;
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        title={`${triggerTitle} · Recent models: right-click or ${MOD}.`}
        aria-label={`${HARNESS_TITLE[current.harness]} ${current.name}${
          triggerEffortLabel ? `, effort ${triggerEffortLabel}` : ""
        }`}
        aria-keyshortcuts={`${MOD}.`}
        aria-expanded={open || recentMenu != null}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openRecentMenu();
        }}
        onClick={() => togglePicker()}
        className={`group flex h-7 max-w-56 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-all duration-150 ${
          open
            ? "bg-accent/15 text-accent ring-1 ring-accent/30 shadow-xs"
            : "bg-accent/10 text-accent hover:bg-accent/15 hover:shadow-xs"
        }`}
      >
        <HarnessIcon
          harness={current.harness}
          monochrome
          className="size-3.5 shrink-0 transition-transform group-hover:scale-105"
        />
        <span className="min-w-0 truncate">{current.name}</span>
        {triggerEffortLabel && !hideEffort ? (
          <span className="shrink-0 text-[11px] font-normal text-content/50">
            {triggerEffortLabel}
          </span>
        ) : null}
        <ChevronDown
          className={`size-3 shrink-0 text-accent/70 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <Popover
          anchor={button}
          side="top"
          width={POPUP_WIDTH}
          minHeight={POPUP_HEIGHT}
          maxHeight={POPUP_HEIGHT}
          layer={LAYER.submenu}
          autoFocus
          dismissOnEscape={false}
          ignore={SELF}
          onDismiss={() => dismiss(false)}
          role="dialog"
          aria-label="Models"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          data-model-picker
          style={{
            height: POPUP_HEIGHT,
            minHeight: POPUP_HEIGHT,
            maxHeight: POPUP_HEIGHT,
          }}
          className="flex min-h-0 overflow-hidden rounded-xl border border-content/10 bg-background-base font-sans shadow-2xl backdrop-blur-md"
        >
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
              onSelect={() => selectTab("favorites")}
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
                onSelect={() => selectTab(harnessId)}
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
                    setQuery("");
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
              {visibleModels.length === 0 ? (
                <div className="px-2 py-4 text-center text-[12px] text-content/50">
                  {visibleTab === "favorites" && !query.trim()
                    ? "No favorite models"
                    : visibleTab !== "favorites" &&
                        !isHarnessAvailable(visibleTab)
                      ? harnessUnavailableHint(visibleTab)
                      : "No matching models"}
                </div>
              ) : (
                visibleModels.map((item, index) => {
                  const selected = item.id === current.id;
                  const highlighted = index === activeModel;
                  const favorited = favorites.includes(item.id);
                  const disabled = !isHarnessAvailable(item.harness);
                  const effort = effortSetting(item);
                  const effortBadge = getModelEffortBadge(item, values);
                  const activeEffort = effort
                    ? settingValue(effort, values)
                    : undefined;

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
                      onMouseEnter={() => setActiveModel(index)}
                      onClick={() => !disabled && pickModel(item)}
                    >
                      {/* Left Selection Indicator Bar */}
                      <div
                        data-indicator={selected ? "active" : undefined}
                        className={`mr-1.5 h-4.5 w-1 shrink-0 rounded-full transition-all ${
                          selected ? "bg-accent opacity-100" : "opacity-0"
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
                        onClick={() => pickModel(item)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[13px] disabled:cursor-not-allowed"
                      >
                        <HarnessIcon
                          harness={item.harness}
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                        {selected ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                        ) : null}
                      </button>

                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {effort && effort.options.length > 0 ? (
                          <div className="group/effort relative flex items-center py-0.5">
                            {/* Compact badge shown when NOT hovering near the effort area */}
                            <div className="flex items-center group-hover/effort:hidden">
                              <button
                                type="button"
                                disabled={disabled}
                                title={`Reasoning effort: ${effortBadge} (hover to select)`}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) =>
                                  onEffortBadgeClick(event, item)
                                }
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-colors ${
                                  disabled
                                    ? "cursor-not-allowed"
                                    : "cursor-pointer"
                                } ${
                                  effortBadge === "HIGH" ||
                                  effortBadge === "XHIGH"
                                    ? "bg-accent/15 text-accent hover:bg-accent/25"
                                    : effortBadge === "MED"
                                      ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                                      : "bg-content/10 text-content/50 hover:bg-content/15"
                                }`}
                              >
                                {effortBadge}
                              </button>
                            </div>

                            {/* Segmented control tab shown when hovering near the effort badge */}
                            <div className="hidden items-center group-hover/effort:flex">
                              <div
                                role="group"
                                aria-label={`${item.name} effort options`}
                                className="flex items-center gap-0.5 rounded-lg border border-content/10 bg-content/5 p-0.5 shadow-xs"
                              >
                                {effort.options.map((opt) => {
                                  const isOptActive =
                                    activeEffort === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={disabled}
                                      title={`Set effort to ${opt.label}`}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (item.id !== current.id) {
                                          onChange(item.harness, item.id);
                                        }
                                        onSettingsChange({
                                          ...values,
                                          [effort.id]: opt.value,
                                        });
                                      }}
                                      className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                        isOptActive
                                          ? "border border-accent/40 bg-accent/20 text-accent font-semibold shadow-xs"
                                          : "text-content/50 hover:bg-content/8 hover:text-content"
                                      }`}
                                    >
                                      {shortEffortLabel(opt.label)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : effortBadge ? (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-content/10 text-content/50">
                            {effortBadge}
                          </span>
                        ) : null}

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
                            toggleFavorite(item.id);
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Popover>
      ) : null}

      {recentMenu ? (
        <Popover
          anchor={button}
          side="top"
          width={280}
          autoFocus
          onDismiss={() => setRecentMenu(null)}
          role="menu"
          aria-label="Recently used models"
          aria-activedescendant={`${recentMenuId}-${recentActive}`}
          tabIndex={-1}
          onContextMenu={(event) => event.preventDefault()}
          data-model-picker
          className="p-1 font-sans"
        >
          {recentMenu.models.map((item, index) => {
            const selected = item.id === current.id;
            const highlighted = index === recentActive;
            const disabled = !isHarnessAvailable(item.harness);
            return (
              <button
                key={item.id}
                id={`${recentMenuId}-${index}`}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={disabled}
                title={
                  disabled ? harnessUnavailableHint(item.harness) : undefined
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setRecentActive(index)}
                onClick={() => pickModel(item)}
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
      ) : null}
    </>
  );

  function onQueryChange(val: string) {
    setQuery(val);
    setActiveModel(0);
  }
}

export function EffortPicker({
  harness,
  model,
  values,
  onSettingsChange,
  onClose,
}: Pick<
  Props,
  "harness" | "model" | "values" | "onSettingsChange" | "onClose"
>) {
  const catalogVersion = useSyncExternalStore(
    subscribeModels,
    getModelSnapshot,
    getModelSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = resolveModel(harness, model);
  void catalogVersion;
  const setting = effortSetting(current);

  if (!setting) return null;

  const value = settingValue(setting, values);
  const valueLabel = settingValueLabel(setting, values);
  const dismiss = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) onClose?.();
  };
  const openPicker = () => {
    const selectedIndex = setting.options.findIndex(
      (option) => option.value === value,
    );
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const pick = (optionValue: string) => {
    onSettingsChange({ ...values, [setting.id]: optionValue });
    dismiss(true);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        title={`Effort: ${valueLabel}`}
        aria-label={`Effort: ${valueLabel}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? dismiss(true) : openPicker())}
        className={`flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[12px] font-normal transition-all duration-150 ${
          open
            ? "bg-content/15 text-content ring-1 ring-content/20"
            : "bg-content/5 text-content/75 hover:bg-content/10 hover:text-content"
        }`}
      >
        <Gauge className="size-3.5 shrink-0 text-content/50" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{valueLabel}</span>
        <ChevronDown
          className={`size-3 shrink-0 text-content/40 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <Popover
          anchor={button}
          side="top"
          width={SETTING_MENU_WIDTH}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="menu"
          aria-label="Effort"
          aria-activedescendant={`${menuId}-${active}`}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActive(
                (index) =>
                  (index + direction + setting.options.length) %
                  setting.options.length,
              );
              return;
            }
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            const option = setting.options[active];
            if (option) pick(option.value);
          }}
          data-effort-picker
          className="p-1 font-sans"
        >
          {setting.options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === active;
            return (
              <button
                key={option.value}
                id={`${menuId}-${index}`}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option.value)}
                className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] text-content ${
                  highlighted ? "bg-content/10" : "hover:bg-content/5"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
      ) : null}
    </>
  );
}

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
          ? "bg-content/12 text-content"
          : "text-content/45 hover:bg-content/8 hover:text-content"
      }`}
    >
      <span className="shrink-0">{children}</span>
    </button>
  );
}
