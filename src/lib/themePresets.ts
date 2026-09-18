export type ThemePresetId =
  | "default"
  | "catppuccin-mocha"
  | "catppuccin-latte"
  | "dracula"
  | "tokyo-night"
  | "nord"
  | "gruvbox-dark"
  | "one-dark"
  | "github-dark"
  | "github-light"
  | "solarized-dark"
  | "solarized-light"
  | "custom";

export type HighlightPalette = {
  keyword: string;
  heading: string;
  callable: string;
  string: string;
  type: string;
  number: string;
  comment: string;
  property: string;
  meta: string;
  invalid: string;
};

export type TerminalAnsiPalette = {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  scheme: "dark" | "light";
  description: string;
  hue: number;
  saturation: number;
  backgroundLightness: number;
  contentLightness: number;
  accentColor: string;
  linkColor: string;
  markdownHeadingColor: string;
  editorPalette: HighlightPalette;
  terminalPalette: TerminalAnsiPalette;
};

export const THEME_PRESET_KEY = "monocode.themePreset";
export const THEME_PRESET_CHANGE_EVENT = "monocode:theme-preset-change";

export const DEFAULT_THEME_ID: ThemePresetId = "default";

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "default",
    name: "MonoCode Slate",
    scheme: "dark",
    description: "Neutral, focused dark theme with slate tones and vibrant syntax.",
    hue: 240,
    saturation: 0,
    backgroundLightness: 9,
    contentLightness: 92,
    accentColor: "hsl(211 92% 62%)",
    linkColor: "#7dd3fc",
    markdownHeadingColor: "#f9a8c9",
    editorPalette: {
      keyword: "#ff8ffd",
      heading: "var(--color-markdown-heading)",
      callable: "#a5d5fe",
      string: "#b4fa72",
      type: "#ff8272",
      number: "#b4fa72",
      comment: "#fefdc2",
      property: "#d0d1fe",
      meta: "#8e8e8e",
      invalid: "#ffc4bd",
    },
    terminalPalette: {
      black: "#1e2428",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e8eef2",
      brightBlack: "#64748b",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#f8fafc",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    scheme: "dark",
    description: "Soothing dark pastel theme with warm lavender, mauve, and peach accents.",
    hue: 240,
    saturation: 21,
    backgroundLightness: 15,
    contentLightness: 88,
    accentColor: "#cba6f7",
    linkColor: "#89dceb",
    markdownHeadingColor: "#f5c2e7",
    editorPalette: {
      keyword: "#cba6f7",
      heading: "#f5c2e7",
      callable: "#89b4fa",
      string: "#a6e3a1",
      type: "#f9e2af",
      number: "#fab387",
      comment: "#6c7086",
      property: "#b4befe",
      meta: "#9399b2",
      invalid: "#f38ba8",
    },
    terminalPalette: {
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    scheme: "dark",
    description: "Dark purple-slate theme with high-contrast neon accents.",
    hue: 231,
    saturation: 15,
    backgroundLightness: 18,
    contentLightness: 96,
    accentColor: "#bd93f9",
    linkColor: "#8be9fd",
    markdownHeadingColor: "#ff79c6",
    editorPalette: {
      keyword: "#ff79c6",
      heading: "#ff79c6",
      callable: "#50fa7b",
      string: "#f1fa8c",
      type: "#8be9fd",
      number: "#bd93f9",
      comment: "#6272a4",
      property: "#66d9ef",
      meta: "#ffb86c",
      invalid: "#ff5555",
    },
    terminalPalette: {
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    scheme: "dark",
    description: "Deep nighttime Tokyo atmosphere with vivid electric violet and cyan hues.",
    hue: 235,
    saturation: 19,
    backgroundLightness: 13,
    contentLightness: 75,
    accentColor: "#bb9af7",
    linkColor: "#7dcfff",
    markdownHeadingColor: "#bb9af7",
    editorPalette: {
      keyword: "#bb9af7",
      heading: "#bb9af7",
      callable: "#7aa2f7",
      string: "#9ece6a",
      type: "#2ac3de",
      number: "#ff9e64",
      comment: "#565f89",
      property: "#7dcfff",
      meta: "#787c99",
      invalid: "#f7768e",
    },
    terminalPalette: {
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
  },
  {
    id: "nord",
    name: "Nord",
    scheme: "dark",
    description: "Cold, arctic bluish clean palette inspired by polar ice.",
    hue: 220,
    saturation: 16,
    backgroundLightness: 22,
    contentLightness: 88,
    accentColor: "#88c0d0",
    linkColor: "#81a1c1",
    markdownHeadingColor: "#b48ead",
    editorPalette: {
      keyword: "#81a1c1",
      heading: "#b48ead",
      callable: "#88c0d0",
      string: "#a3be8c",
      type: "#8fbcbb",
      number: "#b48ead",
      comment: "#616e88",
      property: "#d8dee9",
      meta: "#5e81ac",
      invalid: "#bf616a",
    },
    terminalPalette: {
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    scheme: "dark",
    description: "Retro groove theme with warm, earthy amber, terracotta, and olive tones.",
    hue: 30,
    saturation: 4,
    backgroundLightness: 16,
    contentLightness: 81,
    accentColor: "#fe8019",
    linkColor: "#83a598",
    markdownHeadingColor: "#d3869b",
    editorPalette: {
      keyword: "#fb4934",
      heading: "#d3869b",
      callable: "#b8bb26",
      string: "#b8bb26",
      type: "#fabd2f",
      number: "#d3869b",
      comment: "#928374",
      property: "#83a598",
      meta: "#fe8019",
      invalid: "#cc241d",
    },
    terminalPalette: {
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
  },
  {
    id: "one-dark",
    name: "One Dark Pro",
    scheme: "dark",
    description: "Classic Atom/VS Code dark theme with balanced pastel tones.",
    hue: 220,
    saturation: 13,
    backgroundLightness: 18,
    contentLightness: 71,
    accentColor: "#56b6c2",
    linkColor: "#56b6c2",
    markdownHeadingColor: "#e06c75",
    editorPalette: {
      keyword: "#c678dd",
      heading: "#e06c75",
      callable: "#61afef",
      string: "#98c379",
      type: "#e5c07b",
      number: "#d19a66",
      comment: "#5c6370",
      property: "#e06c75",
      meta: "#7f848e",
      invalid: "#e06c75",
    },
    terminalPalette: {
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    scheme: "dark",
    description: "Official sleek GitHub night palette with signature blue accents.",
    hue: 216,
    saturation: 28,
    backgroundLightness: 7,
    contentLightness: 93,
    accentColor: "#2f81f7",
    linkColor: "#58a6ff",
    markdownHeadingColor: "#f0883e",
    editorPalette: {
      keyword: "#ff7b72",
      heading: "#1f6feb",
      callable: "#d2a8ff",
      string: "#a5d6ff",
      type: "#ffa657",
      number: "#79c0ff",
      comment: "#8b949e",
      property: "#7ee787",
      meta: "#ff7b72",
      invalid: "#f85149",
    },
    terminalPalette: {
      black: "#484f58",
      red: "#ff7b72",
      green: "#3fb950",
      yellow: "#d29922",
      blue: "#58a6ff",
      magenta: "#bc8cff",
      cyan: "#39c5cf",
      white: "#b1bac4",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd",
      brightWhite: "#f0f6fc",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    scheme: "dark",
    description: "Ethan Schoonover's scientifically tuned cyan and yellow dark palette.",
    hue: 192,
    saturation: 100,
    backgroundLightness: 11,
    contentLightness: 55,
    accentColor: "#2aa198",
    linkColor: "#2aa198",
    markdownHeadingColor: "#d33682",
    editorPalette: {
      keyword: "#859900",
      heading: "#d33682",
      callable: "#268bd2",
      string: "#2aa198",
      type: "#b58900",
      number: "#d33682",
      comment: "#586e75",
      property: "#268bd2",
      meta: "#cb4b16",
      invalid: "#dc322f",
    },
    terminalPalette: {
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    scheme: "light",
    description: "Warm, gentle pastel light theme with soft violet and sapphire contrast.",
    hue: 220,
    saturation: 23,
    backgroundLightness: 95,
    contentLightness: 35,
    accentColor: "#ea76cb",
    linkColor: "#04a5e5",
    markdownHeadingColor: "#ea76cb",
    editorPalette: {
      keyword: "#8839ef",
      heading: "#ea76cb",
      callable: "#1e66f5",
      string: "#40a02b",
      type: "#df8e1d",
      number: "#fe640b",
      comment: "#9ca0b0",
      property: "#7287fd",
      meta: "#7c7f93",
      invalid: "#d20f39",
    },
    terminalPalette: {
      black: "#5c5f77",
      red: "#d20f39",
      green: "#40a02b",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      magenta: "#ea76cb",
      cyan: "#179299",
      white: "#acb0be",
      brightBlack: "#6c6f85",
      brightRed: "#d20f39",
      brightGreen: "#40a02b",
      brightYellow: "#df8e1d",
      brightBlue: "#1e66f5",
      brightMagenta: "#ea76cb",
      brightCyan: "#179299",
      brightWhite: "#bcc0cc",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    scheme: "light",
    description: "Clean, crisp white and slate theme matching GitHub's web interface.",
    hue: 212,
    saturation: 12,
    backgroundLightness: 98,
    contentLightness: 18,
    accentColor: "#0969da",
    linkColor: "#0969da",
    markdownHeadingColor: "#953800",
    editorPalette: {
      keyword: "#cf222e",
      heading: "var(--color-markdown-heading)",
      callable: "#8250df",
      string: "#0a3069",
      type: "#953800",
      number: "#0550ae",
      comment: "#6e7781",
      property: "#116329",
      meta: "#57606a",
      invalid: "#82071e",
    },
    terminalPalette: {
      black: "#24292f",
      red: "#cf222e",
      green: "#116329",
      yellow: "#4d2d00",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#6e7781",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#1a7f37",
      brightYellow: "#633c01",
      brightBlue: "#218bff",
      brightMagenta: "#a475f9",
      brightCyan: "#3192aa",
      brightWhite: "#8c959f",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    scheme: "light",
    description: "Warm cream background with Ethan Schoonover's signature syntax balance.",
    hue: 44,
    saturation: 87,
    backgroundLightness: 94,
    contentLightness: 45,
    accentColor: "#b58900",
    linkColor: "#2aa198",
    markdownHeadingColor: "#d33682",
    editorPalette: {
      keyword: "#859900",
      heading: "#d33682",
      callable: "#268bd2",
      string: "#2aa198",
      type: "#b58900",
      number: "#d33682",
      comment: "#93a1a1",
      property: "#268bd2",
      meta: "#cb4b16",
      invalid: "#dc322f",
    },
    terminalPalette: {
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#83a598",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
];

export function getThemePreset(id: string): ThemePreset {
  const found = THEME_PRESETS.find((p) => p.id === id);
  return found ?? THEME_PRESETS[0];
}

export function loadThemePresetId(): string {
  try {
    return localStorage.getItem(THEME_PRESET_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemePresetId(id: string): void {
  try {
    localStorage.setItem(THEME_PRESET_KEY, id);
  } catch {}
}

export function applyThemePreset(presetId: string): ThemePreset {
  const preset = getThemePreset(presetId);
  saveThemePresetId(preset.id);
  applyThemePresetToDom(preset);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ThemePreset>(THEME_PRESET_CHANGE_EVENT, { detail: preset }),
    );
  }
  return preset;
}

export function applyThemePresetToDom(preset: ThemePreset): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--theme-hue", String(preset.hue));
  root.style.setProperty("--theme-saturation", `${preset.saturation}%`);
  root.style.setProperty("--background-lightness", `${preset.backgroundLightness}%`);
  root.style.setProperty("--content-lightness", `${preset.contentLightness}%`);
  root.style.setProperty("--accent-color", preset.accentColor);
  root.style.setProperty("--color-accent", preset.accentColor);
  root.style.setProperty("--link-color", preset.linkColor);
  root.style.setProperty("--color-markdown-heading", preset.markdownHeadingColor);
}
