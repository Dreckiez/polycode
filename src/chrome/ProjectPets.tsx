import { useEffect, useState } from "react";
import {
  PROJECT_PET_LIMIT,
  PET_TYPES,
  addProjectPet,
  defaultPetColor,
  loadProjectPets,
  petIconUrl,
  projectPetLabel,
  removeProjectPet,
  setLeadProjectPet,
  subscribeProjectPets,
  type ProjectPet,
} from "../lib/projectPets";
import { Trash2 } from "./icons";

function useProjectPets(project: string): ProjectPet[] {
  const [pets, setPets] = useState<ProjectPet[]>(() => loadProjectPets(project));
  useEffect(() => {
    const reload = () => setPets(loadProjectPets(project));
    reload();
    return subscribeProjectPets(reload);
  }, [project]);
  return pets;
}

/** The first pet is the project's icon and lead pet. */
export function ProjectPetIcon({
  project,
  className = "size-3 shrink-0",
}: {
  project: string;
  className?: string;
}) {
  const pet = useProjectPets(project)[0];
  return (
    <img
      aria-hidden
      src={petIconUrl(pet)}
      className={`${className} object-contain [image-rendering:pixelated]`}
    />
  );
}

export function ProjectPetsMenu({ project }: { project: string }) {
  const pets = useProjectPets(project);
  return (
    <div className="mb-2 border-t border-content/10 px-0.5 pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-content/50">Project pets</p>
        <span className="text-[10px] text-content/40">{pets.length}/{PROJECT_PET_LIMIT}</span>
      </div>
      <p className="mb-1.5 text-[10px] text-content/40">The first pet is the project icon.</p>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {pets.map((pet, index) => (
          <div key={pet.id} className="group flex items-center gap-0.5 rounded-md bg-content/5 p-0.5">
            <button
              type="button"
              title={index === 0 ? `${projectPetLabel(pet.type)} (project icon)` : `Make ${projectPetLabel(pet.type)} the project icon`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setLeadProjectPet(project, pet.id)}
              className={`grid size-6 cursor-pointer place-items-center rounded ${index === 0 ? "bg-content/12 ring-1 ring-content/35" : "hover:bg-content/10"}`}
            >
              <img src={petIconUrl(pet)} aria-hidden className="size-5 object-contain [image-rendering:pixelated]" />
            </button>
            <button
              type="button"
              disabled={pets.length <= 1}
              title={pets.length <= 1 ? "A project needs one pet" : `Remove ${projectPetLabel(pet.type)}`}
              aria-label={`Remove ${projectPetLabel(pet.type)}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => removeProjectPet(project, pet.id)}
              className="grid size-4 cursor-pointer place-items-center rounded text-content/35 hover:bg-red-500/15 hover:text-red-300 disabled:cursor-default disabled:opacity-20"
            >
              <Trash2 className="size-2.5" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {PET_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={pets.length >= PROJECT_PET_LIMIT}
            title={`Add ${projectPetLabel(type)}`}
            aria-label={`Add ${projectPetLabel(type)}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => addProjectPet(project, type)}
            className="grid size-5 cursor-pointer place-items-center rounded hover:bg-content/10 disabled:cursor-default disabled:opacity-25"
          >
            <img src={petIconUrl({ type, color: defaultPetColor(type) })} aria-hidden className="size-4 object-contain [image-rendering:pixelated]" />
          </button>
        ))}
      </div>
    </div>
  );
}
