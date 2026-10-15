import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT_PET_LIMIT,
  PET_TYPES,
  addProjectPet,
  loadProjectPets,
  petIconUrl,
  removeProjectPet,
  setLeadProjectPet,
} from "./projectPets";

const project = "C:/work/pets";

beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });
});

describe("bundled pet icons", () => {
  const publicRoot = fileURLToPath(new URL("../../public", import.meta.url));
  const suffix = "_walk_8fps.gif";

  it.each(PET_TYPES)("has an icon for every bundled %s color", (type) => {
    const colors = readdirSync(join(publicRoot, "pets", type))
      .filter((name) => name.endsWith(suffix))
      .map((name) => name.slice(0, -suffix.length));
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      const url = petIconUrl({ type, color });
      expect(existsSync(join(publicRoot, url.slice(1))), `${type}/${color}: ${url}`).toBe(true);
    }
  });
});

describe("project pet rosters", () => {
  it("starts each project with one cat", () => {
    expect(loadProjectPets(project)).toEqual([
      expect.objectContaining({ type: "cat", color: "orange" }),
    ]);
  });

  it("caps additions at five pets", () => {
    for (const type of ["dog", "fox", "horse", "panda", "rat", "crab"] as const) {
      addProjectPet(project, type);
    }
    expect(loadProjectPets(project)).toHaveLength(PROJECT_PET_LIMIT);
  });

  it("promotes a chosen pet atomically and never removes the final pet", () => {
    addProjectPet(project, "dog");
    const [, dog] = loadProjectPets(project);
    setLeadProjectPet(project, dog.id);
    expect(loadProjectPets(project)[0].id).toBe(dog.id);
    removeProjectPet(project, dog.id);
    expect(loadProjectPets(project)).toHaveLength(1);
    removeProjectPet(project, loadProjectPets(project)[0].id);
    expect(loadProjectPets(project)).toHaveLength(1);
  });
});
