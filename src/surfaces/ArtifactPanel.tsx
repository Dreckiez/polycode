import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Copy, Trash2, PanelRight } from "../chrome/icons";
import { copyMessage } from "../lib/clipboard";
import { IconButton } from "../chrome/TitleBar";
import { useDragResize } from "../hooks/useDragResize";
import { artifactLabel, deleteArtifact } from "../lib/artifacts";
import { ArtifactContent, useArtifact } from "./ArtifactContent";
import type { OpenFileFn } from "../lib/search";

let rememberedArtifactWidth = 560;

export function ArtifactPanel({
  id,
  color,
  onClose,
  onOpenFile,
  windowControls,
}: {
  id: string;
  color?: string;
  onClose: () => void;
  onOpenFile?: OpenFileFn;
  windowControls?: ReactNode;
}) {
  const { artifact, loaded, error, setError } = useArtifact(id);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => setCopied(false), [id]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  const resize = useDragResize({
    min: 360,
    max: () => Math.min(840, Math.round(window.innerWidth * 0.58)),
    defaultWidth: 560,
    initial: rememberedArtifactWidth,
    direction: "left",
    onCommit: (width) => {
      rememberedArtifactWidth = width;
    },
  });

  const label = artifact ? artifactLabel(artifact.kind) : "Document";
  const noun = label.toLowerCase();

  const onDelete = async () => {
    if (!artifact || deleting || !window.confirm(`Delete “${artifact.title}”?`))
      return;
    setDeleting(true);
    setError(null);
    try {
      await deleteArtifact(artifact.id);
      if (mounted.current) onClose();
    } catch {
      setError(`Could not delete this ${noun}.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <aside
      ref={resize.setPaneRef}
      aria-label={`${label} reader`}
      data-mono-artifact=""
      data-open="true"
      style={
        {
          "--mono-color": color ?? "",
          "--mono-window-controls-width": windowControls
            ? "calc(7.5rem + 1px)"
            : "0px",
        } as CSSProperties
      }
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-content/10 bg-background font-sans text-content"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Mono artifact"
        className={`absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
      {windowControls ? (
        <div className="absolute right-0 top-0 z-30 h-10">{windowControls}</div>
      ) : null}
      <header
        className="flex h-10 shrink-0 items-stretch border-b border-content/10"
        style={{ paddingRight: "var(--mono-window-controls-width)" }}
        data-tauri-drag-region="deep"
      >
        <h3 className="flex min-w-0 flex-1 items-center pl-4 text-[13px] font-medium text-content">
          {label}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5 px-3">
          {artifact ? (
            <>
              <IconButton
                label={`Delete ${noun}`}
                disabled={deleting}
                onClick={() => void onDelete()}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
              <IconButton
                label={copied ? "Copied" : `Copy ${noun}`}
                onClick={() =>
                  void copyMessage(artifact.body).then(
                    () => setCopied(true),
                    () => setError(`Could not copy this ${noun}.`),
                  )
                }
              >
                <Copy className="size-3.5" />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label={`Hide ${label.toLowerCase()}`}
            active
            onClick={onClose}
          >
            <PanelRight className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none px-7 py-6">
        {!loaded ? (
          <p role="status" className="text-[13px] text-content/50">
            Loading document…
          </p>
        ) : error && !artifact ? (
          <p role="alert" className="text-[13px] text-content/65">
            {error}
          </p>
        ) : !artifact ? (
          <p role="status" className="text-[13px] text-content/50">
            This document is no longer available.
          </p>
        ) : (
          <article data-artifact-reader={artifact.id}>
            <div className="mb-6">
              <h1 className="text-[22px] font-medium leading-snug text-content">
                {artifact.title}
              </h1>
              <p className="mt-2 text-[11px] text-content/45">
                Updated {new Date(artifact.updatedAt).toLocaleString()}
              </p>
            </div>
            <ArtifactContent artifact={artifact} onOpenFile={onOpenFile} />
            {error ? (
              <p role="alert" className="mt-3 text-[12px] text-content/60">
                {error}
              </p>
            ) : null}
            <span role="status" className="sr-only">
              {copied ? `${label} copied` : ""}
            </span>
          </article>
        )}
      </div>
    </aside>
  );
}
