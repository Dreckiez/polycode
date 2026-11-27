import { useRef, useState, type PointerEvent } from "react";

export function useImagePan(
  enabled: boolean,
  panBy: (dx: number, dy: number) => void,
) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0 || pointer.current) return;
    didDrag.current = false;
    if (!enabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const active = pointer.current;
    if (active?.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!didDrag.current) {
      if (Math.hypot(dx, dy) < 3) return;
      didDrag.current = true;
      setDragging(true);
    }
    pointer.current = { id: active.id, x: event.clientX, y: event.clientY };
    panBy(dx, dy);
  };

  const end = (event: PointerEvent<HTMLImageElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    setDragging(false);
  };

  return {
    didDrag,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
