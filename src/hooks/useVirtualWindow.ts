import { useCallback, useMemo, useRef, useState } from "react";

export type VirtualWindow = {
  /** Ref to the scroll container (measures size + tracks scroll). */
  containerRef: (el: HTMLDivElement | null) => void;
  onScroll: () => void;
  totalHeight: number;
  /** Inclusive/exclusive row range to render (after overscan). */
  start: number;
  end: number;
};

/**
 * Uniform-height windowing hook. Renders only the rows that could fit in the
 * viewport (plus `overscan` on each side); callers position each row absolutely
 * at `index * rowHeight`.
 */
export function useVirtualWindow(
  count: number,
  rowHeight: number,
  overscan = 6,
): VirtualWindow & { scrollTop: number; viewHeight: number } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const window = useMemo(() => {
    if (count === 0 || rowHeight <= 0) return { start: 0, end: 0 };
    const firstVisible = Math.floor(scrollTop / rowHeight);
    const lastVisible = Math.ceil((scrollTop + viewHeight) / rowHeight);
    return {
      start: Math.max(0, firstVisible - overscan),
      end: Math.min(count, lastVisible + overscan),
    };
  }, [count, rowHeight, scrollTop, viewHeight, overscan]);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (hostRef.current === el) return;
    roRef.current?.disconnect();
    roRef.current = null;
    hostRef.current = el;
    if (!el) return;
    setViewHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewHeight(el.clientHeight));
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const onScroll = useCallback(() => {
    const el = hostRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  return {
    containerRef,
    onScroll,
    totalHeight: count * rowHeight,
    start: window.start,
    end: window.end,
    scrollTop,
    viewHeight,
  };
}