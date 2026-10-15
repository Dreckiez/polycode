import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { PetPlayground } from "../lib/petPlayground";
import {
  loadProjectPets,
  petSpriteUrl,
  subscribeProjectPets,
  type ProjectPet,
} from "../lib/projectPets";

type Props = {
  project: string;
  busy: boolean;
  enabled: boolean;
  scale: number;
};

export function ProjectPetBar({ project, busy, enabled, scale }: Props) {
  const [hidden, setHidden] = useState(() => document.hidden);
  const busyRef = useRef(busy);
  const projectRef = useRef(project);
  const pendingThrow = useRef(busy);
  useEffect(() => {
    if (busy && (!busyRef.current || projectRef.current !== project))
      pendingThrow.current = true;
    if (!busy) pendingThrow.current = false;
    busyRef.current = busy;
    projectRef.current = project;
  }, [busy, project]);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Unmount the scene to stop both our simulation and the browser's animated GIFs.
  return enabled && !hidden ? (
    <PetScene
      key={project}
      project={project}
      busy={busy}
      scale={scale}
      pendingThrow={pendingThrow}
    />
  ) : null;
}

function PetScene({
  project,
  busy,
  scale,
  pendingThrow,
}: Omit<Props, "enabled"> & { pendingThrow: RefObject<boolean> }) {
  const [pets, setPets] = useState<ProjectPet[]>(() =>
    loadProjectPets(project),
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLSpanElement>(null);
  const petEls = useRef(new Map<string, HTMLImageElement>());
  const worldRef = useRef<PetPlayground | null>(null);
  if (!worldRef.current) worldRef.current = new PetPlayground();
  const world = worldRef.current;
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    at: number;
  } | null>(null);

  useEffect(() => {
    const reload = () => setPets(loadProjectPets(project));
    return subscribeProjectPets(reload);
  }, [project]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.getBoundingClientRect().width;
      world.resize(width, scale);
      if (width <= 0) return;
      world.syncPets(
        pets.map((pet) => ({
          id: pet.id,
          width:
            petEls.current.get(pet.id)?.getBoundingClientRect().width ||
            40 * scale,
        })),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    // Image sizes can change with the animation's aspect ratio.
    for (const element of petEls.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [pets, scale, world]);

  useEffect(() => {
    if (busy && drag.current) {
      const pointerId = drag.current.pointerId;
      drag.current = null;
      world.ball = null;
      stageRef.current?.releasePointerCapture(pointerId);
    }
  }, [busy, world]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (pendingThrow.current && world.width > 0) {
        world.throwRandomBall();
        pendingThrow.current = false;
      }
      world.step((now - last) / 1000);
      last = now;
      for (const pose of world.pets) {
        const element = petEls.current.get(pose.id);
        const pet = pets.find((entry) => entry.id === pose.id);
        if (!element || !pet) continue;
        element.style.transform = `translate3d(${pose.x}px, 0, 0) scaleX(${pose.facing})`;
        const sprite = petSpriteUrl(pet, pose.mode);
        if (element.getAttribute("src") !== sprite)
          element.setAttribute("src", sprite);
      }
      const ball = ballRef.current;
      if (ball) {
        const pose = world.ball;
        ball.style.visibility = pose ? "visible" : "hidden";
        if (pose) {
          const radius = 4 * world.scale;
          ball.style.transform = `translate3d(${pose.x - radius}px, ${radius - pose.y}px, 0)`;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pets, world, pendingThrow]);

  const holdAtPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    world.holdBall(event.clientX - rect.left, rect.bottom - event.clientY);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
    };
    holdAtPointer(event);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId || busy) return;
    event.preventDefault();
    holdAtPointer(event);
  };

  const finishDrag = (
    event: PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    drag.current = null;
    if (cancelled || busy) world.ball = null;
    else {
      holdAtPointer(event);
      world.releaseBall(
        event.clientX - start.x,
        start.y - event.clientY,
        (performance.now() - start.at) / 1000,
      );
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={stageRef}
      aria-label={
        busy
          ? "Project pets playing"
          : "Project pets. Click to toss a ball, or drag and release to throw."
      }
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onLostPointerCapture={(event) => finishDrag(event, true)}
      className="absolute bottom-[calc(100%-9px)] left-3 right-3 z-20 touch-none cursor-crosshair select-none overflow-visible"
      style={{ height: Math.round(52 * scale) }}
    >
      <span
        ref={ballRef}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 rounded-full border border-yellow-100/60 bg-yellow-300"
        style={{ visibility: "hidden", width: 8 * scale, height: 8 * scale }}
      />
      {pets.map((pet) => (
        <img
          key={pet.id}
          ref={(element) => {
            if (element) petEls.current.set(pet.id, element);
            else petEls.current.delete(pet.id);
          }}
          draggable={false}
          aria-hidden
          src={petSpriteUrl(pet, "walk")}
          className="pointer-events-none absolute bottom-0 left-0 object-contain [image-rendering:pixelated] will-change-transform"
          style={{
            height: Math.round(40 * scale),
            maxWidth: Math.round(56 * scale),
          }}
        />
      ))}
    </div>
  );
}
