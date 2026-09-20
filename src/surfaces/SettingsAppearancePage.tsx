import { ImagePlus, Loader, Palette } from "../chrome/icons";
import { useCallback, useEffect, useState } from "react";
import {
  applyChatBackground,
  applyChatBackgroundOpacity,
  applyChatBackgroundScope,
  applyBodyGlass,
  applySidebarBlur,
  applySidebarOpacity,
  applyThemePreference,
  applyThemePreset,
  applyThemeTint,
  BODY_GLASS_DEFAULT,
  CHAT_BACKGROUND_OPACITY_DEFAULT,
  CHAT_BACKGROUND_OPACITY_MAX,
  CHAT_BACKGROUND_OPACITY_MIN,
  CHAT_BACKGROUND_SCOPE_DEFAULT,
  DEFAULT_THEME_ID,
  THEME_PREFERENCE_DEFAULT,
  THEME_PRESETS,
  chatBackgroundSrc,
  isLightScheme,
  loadBodyGlass,
  loadChatBackgroundOpacity,
  loadChatBackgroundPath,
  loadChatBackgroundScope,
  loadChatBackgroundDither,
  saveChatBackgroundDither,
  subscribeChatBackgroundDither,
  loadAutoMatchTheme,
  saveAutoMatchTheme,
  subscribeAutoMatchTheme,
  loadThemePreference,
  loadSidebarBlur,
  loadSidebarOpacity,
  loadThemeHue,
  loadThemePresetId,
  loadThemeSaturation,
  saveBodyGlass,
  saveChatBackgroundOpacity,
  saveChatBackgroundPath,
  saveChatBackgroundScope,
  saveThemePreference,
  saveThemePresetId,
  saveSidebarBlur,
  saveSidebarOpacity,
  saveThemeHue,
  saveThemeSaturation,
  SIDEBAR_BLUR_DEFAULT,
  SIDEBAR_BLUR_MAX,
  SIDEBAR_BLUR_MIN,
  SIDEBAR_OPACITY_DEFAULT,
  SIDEBAR_OPACITY_MAX,
  SIDEBAR_OPACITY_MIN,
  THEME_HUE_DEFAULT,
  THEME_HUE_MAX,
  THEME_HUE_MIN,
  THEME_SATURATION_DEFAULT,
  THEME_SATURATION_MAX,
  THEME_SATURATION_MIN,
  type ThemePreference,
  type ChatBackgroundScope,
} from "../lib/appearance";
import {
  applyExtractedPaletteToApp,
  extractPaletteFromImage,
  loadExtractedImagePalette,
  type ExtractedPalette,
} from "../lib/paletteSync";
import { useProcessedBackground } from "../hooks/useProcessedBackground";
import {
  pickAndSaveChatBackground,
  removeChatBackground,
} from "../lib/chatBackground";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  subscribeUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "../lib/uiScale";
import { useColorScheme } from "../hooks/useColorScheme";
import {
  Row,
  SecondaryButton,
  Segmented,
  Select,
  Slider,
  Toggle,
} from "./SettingsControls";

type AppearanceSettings = ReturnType<typeof useAppearanceSettings>;

export function useAppearanceSettings() {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(loadThemePreference);
  const [opacity, setOpacity] = useState(loadSidebarOpacity);
  const [blur, setBlur] = useState(loadSidebarBlur);
  const [themeHue, setThemeHue] = useState(loadThemeHue);
  const [themeSaturation, setThemeSaturation] = useState(loadThemeSaturation);
  const [themePresetId, setThemePresetId] = useState(loadThemePresetId);
  const [bodyGlass, setBodyGlass] = useState(loadBodyGlass);
  const [chatBackgroundPath, setChatBackgroundPath] = useState(
    loadChatBackgroundPath,
  );
  const [chatBackgroundOpacity, setChatBackgroundOpacity] = useState(
    loadChatBackgroundOpacity,
  );
  const [chatBackgroundScope, setChatBackgroundScope] =
    useState<ChatBackgroundScope>(loadChatBackgroundScope);
  const [chatBackgroundDither, setChatBackgroundDither] = useState(
    loadChatBackgroundDither,
  );
  const [autoMatchTheme, setAutoMatchTheme] = useState(loadAutoMatchTheme);
  const [imagePalette, setImagePalette] = useState<ExtractedPalette | null>(
    loadExtractedImagePalette,
  );
  const [chatBackgroundBusy, setChatBackgroundBusy] = useState(false);
  const [chatBackgroundError, setChatBackgroundError] = useState<string | null>(
    null,
  );
  const [uiScale, setUiScale] = useState(loadUiScale);

  useEffect(() => subscribeUiScale(() => setUiScale(loadUiScale())), []);
  useEffect(
    () =>
      subscribeChatBackgroundDither(() =>
        setChatBackgroundDither(loadChatBackgroundDither()),
      ),
    [],
  );
  useEffect(
    () =>
      subscribeAutoMatchTheme(() =>
        setAutoMatchTheme(loadAutoMatchTheme()),
      ),
    [],
  );

  const onThemePreference = useCallback((next: ThemePreference) => {
    applyThemePreference(next);
    saveThemePreference(next);
    setThemePreference(next);
  }, []);

  const onThemePreset = useCallback((nextId: string) => {
    if (nextId === "custom") {
      saveThemePresetId("custom");
      setThemePresetId("custom");
      return;
    }
    const preset = applyThemePreset(nextId);
    setThemePresetId(preset.id);
    setThemeHue(preset.hue);
    setThemeSaturation(preset.saturation);
    if (preset.scheme === "light" && !isLightScheme()) {
      applyThemePreference("light");
      saveThemePreference("light");
      setThemePreference("light");
    } else if (preset.scheme === "dark" && isLightScheme()) {
      applyThemePreference("dark");
      saveThemePreference("dark");
      setThemePreference("dark");
    }
  }, []);

  const onOpacity = useCallback((percent: number) => {
    const next = applySidebarOpacity(percent / 100);
    saveSidebarOpacity(next);
    setOpacity(next);
  }, []);

  const onBlur = useCallback((radius: number) => {
    const next = applySidebarBlur(radius);
    saveSidebarBlur(next);
    setBlur(next);
  }, []);

  const onTint = useCallback((hue: number, saturation: number) => {
    const next = applyThemeTint(hue, saturation);
    saveThemeHue(next.hue);
    saveThemeSaturation(next.saturation);
    setThemeHue(next.hue);
    setThemeSaturation(next.saturation);
    saveThemePresetId("custom");
    setThemePresetId("custom");
  }, []);

  const onBodyGlass = useCallback((next: boolean) => {
    applyBodyGlass(next);
    saveBodyGlass(next);
    setBodyGlass(next);
  }, []);

  const onChooseChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      const path = await pickAndSaveChatBackground();
      if (!path) return;
      saveChatBackgroundPath(path);
      applyChatBackground(path);
      setChatBackgroundPath(path);
      const src = chatBackgroundSrc(path);
      if (src) {
        try {
          const palette = await extractPaletteFromImage(src);
          setImagePalette(palette);
          if (loadAutoMatchTheme()) {
            applyExtractedPaletteToApp(palette);
            setThemePresetId("custom");
            setThemeHue(palette.themeHue);
            setThemeSaturation(palette.themeSaturation);
          }
        } catch {}
      }
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onClearChatBackground = useCallback(async () => {
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      await removeChatBackground();
      saveChatBackgroundPath(null);
      applyChatBackground(null);
      setChatBackgroundPath(null);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, []);

  const onChatBackgroundOpacity = useCallback((percent: number) => {
    const next = applyChatBackgroundOpacity(percent / 100);
    saveChatBackgroundOpacity(next);
    setChatBackgroundOpacity(next);
  }, []);

  const onChatBackgroundScope = useCallback((next: ChatBackgroundScope) => {
    applyChatBackgroundScope(next);
    saveChatBackgroundScope(next);
    setChatBackgroundScope(next);
  }, []);

  const onChatBackgroundDither = useCallback((value: boolean) => {
    saveChatBackgroundDither(value);
    setChatBackgroundDither(value);
  }, []);

  const onAutoMatchTheme = useCallback((value: boolean) => {
    saveAutoMatchTheme(value);
    setAutoMatchTheme(value);
  }, []);

  const onMatchThemeToImage = useCallback(async () => {
    if (!chatBackgroundPath) return;
    setChatBackgroundBusy(true);
    setChatBackgroundError(null);
    try {
      const src = chatBackgroundSrc(chatBackgroundPath);
      if (!src) return;
      const palette = await extractPaletteFromImage(src);
      applyExtractedPaletteToApp(palette);
      setImagePalette(palette);
      setThemePresetId("custom");
      setThemeHue(palette.themeHue);
      setThemeSaturation(palette.themeSaturation);
    } catch (error) {
      setChatBackgroundError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setChatBackgroundBusy(false);
    }
  }, [chatBackgroundPath]);

  const onUiScale = useCallback((percent: number) => {
    const next = saveUiScale(percent / 100);
    setUiScale(next);
    void applyUiScale(next);
  }, []);

  const restoreDefaults = useCallback(() => {
    onThemePreset(DEFAULT_THEME_ID);
    onThemePreference(THEME_PREFERENCE_DEFAULT);
    onOpacity(Math.round(SIDEBAR_OPACITY_DEFAULT * 100));
    onBlur(SIDEBAR_BLUR_DEFAULT);
    onTint(THEME_HUE_DEFAULT, THEME_SATURATION_DEFAULT);
    onBodyGlass(BODY_GLASS_DEFAULT);
    onChatBackgroundOpacity(Math.round(CHAT_BACKGROUND_OPACITY_DEFAULT * 100));
    onChatBackgroundScope(CHAT_BACKGROUND_SCOPE_DEFAULT);
    onChatBackgroundDither(true);
    onAutoMatchTheme(true);
    if (chatBackgroundPath) void onClearChatBackground();
    onUiScale(Math.round(UI_SCALE_DEFAULT * 100));
  }, [
    chatBackgroundPath,
    onBlur,
    onBodyGlass,
    onChatBackgroundOpacity,
    onChatBackgroundScope,
    onChatBackgroundDither,
    onAutoMatchTheme,
    onClearChatBackground,
    onThemePreference,
    onThemePreset,
    onOpacity,
    onTint,
    onUiScale,
  ]);

  return {
    themePreference,
    themePresetId,
    opacity,
    blur,
    themeHue,
    themeSaturation,
    bodyGlass,
    chatBackgroundPath,
    chatBackgroundOpacity,
    chatBackgroundScope,
    chatBackgroundDither,
    autoMatchTheme,
    imagePalette,
    chatBackgroundBusy,
    chatBackgroundError,
    uiScale,
    onThemePreference,
    onThemePreset,
    onOpacity,
    onBlur,
    onTint,
    onBodyGlass,
    onChooseChatBackground,
    onClearChatBackground,
    onChatBackgroundOpacity,
    onChatBackgroundScope,
    onChatBackgroundDither,
    onAutoMatchTheme,
    onMatchThemeToImage,
    onUiScale,
    restoreDefaults,
  };
}

const THEME_PRESET_OPTIONS = [
  ...THEME_PRESETS.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.scheme === "dark" ? "Dark" : "Light"})`,
  })),
  { value: "custom", label: "Custom (Manual Tint)" },
];

export function AppearancePage({ appearance }: { appearance: AppearanceSettings }) {
  const percent = Math.round(appearance.opacity * 100);
  const glassDisabled = useColorScheme() === "light";

  return (
    <>
      <Row
        label="Theme preset"
        description="Curated color theme for the UI chrome, code editor syntax, and terminal."
      >
        <Select
          label="Theme preset"
          value={appearance.themePresetId}
          options={THEME_PRESET_OPTIONS}
          onChange={appearance.onThemePreset}
        />
      </Row>
      <Row
        label="Theme"
        description="System follows the OS appearance. Dark and light share the same tint, so the hue below applies to both."
      >
        <Segmented
          label="Theme"
          value={appearance.themePreference}
          options={[
            { value: "system", label: "System" },
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          onChange={appearance.onThemePreference}
        />
      </Row>
      <Row
        label="Sidebar opacity"
        description={
          glassDisabled
            ? "Light mode always uses an opaque window. Your dark-mode value is preserved."
            : "How much of the desktop shows through the sidebar and the project rail."
        }
      >
        <Slider
          label="Sidebar opacity"
          value={percent}
          display={`${percent}%`}
          min={Math.round(SIDEBAR_OPACITY_MIN * 100)}
          max={Math.round(SIDEBAR_OPACITY_MAX * 100)}
          onChange={appearance.onOpacity}
          disabled={glassDisabled}
        />
      </Row>
      <Row
        label="Blur radius"
        description={
          glassDisabled
            ? "Background blur is unavailable while light mode uses an opaque window."
            : "Background blur behind the window. Higher values cost more to composite."
        }
      >
        <Slider
          label="Blur radius"
          value={appearance.blur}
          display={String(appearance.blur)}
          min={SIDEBAR_BLUR_MIN}
          max={SIDEBAR_BLUR_MAX}
          onChange={appearance.onBlur}
          disabled={glassDisabled}
        />
      </Row>
      <Row label="Hue" description="Base hue for accents and tinted surfaces.">
        <Slider
          label="Hue"
          value={appearance.themeHue}
          display={`${appearance.themeHue}°`}
          min={THEME_HUE_MIN}
          max={THEME_HUE_MAX}
          onChange={(value) =>
            appearance.onTint(value, appearance.themeSaturation)
          }
        />
      </Row>
      <Row
        label="Saturation"
        description="How strongly the hue tints the interface. Zero keeps it neutral."
      >
        <Slider
          label="Saturation"
          value={appearance.themeSaturation}
          display={`${appearance.themeSaturation}%`}
          min={THEME_SATURATION_MIN}
          max={THEME_SATURATION_MAX}
          onChange={(value) => appearance.onTint(appearance.themeHue, value)}
        />
      </Row>
      <Row
        label="Main pane glass"
        description={
          glassDisabled
            ? "Main pane glass is unavailable while light mode uses an opaque window."
            : "Extend the translucent treatment to the main pane behind sessions and editors."
        }
      >
        <Toggle
          label="Main pane glass"
          on={appearance.bodyGlass}
          onChange={appearance.onBodyGlass}
          disabled={glassDisabled}
        />
      </Row>
      <ChatBackgroundCard appearance={appearance} />
      <Row
        label="Interface scale"
        description="Zoom the whole interface. You can also use Ctrl+=, Ctrl+-, and Ctrl+0 (Cmd on macOS)."
      >
        <Slider
          label="Interface scale"
          value={Math.round(appearance.uiScale * 100)}
          display={`${Math.round(appearance.uiScale * 100)}%`}
          min={Math.round(UI_SCALE_MIN * 100)}
          max={Math.round(UI_SCALE_MAX * 100)}
          step={5}
          onChange={appearance.onUiScale}
        />
      </Row>
    </>
  );
}

function ChatBackgroundCard({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const src = chatBackgroundSrc(appearance.chatBackgroundPath);
  const hasImage = Boolean(appearance.chatBackgroundPath && src);
  const processedPreviewSrc = useProcessedBackground(
    src,
    appearance.chatBackgroundDither,
  );
  const visibility = Math.round(appearance.chatBackgroundOpacity * 100);
  const busy = appearance.chatBackgroundBusy;

  return (
    <div className="border-b border-content/6 py-4.5 last:border-b-0">
      <div className="flex items-start gap-8">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-content">
            Chat background
          </div>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-content/50">
            An image behind your chat panes with retro dithering and theme matching.
          </p>
        </div>
        {hasImage ? (
          <div className="flex shrink-0 items-center gap-2">
            <SecondaryButton
              onClick={() => void appearance.onMatchThemeToImage()}
              disabled={busy}
              title="Extract colors from image and set as app theme"
            >
              <Palette className="size-3.5" />
              Match theme
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void appearance.onChooseChatBackground()}
              disabled={busy}
            >
              {busy ? (
                <Loader className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Change
            </SecondaryButton>
            <SecondaryButton
              onClick={() => void appearance.onClearChatBackground()}
              disabled={busy}
              danger
            >
              Remove
            </SecondaryButton>
          </div>
        ) : null}
      </div>

      <div className="mt-3.5 overflow-hidden rounded-xl border border-content/10 bg-background-base">
        {hasImage ? (
          <div className="relative h-44 overflow-hidden bg-black">
            <img
              src={processedPreviewSrc ?? src ?? undefined}
              alt=""
              draggable={false}
              className="size-full object-cover"
              style={{ opacity: appearance.chatBackgroundOpacity }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-2.5">
              <span className="text-[11px] font-medium text-white/70 drop-shadow-sm">
                Preview at {visibility}% {appearance.chatBackgroundDither ? "· Dithered" : ""}
              </span>
              {appearance.imagePalette?.swatches?.length ? (
                <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
                  {appearance.imagePalette.swatches.map((hex) => (
                    <span
                      key={hex}
                      className="size-3 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void appearance.onChooseChatBackground()}
            disabled={busy}
            className="flex h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 text-content/40 hover:bg-content/5 hover:text-content/70 disabled:cursor-default disabled:opacity-40"
          >
            {busy ? (
              <Loader className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-5" aria-hidden />
            )}
            <span className="text-[13px] font-medium">Choose an image</span>
          </button>
        )}
        {hasImage ? (
          <div className="border-t border-content/8">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content">Show on</div>
                <p className="text-[12px] text-content/45">
                  Empty sessions only, or every conversation.
                </p>
              </div>
              <Segmented
                label="Show background on"
                value={appearance.chatBackgroundScope}
                options={[
                  { value: "empty", label: "Empty only" },
                  { value: "all", label: "All sessions" },
                ]}
                onChange={appearance.onChatBackgroundScope}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-content/5 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content">Visibility</div>
                <p className="text-[12px] text-content/45">
                  Keep it subtle so long conversations stay readable.
                </p>
              </div>
              <Slider
                label="Background visibility"
                value={visibility}
                display={`${visibility}%`}
                min={Math.round(CHAT_BACKGROUND_OPACITY_MIN * 100)}
                max={Math.round(CHAT_BACKGROUND_OPACITY_MAX * 100)}
                onChange={appearance.onChatBackgroundOpacity}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-content/5 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content">
                  Dither background
                </div>
                <p className="text-[12px] text-content/45">
                  Retro halftone dithering with smooth vertical transition to black.
                </p>
              </div>
              <Toggle
                label="Dither background"
                on={appearance.chatBackgroundDither}
                onChange={appearance.onChatBackgroundDither}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-content/5 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content">
                  Auto-sync theme to image
                </div>
                <p className="text-[12px] text-content/45">
                  Automatically match app colors and accent when image changes.
                </p>
              </div>
              <Toggle
                label="Auto-sync theme to image"
                on={appearance.autoMatchTheme}
                onChange={appearance.onAutoMatchTheme}
              />
            </div>
          </div>
        ) : null}
      </div>
      {appearance.chatBackgroundError ? (
        <p className="mt-2 text-[12px] text-red-400">
          {appearance.chatBackgroundError}
        </p>
      ) : null}
    </div>
  );
}