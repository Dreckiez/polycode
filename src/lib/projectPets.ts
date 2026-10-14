import { projectKey } from "./paths";

export const PET_TYPES = [
  "cat",
  "chicken",
  "cockatiel",
  "crab",
  "deno",
  "dog",
  "fox",
  "horse",
  "panda",
  "raccoon",
  "rat",
] as const;

export type PetType = (typeof PET_TYPES)[number];

export type ProjectPet = {
  id: string;
  type: PetType;
  color: string;
};

const PETS_KEY = "polycode:project-pets";
export const PROJECT_PETS_CHANGE_EVENT = "polycode:project-pets-change";
export const PROJECT_PET_LIMIT = 5;

const COLORS: Record<PetType, readonly string[]> = {
  cat: ["orange", "black", "brown", "gray", "lightbrown", "white"],
  chicken: ["white", "brown", "gray"],
  cockatiel: ["gray", "brown"],
  crab: ["red"],
  deno: ["green"],
  dog: ["akita", "black", "brown", "red", "white"],
  fox: ["red", "white"],
  horse: ["brown", "black", "white", "magical", "paint_beige", "paint_black", "paint_brown", "socks_beige", "socks_black", "socks_brown", "warrior"],
  panda: ["black", "brown"],
  raccoon: ["gray", "gray_jimothy"],
  rat: ["gray", "brown", "white"],
};

const LABELS: Record<PetType, string> = {
  cat: "Cat", chicken: "Chicken", cockatiel: "Cockatiel", crab: "Crab",
  deno: "Deno", dog: "Dog", fox: "Fox", horse: "Horse", panda: "Panda",
  raccoon: "Raccoon", rat: "Rat",
};

function fallback(type: PetType = "cat"): ProjectPet {
  return { id: "pet-cat", type, color: COLORS[type][0] };
}

function isPetType(value: unknown): value is PetType {
  return typeof value === "string" && (PET_TYPES as readonly string[]).includes(value);
}

function normalizePet(value: unknown, index: number): ProjectPet | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isPetType(record.type)) return null;
  const colors = COLORS[record.type];
  return {
    id: typeof record.id === "string" && record.id ? record.id : `pet-${record.type}-${index}`,
    type: record.type,
    color: typeof record.color === "string" && colors.includes(record.color)
      ? record.color
      : colors[0],
  };
}

function readAll(): Record<string, ProjectPet[]> {
  try {
    const raw = localStorage.getItem(PETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) => {
        if (!Array.isArray(value)) return [];
        const pets = value
          .map((pet, index) => normalizePet(pet, index))
          .filter((pet): pet is ProjectPet => pet !== null)
          .slice(0, PROJECT_PET_LIMIT);
        return pets.length ? [[key, pets]] : [];
      }),
    );
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, ProjectPet[]>): void {
  try {
    localStorage.setItem(PETS_KEY, JSON.stringify(value));
  } catch {
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECT_PETS_CHANGE_EVENT));
  }
}

/** Does not write during render; an unseen project visually defaults to one orange cat. */
export function loadProjectPets(project: string): ProjectPet[] {
  const key = projectKey(project);
  return readAll()[key] ?? [fallback()];
}

export function projectPetLabel(type: PetType): string {
  return LABELS[type];
}

export function defaultPetColor(type: PetType): string {
  return COLORS[type][0];
}

export function petIconUrl(pet: Pick<ProjectPet, "type" | "color">): string {
  if (pet.type === "cockatiel" && pet.color === "brown") {
    return "/pets/cockatiel/brown_icon.png";
  }
  const suffix = pet.color === COLORS[pet.type][0] ? "" : `_${pet.color}`;
  return `/pets/${pet.type}/icon${suffix}.png`;
}

export function petSpriteUrl(
  pet: Pick<ProjectPet, "type" | "color">,
  state: "idle" | "walk" | "run" | "swipe" | "with_ball",
): string {
  const fileState = pet.type === "horse" && state === "idle" ? "stand" : state;
  return `/pets/${pet.type}/${pet.color}_${fileState}_8fps.gif`;
}

export function addProjectPet(project: string, type: PetType): void {
  const key = projectKey(project);
  const all = readAll();
  const current = all[key] ?? [fallback()];
  if (current.length >= PROJECT_PET_LIMIT) return;
  const color = COLORS[type][Math.floor(Math.random() * COLORS[type].length)];
  all[key] = [...current, { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, color }];
  writeAll(all);
}

/** Removing the lead promotes the next pet in the same saved roster atomically. */
export function removeProjectPet(project: string, petId: string): void {
  const key = projectKey(project);
  const all = readAll();
  const current = all[key] ?? [fallback()];
  if (current.length <= 1) return;
  const next = current.filter((pet) => pet.id !== petId);
  if (next.length === current.length || next.length === 0) return;
  all[key] = next;
  writeAll(all);
}

export function setLeadProjectPet(project: string, petId: string): void {
  const key = projectKey(project);
  const all = readAll();
  const current = all[key] ?? [fallback()];
  const index = current.findIndex((pet) => pet.id === petId);
  if (index <= 0) return;
  all[key] = [current[index], ...current.slice(0, index), ...current.slice(index + 1)];
  writeAll(all);
}

export function subscribeProjectPets(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PROJECT_PETS_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(PROJECT_PETS_CHANGE_EVENT, onStoreChange);
}
