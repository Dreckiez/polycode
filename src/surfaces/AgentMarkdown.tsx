import { code } from "@streamdown/code";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  createContext,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { harden } from "rehype-harden";
import {
  CodeBlock,
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
  useIsCodeFenceIncomplete,
  type Components,
} from "streamdown";
import type { PluggableList } from "unified";
import { ExplorerMenu, type ExplorerMenuItem } from "../chrome/ExplorerMenu";
import { FileTypeIcon } from "../chrome/FileTypeIcon";
import { createLazyMermaidPlugin } from "./mermaidPlugin";
import {
  displayPath,
  isExtensionlessFileName,
  resolveWorkspaceFileReference,
} from "../lib/paths";
import type { EditorNavigation, OpenFileFn } from "../lib/search";
import { remarkWorkspaceFileLinks } from "../lib/markdownFileLinks";
import { isAtxHeadingLine } from "../lib/markdownSource";
import { useColorScheme } from "../hooks/useColorScheme";
import { useLockOverscroll } from "../hooks/useLockOverscroll";
import { copyText } from "../lib/clipboard";
import { revealPath } from "../lib/fs";
import { isNoteImagePath } from "../lib/noteImages";
import { IS_MAC, IS_WIN } from "../lib/platform";

const MERMAID_BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
} as const;

const mermaid = createLazyMermaidPlugin({
  config: {
    ...MERMAID_BASE_CONFIG,
    theme: "dark",
  },
});

const MARKDOWN_PLUGINS = { code, mermaid };

const MARKDOWN_REHYPE_PLUGINS: PluggableList = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  [
    harden,
    {
      // MarkdownImage remains the final allowlist. The wildcard lets app-owned
      // relative note URLs reach that component without changing link parsing.
      allowedImagePrefixes: ["*"],
      allowedLinkPrefixes: ["*"],
      allowDataImages: true,
      imageBlockPolicy: "remove" as const,
    },
  ],
];

type FileLinkMenu = {
  x: number;
  y: number;
  path: string;
  navigation?: EditorNavigation;
};

const FileOpenContext = createContext<{
  cwd?: string;
  onOpenFile?: OpenFileFn;
  onFileContextMenu?: (
    event: ReactMouseEvent,
    path: string,
    navigation?: EditorNavigation,
  ) => void;
}>({});

const REVEAL_LABEL = IS_MAC
  ? "Reveal in Finder"
  : IS_WIN
    ? "Reveal in File Explorer"
    : "Open Containing Folder";

function fileLinkMenuItems(
  canOpenInPolyCode: boolean,
  canCopyRelativePath: boolean,
): ExplorerMenuItem[] {
  return [
    {
      kind: "item",
      id: "open-polycode",
      label: "Open in PolyCode",
      disabled: !canOpenInPolyCode,
    },
    { kind: "item", id: "open-default", label: "Open in Default App" },
    { kind: "item", id: "reveal", label: REVEAL_LABEL },
    { kind: "sep" },
    { kind: "item", id: "copy-path", label: "Copy Path" },
    ...(canCopyRelativePath
      ? [
          {
            kind: "item" as const,
            id: "copy-relative-path",
            label: "Copy Relative Path",
          },
        ]
      : []),
  ];
}

const LANGUAGE_FROM_EXT: Record<string, string> = {
  sh: "bash",
  zsh: "bash",
  py: "python",
  rb: "ruby",
  rs: "rust",
  ts: "typescript",
  js: "javascript",
  md: "markdown",
  yml: "yaml",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
};

const LANGUAGE_FILE_NAMES: Record<string, string> = {
  bash: "code.sh",
  c: "code.c",
  cpp: "code.cpp",
  "c++": "code.cpp",
  csharp: "code.cs",
  css: "code.css",
  go: "code.go",
  html: "code.html",
  java: "code.java",
  javascript: "code.js",
  js: "code.js",
  jsx: "code.jsx",
  json: "code.json",
  markdown: "code.md",
  md: "code.md",
  php: "code.php",
  python: "code.py",
  py: "code.py",
  ruby: "code.rb",
  rust: "code.rs",
  rs: "code.rs",
  shell: "code.sh",
  sh: "code.sh",
  sql: "code.sql",
  swift: "code.swift",
  toml: "code.toml",
  ts: "code.ts",
  tsx: "code.tsx",
  typescript: "code.ts",
  xml: "code.xml",
  yaml: "code.yaml",
  yml: "code.yaml",
  zsh: "code.sh",
};

type MarkdownLinkProps = ComponentProps<"a"> & { node?: unknown };

function MarkdownLink({
  href,
  children,
  className,
  node: _node,
  onClick,
  onContextMenu,
  dir,
  ...props
}: MarkdownLinkProps) {
  const { cwd, onOpenFile, onFileContextMenu } = useContext(FileOpenContext);
  const file = href ? resolveWorkspaceFileReference(href, cwd) : undefined;

  return (
    <a
      href={href}
      className={`text-sky-400/90 hover:text-sky-300 hover:underline ${className ?? ""}`}
      {...props}
      dir={dir ?? "auto"}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (file && onOpenFile) {
          event.preventDefault();
          onOpenFile(file.path, file.navigation);
          return;
        }
        event.preventDefault();
        if (href && /^https?:\/\//i.test(href)) {
          void openUrl(href).catch((error) => {
            console.error("Failed to open web link:", error);
          });
        }
      }}
      onContextMenu={(event) => {
        onContextMenu?.(event);
        if (event.defaultPrevented || !file || !onFileContextMenu) return;
        onFileContextMenu(event, file.path, file.navigation);
      }}
    >
      {children}
    </a>
  );
}

type MarkdownCodeProps = ComponentProps<"code"> & { node?: unknown };

function MarkdownCode({
  children,
  className,
  node,
  onContextMenu,
  ...props
}: MarkdownCodeProps) {
  const incomplete = useIsCodeFenceIncomplete();
  const block = Object.prototype.hasOwnProperty.call(props, "data-block");
  if (!block) {
    const text = textContent(children);
    const fileName = inlineFileName(text);
    const { cwd, onOpenFile, onFileContextMenu } = useContext(FileOpenContext);
    const file = fileName
      ? resolveWorkspaceFileReference(text, cwd)
      : undefined;
    const open =
      file && onOpenFile
        ? () => onOpenFile(file.path, file.navigation)
        : undefined;
    return (
      <code
        {...props}
        dir="ltr"
        className={`inline-flex items-center gap-1 rounded-md bg-content/8 px-1.5 min-h-6 max-w-full [overflow-wrap:anywhere] align-baseline font-mono text-[0.8em] text-content ${
          open ? "cursor-pointer hover:text-sky-300 hover:underline" : ""
        } ${className ?? ""}`}
        role={open ? "link" : undefined}
        tabIndex={open ? 0 : undefined}
        onClick={open}
        onContextMenu={(event) => {
          onContextMenu?.(event);
          if (event.defaultPrevented || !file || !onFileContextMenu) return;
          onFileContextMenu(event, file.path, file.navigation);
        }}
        onKeyDown={
          open
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open();
                }
              }
            : undefined
        }
      >
        {fileName ? (
          <span aria-hidden="true">
            <FileTypeIcon name={fileName} isDir={false} size={14} />
          </span>
        ) : null}
        {children}
      </code>
    );
  }

  const meta = codeMeta(node);
  const fence = parseCodeFence(className, meta);
  if (fence.language.toLowerCase() === "mermaid") {
    return (
      <MermaidBlock code={textContent(children)} incomplete={incomplete} />
    );
  }
  const iconName =
    fence.fileName ??
    (fence.language ? fileNameForLanguage(fence.language) : "");
  const lineNumbers = !/\bnoLineNumbers\b/.test(meta);
  const code = textContent(children);

  return (
    <div className="markdown-code-shell" dir="ltr">
      {iconName ? (
        <span className="markdown-code-icon" aria-hidden="true">
          <FileTypeIcon name={iconName} isDir={false} />
        </span>
      ) : null}
      {fence.filePath ? (
        <MarkdownCodePath path={fence.filePath} startLine={fence.startLine} />
      ) : null}
      <CodeCopyButton code={code} />
      <CodeBlock
        className={className}
        code={code}
        isIncomplete={incomplete}
        language={fence.language}
        lineNumbers={lineNumbers}
        startLine={fence.startLine}
      />
    </div>
  );
}

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setCopied(false);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [code]);

  return (
    <button
      type="button"
      title={copied ? "Copied" : "Copy code"}
      aria-label={copied ? "Copied" : "Copy code"}
      className={`markdown-code-copy ${copied ? "is-copied" : ""}`}
      onClick={() => {
        void copyText(code.replace(/\r?\n$/, "")).then(
          () => {
            setCopied(true);
            if (timer.current != null) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <g className="markdown-code-copy-pages">
          <path d="M12 4H6a2 2 0 0 0-2 2v6" />
          <rect x="7" y="7" width="9" height="9" rx="1.5" />
        </g>
        <path
          className="markdown-code-copy-check"
          d="M4.5 10.5 8.2 14 15.5 6.5"
        />
      </svg>
    </button>
  );
}

type MarkdownImageProps = ComponentProps<"img"> & { node?: unknown };

const noteImageSrcCache = new Map<string, string>();

function NoteAssetImage({
  asset,
  alt,
  ...props
}: Omit<MarkdownImageProps, "src" | "node"> & { asset: string }) {
  const [src, setSrc] = useState(() => noteImageSrcCache.get(asset));

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    void invoke<string>("notes_image_path", { asset })
      .then((path) => {
        const next = convertFileSrc(path);
        noteImageSrcCache.set(asset, next);
        if (!cancelled) setSrc(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset, src]);

  return (
    <img
      {...props}
      src={src}
      alt={alt ?? ""}
      data-note-image={asset}
      draggable={false}
      loading="lazy"
    />
  );
}

function resolveLocalImagePath(url: string, cwd?: string): string | null {
  if (url.startsWith("file://")) {
    const withoutScheme = url.slice(7);
    return withoutScheme.startsWith("/") && /^\/[a-zA-Z]:/.test(withoutScheme)
      ? withoutScheme.slice(1)
      : withoutScheme;
  }
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith("/")) {
    return url;
  }
  if (!cwd) return null;
  const cleanUrl = url.replace(/^\.\//, "");
  return `${cwd.replace(/[/\\]+$/, "")}/${cleanUrl}`;
}

function MarkdownImage({
  src,
  alt,
  node: _node,
  ...props
}: MarkdownImageProps) {
  const { cwd } = useContext(FileOpenContext);
  const url = typeof src === "string" ? src.trim() : "";
  if (!url) return null;

  if (url.startsWith("data:image/")) {
    return (
      <img
        {...props}
        src={url}
        alt={alt ?? ""}
        className="my-3 max-h-[500px] max-w-full rounded-lg border border-content/10 object-contain shadow-xs"
        loading="lazy"
      />
    );
  }

  if (isNoteImagePath(url)) {
    return <NoteAssetImage {...props} asset={url} alt={alt} />;
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    return (
      <img
        {...props}
        src={url}
        alt={alt ?? ""}
        className="my-3 max-h-[500px] max-w-full rounded-lg border border-content/10 object-contain shadow-xs"
        loading="lazy"
      />
    );
  }

  if (
    cwd ||
    url.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(url) ||
    url.startsWith("file://")
  ) {
    const fullPath = resolveLocalImagePath(url, cwd);
    if (fullPath) {
      return (
        <img
          {...props}
          src={convertFileSrc(fullPath)}
          alt={alt ?? ""}
          className="my-3 max-h-[500px] max-w-full rounded-lg border border-content/10 object-contain shadow-xs"
          loading="lazy"
        />
      );
    }
  }

  return null;
}

function MarkdownTable({
  children,
  node: _node,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  return (
    <div className="markdown-table-wrapper my-4 w-full overflow-x-auto rounded-lg border border-content/10 bg-content/[0.02]">
      <table
        className="w-full min-w-full border-collapse text-left text-xs"
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function MarkdownThead({
  children,
  node: _node,
  ...props
}: ComponentProps<"thead"> & { node?: unknown }) {
  return (
    <thead
      className="border-b border-content/10 bg-content/[0.04] text-content"
      {...props}
    >
      {children}
    </thead>
  );
}

function MarkdownTbody({
  children,
  node: _node,
  ...props
}: ComponentProps<"tbody"> & { node?: unknown }) {
  return (
    <tbody className="divide-y divide-content/5" {...props}>
      {children}
    </tbody>
  );
}

function MarkdownTr({
  children,
  node: _node,
  ...props
}: ComponentProps<"tr"> & { node?: unknown }) {
  return (
    <tr
      className="transition-colors hover:bg-content/[0.025]"
      {...props}
    >
      {children}
    </tr>
  );
}

function MarkdownTh({
  children,
  node: _node,
  style,
  ...props
}: ComponentProps<"th"> & { node?: unknown }) {
  return (
    <th
      className="border-r border-content/5 px-3 py-2 font-semibold text-content last:border-r-0"
      style={style}
      {...props}
    >
      {children}
    </th>
  );
}

function MarkdownTd({
  children,
  node: _node,
  style,
  ...props
}: ComponentProps<"td"> & { node?: unknown }) {
  return (
    <td
      className="border-r border-content/5 px-3 py-2 text-content/85 last:border-r-0"
      style={style}
      {...props}
    >
      {children}
    </td>
  );
}

function MarkdownInput({
  type,
  checked,
  disabled,
  node: _node,
  ...props
}: ComponentProps<"input"> & { node?: unknown }) {
  if (type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        readOnly
        className="mr-2 size-3.5 cursor-default rounded border border-content/20 bg-content/5 align-middle accent-content"
        {...props}
      />
    );
  }
  return <input type={type} checked={checked} disabled={disabled} {...props} />;
}

function MarkdownDetails({
  children,
  node: _node,
  ...props
}: ComponentProps<"details"> & { node?: unknown }) {
  return (
    <details
      className="my-3 rounded-lg border border-content/10 bg-content/[0.02] p-3 text-content"
      {...props}
    >
      {children}
    </details>
  );
}

function MarkdownSummary({
  children,
  node: _node,
  ...props
}: ComponentProps<"summary"> & { node?: unknown }) {
  return (
    <summary
      className="cursor-pointer font-medium text-content/90 outline-none select-none transition-colors hover:text-content"
      {...props}
    >
      {children}
    </summary>
  );
}

function MarkdownKbd({
  children,
  node: _node,
  ...props
}: ComponentProps<"kbd"> & { node?: unknown }) {
  return (
    <kbd
      className="rounded border border-content/15 bg-content/10 px-1.5 py-0.5 font-mono text-[11px] text-content shadow-2xs"
      {...props}
    >
      {children}
    </kbd>
  );
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdownFrontmatter(rawText: string): {
  frontmatterEntries: Array<[string, string]>;
  content: string;
} {
  const match = rawText.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatterEntries: [], content: rawText };
  }
  const entries: Array<[string, string]> = [];
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      entries.push([key, val]);
    }
  }
  return {
    frontmatterEntries: entries,
    content: rawText.slice(match[0].length),
  };
}

const MARKDOWN_COMPONENTS = {
  a: MarkdownLink,
  code: MarkdownCode,
  img: MarkdownImage,
  table: MarkdownTable,
  thead: MarkdownThead,
  tbody: MarkdownTbody,
  tr: MarkdownTr,
  th: MarkdownTh,
  td: MarkdownTd,
  input: MarkdownInput,
  details: MarkdownDetails,
  summary: MarkdownSummary,
  kbd: MarkdownKbd,
} satisfies Components;

const remarkPluginsCache = new Map<string | undefined, PluggableList>();

function getRemarkPlugins(cwd: string | undefined): PluggableList {
  let plugins = remarkPluginsCache.get(cwd);
  if (!plugins) {
    plugins = [
      ...Object.values(defaultRemarkPlugins),
      [remarkWorkspaceFileLinks, { cwd }],
    ];
    remarkPluginsCache.set(cwd, plugins);
  }
  return plugins;
}

export const AgentMarkdown = memo(function AgentMarkdown({
  text,
  streaming,
  className,
  cwd,
  onOpenFile,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
  cwd?: string;
  onOpenFile?: OpenFileFn;
}) {
  const [fileMenu, setFileMenu] = useState<FileLinkMenu | null>(null);
  const onFileContextMenu = useCallback(
    (event: ReactMouseEvent, path: string, navigation?: EditorNavigation) => {
      event.preventDefault();
      event.stopPropagation();
      setFileMenu({ x: event.clientX, y: event.clientY, path, navigation });
    },
    [],
  );
  const fileOpen = useMemo(
    () => ({ cwd, onOpenFile, onFileContextMenu }),
    [cwd, onOpenFile, onFileContextMenu],
  );
  const remarkPlugins = useMemo<PluggableList>(
    () => getRemarkPlugins(cwd),
    [cwd],
  );

  const onFileMenuPick = (id: string) => {
    if (!fileMenu) return;
    const path = fileMenu.path;
    setFileMenu(null);

    if (id === "open-polycode") {
      if (fileMenu.navigation) onOpenFile?.(path, fileMenu.navigation);
      else onOpenFile?.(path);
      return;
    }

    let action: Promise<void>;
    switch (id) {
      case "open-default":
        action = openPath(path);
        break;
      case "reveal":
        action = revealPath(path);
        break;
      case "copy-path":
        action = copyText(path);
        break;
      case "copy-relative-path":
        action = copyText(displayPath(path, cwd));
        break;
      default:
        return;
    }
    void action.catch((error) => {
      console.error(`Failed to run file-link action ${id}:`, error);
    });
  };

  const { frontmatterEntries, content: parsedText } = useMemo(() => {
    if (streaming) return { frontmatterEntries: [], content: text };
    return parseMarkdownFrontmatter(text);
  }, [text, streaming]);

  return (
    <FileOpenContext.Provider value={fileOpen}>
      <>
        {frontmatterEntries.length > 0 ? (
          <div className="mb-4 rounded-lg border border-content/10 bg-content/[0.03] p-3 text-xs">
            <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-content/40">
              Metadata
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {frontmatterEntries.map(([key, value]) => (
                <div key={key} className="contents">
                  <span className="font-mono text-content/50">{key}:</span>
                  <span className="truncate text-content/80">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <Streamdown
          className={`agent-markdown min-w-0 font-sans text-sm leading-6 ${className ?? ""}`}
          components={MARKDOWN_COMPONENTS}
          controls={false}
          dir="auto"
          isAnimating={!!streaming}
          plugins={MARKDOWN_PLUGINS}
          remarkPlugins={remarkPlugins}
          rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        >
          {parsedText}
        </Streamdown>
        {fileMenu ? (
          <ExplorerMenu
            x={fileMenu.x}
            y={fileMenu.y}
            items={fileLinkMenuItems(!!onOpenFile, !!cwd)}
            ariaLabel="File link actions"
            onPick={onFileMenuPick}
            onClose={() => setFileMenu(null)}
          />
        ) : null}
      </>
    </FileOpenContext.Provider>
  );
});

export const MarkdownPreview = memo(function MarkdownPreview({
  text,
  streaming,
  cwd,
  onOpenFile,
}: {
  text: string;
  streaming?: boolean;
  cwd?: string;
  onOpenFile?: OpenFileFn;
}) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  return (
    <div
      ref={lockOverscroll}
      className="markdown-preview h-full overflow-y-auto overscroll-none [overflow-anchor:none]"
    >
      <div className="px-6 py-8">
        <AgentMarkdown
          text={text}
          streaming={streaming}
          cwd={cwd}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
});

export const MarkdownSource = memo(function MarkdownSource({
  text,
}: {
  text: string;
}) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();

  return (
    <div
      ref={lockOverscroll}
      className="markdown-preview h-full overflow-y-auto overscroll-none [overflow-anchor:none]"
    >
      <pre className="min-h-full min-w-0 whitespace-pre-wrap wrap-break-word px-4 py-3 font-mono text-[13px] leading-5 text-content/85">
        <MarkdownSourceHighlight text={text} />
      </pre>
    </div>
  );
});

export function MarkdownSourceHighlight({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/(\n)/).map((part, index) =>
        part === "\n" ? (
          "\n"
        ) : isAtxHeadingLine(part) ? (
          <span key={index} className="markdown-source-heading">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function MermaidBlock({
  code,
  incomplete,
}: {
  code: string;
  incomplete: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (incomplete) {
      setSvg(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    const id = `mermaid-${Math.abs(hashCode(code)).toString(36)}-${Date.now().toString(36)}`;
    void mermaid
      .getMermaid({
        ...MERMAID_BASE_CONFIG,
        theme: colorScheme === "light" ? "default" : "dark",
      })
      .render(id, code)
      .then((result) => {
        if (cancelled) return;
        setSvg(result.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, incomplete, colorScheme]);

  if (incomplete || failed) {
    return (
      <div className="markdown-code-shell" dir="ltr">
        <span className="markdown-code-icon" aria-hidden="true">
          <FileTypeIcon name="diagram.mmd" isDir={false} />
        </span>
        <CodeCopyButton code={code} />
        <CodeBlock
          code={code}
          isIncomplete={incomplete}
          language="mermaid"
          lineNumbers={false}
        />
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="h-32 animate-pulse rounded-[10px] border border-content/10 bg-content/6" />
    );
  }

  return (
    <div
      className="mermaid-block overflow-x-auto rounded-[10px] border border-content/10 bg-content/6 p-3"
      data-streamdown="mermaid-block"
      dir="ltr"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function codeMeta(node: unknown): string {
  if (!node || typeof node !== "object" || !("properties" in node)) return "";
  const properties = node.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    !("metastring" in properties)
  ) {
    return "";
  }
  return typeof properties.metastring === "string" ? properties.metastring : "";
}

function textContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return textContent(value.props.children);
  }
  return "";
}

function parseCodeFence(
  className: string | undefined,
  meta: string,
): {
  language: string;
  startLine?: number;
  fileName?: string;
  filePath?: string;
} {
  const raw = className?.match(/\blanguage-([^\s]+)/)?.[1] ?? "";
  const metaStart = meta.match(/\bstartLine=(\d+)/);
  const metaStartLine = metaStart ? Number(metaStart[1]) : undefined;

  const citation = raw.match(/^(\d+):(\d+):(.+)$/);
  if (citation) {
    const filePath = citation[3];
    const fileName = filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath;
    return {
      language: languageFromFileName(fileName),
      startLine: Number(citation[1]),
      fileName,
      filePath,
    };
  }

  if (/[/\\]/.test(raw)) {
    const fileName = raw.split(/[/\\]/).filter(Boolean).pop() ?? raw;
    return {
      language: languageFromFileName(fileName),
      startLine: metaStartLine,
      fileName,
      filePath: raw,
    };
  }

  return { language: raw, startLine: metaStartLine };
}

function MarkdownCodePath({
  path,
  startLine,
}: {
  path: string;
  startLine?: number;
}) {
  const { cwd, onOpenFile, onFileContextMenu } = useContext(FileOpenContext);
  const file = resolveWorkspaceFileReference(path, cwd);
  if (!file || !onOpenFile) {
    return <span className="markdown-code-path">{path}</span>;
  }
  const navigation =
    file.navigation ??
    (startLine && startLine > 0 ? { line: startLine } : undefined);
  return (
    <button
      type="button"
      className="markdown-code-path markdown-code-path-link"
      title={file.path}
      onClick={() => onOpenFile(file.path, navigation)}
      onContextMenu={(event) =>
        onFileContextMenu?.(event, file.path, navigation)
      }
    >
      {path}
    </button>
  );
}

function languageFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const ext = lower.includes(".")
    ? lower.slice(lower.lastIndexOf(".") + 1)
    : lower;
  return LANGUAGE_FROM_EXT[ext] ?? ext;
}

function fileNameForLanguage(language: string): string {
  const key = language.toLowerCase();
  return LANGUAGE_FILE_NAMES[key] ?? `code.${key}`;
}

function inlineFileName(value: string): string | undefined {
  const text = value.trim();
  if (!text || text.length > 240 || /\s/.test(text)) return undefined;

  const withoutLocation = text.replace(
    /(?::\d+(?::\d+)?|#L\d+(?:-L\d+)?)$/,
    "",
  );
  const fileName = withoutLocation.split(/[/\\]/).filter(Boolean).pop();
  if (!fileName || !/^[\w%@+().-]+$/.test(fileName)) return undefined;

  if (isExtensionlessFileName(fileName)) {
    return fileName;
  }

  const extension = fileName.includes(".")
    ? fileName.split(".").pop()
    : undefined;
  return extension && /^[a-z][a-z0-9+-]{0,11}$/i.test(extension)
    ? fileName
    : undefined;
}
