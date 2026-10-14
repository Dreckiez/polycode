import { ProjectPetIcon } from "./ProjectPets";

type Props = {
  project: string;
  /** Project color; omit to inherit the surrounding text color. */
  color?: string;
  /** Explicit pick from the project menu; falls back to the hashed one. */
  name?: string | null;
  className?: string;
  /** Cycles the mascot's two frames while a turn is in flight. */
  active?: boolean;
};

/** @deprecated Kept as a small compatibility wrapper while project marks become pets. */
export function ProjectMascot({
  project,
  color: _color,
  name: _name,
  className = "size-3 shrink-0",
  active: _active = false,
}: Props) {
  return <ProjectPetIcon project={project} className={className} />;
}
