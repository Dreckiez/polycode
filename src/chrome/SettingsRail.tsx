import {
  Archive,
  ArrowLeft,
  Bot,
  Keyboard,
  Palette,
  SlidersHorizontal,
  Sparkles,
  type IconComponent,
} from "./icons";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "../lib/settings";

const SECTION_ICONS: Record<SettingsSectionId, IconComponent> = {
  general: SlidersHorizontal,
  appearance: Palette,
  keybindings: Keyboard,
  providers: Bot,
  skills: Sparkles,
  archive: Archive,
};

const SECTION_SUBTITLES: Record<SettingsSectionId, string> = {
  general: "Behavior & updates",
  appearance: "Theme & styles",
  keybindings: "Keyboard shortcuts",
  providers: "Models & accounts",
  skills: "Tools & capabilities",
  archive: "Saved chats",
};

type Props = {
  section: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
  onClose: () => void;
};

/** Body of the project rail while settings are open. */
export function SettingsNav({ section, onSelect, onClose }: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  return (
    <>
      <div
        ref={lockOverscroll}
        aria-label="Settings"
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-none px-2.5 pt-2 pb-2"
      >
        {SETTINGS_SECTIONS.map((item) => (
          <NavRow
            key={item.id}
            label={item.label}
            subtitle={SECTION_SUBTITLES[item.id]}
            icon={SECTION_ICONS[item.id]}
            active={item.id === section}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-1 border-t border-content/10 p-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-content/60 transition-colors hover:bg-content/6 hover:text-content"
        >
          <div className="flex items-center gap-2.5">
            <ArrowLeft className="size-4.5 shrink-0 opacity-70" strokeWidth={1.75} />
            <span className="text-[13.5px] font-medium">Back</span>
          </div>
          <kbd className="rounded border border-content/15 bg-content/5 px-1.5 py-0.5 font-mono text-[10px] text-content/40 shadow-xs">
            Esc
          </kbd>
        </button>
      </div>
    </>
  );
}

function NavRow({
  label,
  subtitle,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string;
  subtitle?: string;
  icon: IconComponent;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        active
          ? "bg-content/10 text-content shadow-xs ring-1 ring-content/10"
          : "text-content/60 hover:bg-content/6 hover:text-content"
      }`}
    >
      <Icon
        className={`size-5 shrink-0 transition-opacity ${
          active ? "text-content opacity-90" : "opacity-60 group-hover:opacity-85"
        }`}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[14px] leading-snug ${
            active ? "font-semibold text-content" : "font-medium"
          }`}
        >
          {label}
        </div>
        {subtitle ? (
          <div className="truncate text-[11.5px] leading-normal text-content/40">
            {subtitle}
          </div>
        ) : null}
      </div>
    </button>
  );
}
