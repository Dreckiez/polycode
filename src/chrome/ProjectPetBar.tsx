import { useEffect, useRef, useState } from "react";
import {
  loadProjectPets,
  petSpriteUrl,
  subscribeProjectPets,
  type ProjectPet,
} from "../lib/projectPets";

type Mode = "idle" | "walk" | "run" | "with_ball";

type Props = {
  project: string;
  busy: boolean;
  enabled: boolean;
  scale: number;
};

/**
 * Only the active project's bar is mounted. Its loop owns no state outside this
 * component, so unmounting, hiding the app, or disabling the setting stops all
 * animation work immediately.
 */
export function ProjectPetBar({ project, busy, enabled, scale }: Props) {
  const [pets, setPets] = useState<ProjectPet[]>(() => loadProjectPets(project));
  const [hidden, setHidden] = useState(() => document.hidden);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [ball, setBall] = useState<{ id: number; x: number } | null>(null);
  const petEls = useRef(new Map<string, HTMLImageElement>());
  const busyRef = useRef(busy);
  const turnRef = useRef(0);

  useEffect(() => {
    const reload = () => setPets(loadProjectPets(project));
    reload();
    return subscribeProjectPets(reload);
  }, [project]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A new busy edge represents a real active turn. Queuing does not change it.
  useEffect(() => {
    const started = busy && !busyRef.current;
    busyRef.current = busy;
    if (!started || !enabled || hidden) return;
    const id = ++turnRef.current;
    setBall({ id, x: 52 });
    setModes(Object.fromEntries(pets.map((pet) => [pet.id, "with_ball"] as const)));
    const timeout = window.setTimeout(() => {
      if (turnRef.current !== id) return;
      setBall(null);
      setModes(Object.fromEntries(pets.map((pet, index) => [pet.id, index % 2 ? "idle" : "walk"] as const)));
    }, 1450);
    return () => window.clearTimeout(timeout);
  }, [busy, enabled, hidden, pets]);

  useEffect(() => {
    if (!enabled || hidden || pets.length === 0) return;
    const positions = new Map(pets.map((pet, index) => [pet.id, {
      x: 5 + (index * 18) % 76,
      direction: index % 2 ? -1 : 1,
      speed: 0.006 + index * 0.0015,
    }]));
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      for (const [id, position] of positions) {
        const next = position.x + position.direction * position.speed * dt;
        if (next < 0 || next > 90) position.direction *= -1;
        else position.x = next;
        const el = petEls.current.get(id);
        if (el) el.style.transform = `translate3d(${position.x}%, 0, 0) scaleX(${position.direction})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, hidden, pets]);

  useEffect(() => {
    if (!enabled || hidden || busy) return;
    const interval = window.setInterval(() => {
      setModes(() => Object.fromEntries(pets.map((pet, index) => {
        const options: Mode[] = index % 3 === 0 ? ["idle", "walk", "run"] : ["idle", "walk"];
        return [pet.id, options[Math.floor(Math.random() * options.length)]] as const;
      })));
    }, 2600);
    return () => window.clearInterval(interval);
  }, [busy, enabled, hidden, pets]);

  if (!enabled) return null;
  const throwBall = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || hidden) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const id = ++turnRef.current;
    setBall({ id, x: Math.max(4, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100)) });
    setModes(Object.fromEntries(pets.map((pet) => [pet.id, "with_ball"] as const)));
    window.setTimeout(() => {
      if (turnRef.current !== id) return;
      setBall(null);
      setModes({});
    }, 1450);
  };

  return (
    <div
      aria-label={busy ? "Project pets are playing with the turn ball" : "Project pets. Click the ledge to throw a ball."}
      onPointerDown={throwBall}
      className="absolute bottom-[calc(100%-9px)] left-3 right-3 z-20 cursor-crosshair select-none overflow-hidden px-2"
      style={{ height: `${Math.round(52 * scale)}px` }}
    >
      {ball ? (
        <span
          aria-hidden
          className="absolute rounded-full border border-yellow-100/60 bg-yellow-300 shadow-[0_1px_4px_rgba(255,205,50,0.7)]"
          style={{ left: `${ball.x}%`, bottom: `${Math.round(12 * scale)}px`, width: `${Math.max(5, Math.round(8 * scale))}px`, height: `${Math.max(5, Math.round(8 * scale))}px` }}
        />
      ) : null}
      {pets.map((pet) => {
        const mode = modes[pet.id] ?? "walk";
        return (
          <img
            key={pet.id}
            ref={(el) => {
              if (el) petEls.current.set(pet.id, el);
              else petEls.current.delete(pet.id);
            }}
            draggable={false}
            aria-hidden
            src={petSpriteUrl(pet, mode)}
            className="absolute bottom-0 left-0 max-w-14 object-contain [image-rendering:pixelated] will-change-transform"
            style={{ height: `${Math.round(40 * scale)}px` }}
          />
        );
      })}
    </div>
  );
}
