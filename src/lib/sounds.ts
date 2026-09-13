import { play, setEnabled, setVolume, type SoundName } from "cuelume";

const KEY = "monocode.sounds";

export const SOUNDS_DEFAULT = true;

/** Soft enough to sit in the background while a turn runs in another app. */
export const SOUNDS_VOLUME = 0.55;

export const SOUNDS_CHANGE_EVENT = "monocode:sounds-change";

export type SoundCue =
  | "turnFinished"
  | "updateAvailable"
  | "switch"
  | "copy";

const CUES: Record<SoundCue, SoundName> = {
  turnFinished: "success",
  updateAvailable: "arrival",
  switch: "toggle",
  copy: "scan",
};

export function loadSoundsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return SOUNDS_DEFAULT;
    return raw === "1" || raw === "true";
  } catch {
    return SOUNDS_DEFAULT;
  }
}

export function saveSoundsEnabled(value: boolean) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // private mode / quota
  }
  applySoundEngine();
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(SOUNDS_CHANGE_EVENT, { detail: value }),
  );
}

function applySoundEngine() {
  setEnabled(loadSoundsEnabled());
  setVolume(SOUNDS_VOLUME);
}

/** Apply the stored mute/volume before the first cue. */
export function initSounds() {
  applySoundEngine();
}

export function playCue(cue: SoundCue) {
  if (!loadSoundsEnabled()) return;
  applySoundEngine();
  play(CUES[cue]);
}

let announcedUpdate: string | undefined;

/** One cue per available version, including a later probe of the same build. */
export function announceUpdateAvailable(version: string | null) {
  if (!version) {
    announcedUpdate = undefined;
    return;
  }
  if (announcedUpdate === version) return;
  announcedUpdate = version;
  playCue("updateAvailable");
}

/** Test helper: forget which update cues already fired. */
export function resetSoundCues() {
  announcedUpdate = undefined;
}
