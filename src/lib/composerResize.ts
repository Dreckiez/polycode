/** Matches the composer's max height, so the field stops growing where it clips. */
export const COMPOSER_MAX_HEIGHT = 168;

type Resizable = {
  style: { height: string };
  scrollHeight: number;
};

/** A hidden tab stays mounted with no layout box, so it reports 0 here. */
export function resizeComposer(el: Resizable) {
  if (el.scrollHeight === 0) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
}
