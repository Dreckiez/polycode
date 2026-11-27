import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useImagePan } from "../hooks/useImagePan";
import { LAYER } from "../lib/layers";
import { uiScaleCommand } from "../lib/uiScale";
import { X } from "./icons";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

type View = { scale: number; x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DOUBLE_CLICK_SCALE = 2.5;
const KEY_ZOOM_STEP = 1.25;
const IDENTITY: View = { scale: 1, x: 0, y: 0 };

export function ImageLightbox({ src, alt, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [view, setViewState] = useState<View>(IDENTITY);
  const viewRef = useRef(view);
  const zoomed = view.scale > MIN_SCALE;
  const { didDrag, dragging, handlers } = useImagePan(zoomed, (dx, dy) => {
    const container = containerRef.current;
    if (!container) return;
    const current = viewRef.current;
    const next = clampView(
      { ...current, x: current.x + dx, y: current.y + dy },
      container,
      imageRef.current,
    );
    viewRef.current = next;
    setViewState(next);
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const setView = (next: View) => {
      const clamped = clampView(next, container, imageRef.current);
      viewRef.current = clamped;
      setViewState(clamped);
    };

    // Zooms toward the pointer so the pixel under it stays put.
    const zoomAt = (scale: number, clientX: number, clientY: number) => {
      const current = viewRef.current;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      if (nextScale === MIN_SCALE) return setView(IDENTITY);
      const rect = container.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const ratio = nextScale / current.scale;
      setView({
        scale: nextScale,
        x: dx - ratio * (dx - current.x),
        y: dy - ratio * (dy - current.y),
      });
    };

    // Cmd/Ctrl +, -, and 0 zoom the image instead of the app while it is open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.isComposing
      )
        return;
      const zoom = uiScaleCommand(event);
      if (!zoom) return;
      event.preventDefault();
      event.stopPropagation();
      const box = container.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const scale = viewRef.current.scale;
      if (zoom === "zoom-in") zoomAt(scale * KEY_ZOOM_STEP, centerX, centerY);
      else if (zoom === "zoom-out")
        zoomAt(scale / KEY_ZOOM_STEP, centerX, centerY);
      else setView(IDENTITY);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.01);
      zoomAt(viewRef.current.scale * factor, event.clientX, event.clientY);
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (event.target !== imageRef.current || didDrag.current) return;
      if (viewRef.current.scale > MIN_SCALE) setView(IDENTITY);
      else zoomAt(DOUBLE_CLICK_SCALE, event.clientX, event.clientY);
    };

    const onResize = () => setView(viewRef.current);

    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [didDrag]);

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      data-image-zoom
      aria-label={`Image preview: ${alt}`}
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black/85 p-6 backdrop-blur-sm"
      style={{ zIndex: LAYER.dialog }}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        {...handlers}
        className={`max-h-full max-w-full touch-none select-none object-contain shadow-2xl ${
          zoomed
            ? dragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-zoom-in"
        }`}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: dragging ? undefined : "transform 60ms ease-out",
        }}
      />
      <button
        ref={closeRef}
        type="button"
        aria-label="Close image preview"
        title="Close"
        onClick={onClose}
        className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/15 bg-black/45 text-white/80 shadow-lg backdrop-blur-md hover:bg-black/65 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>,
    document.body,
  );
}

// Keeps a zoomed image covering the viewport on each axis it overflows, and
// centered on each axis it doesn't.
function clampView(
  view: View,
  container: HTMLElement,
  image: HTMLElement | null,
): View {
  if (!image || view.scale <= MIN_SCALE) return IDENTITY;
  const maxX = Math.max(
    0,
    (image.offsetWidth * view.scale - container.clientWidth) / 2,
  );
  const maxY = Math.max(
    0,
    (image.offsetHeight * view.scale - container.clientHeight) / 2,
  );
  return {
    scale: view.scale,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  };
}
