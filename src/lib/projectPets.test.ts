import { beforeEach, describe, expect, it } from "vitest";
import {
  PROJECT_PET_LIMIT,
  addProjectPet,
  loadProjectPets,
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
