/**
 * The home screen's retro UI sounds (2026-11-14: "use elvenlabs to find better UI noises / retro game for the how to play
 * buttton / select ( instead of the in game noises )", "also same for keypad noises and button clicks in ui"). Made by
 * tools/uisounds.py into public/audio/ui. They follow Settings: off with Sounds, as loud as Game sounds.
 */
const VOLUME = { key: 0.4, confirm: 0.5, back: 0.4, finding: 0.5, notfound: 0.45, found: 0.55 } as const;      // (key: the user's own soft UI click since 2026-11-14)
export type UiSound = keyof typeof VOLUME;

const clips = new Map<UiSound, HTMLAudioElement>();
function clip(name: UiSound) {
  let a = clips.get(name);
  if (!a) { a = new Audio(`${import.meta.env.BASE_URL}audio/ui/${name}.flac`); a.preload = 'auto'; clips.set(name, a); }
  return a;
}
for (const name of Object.keys(VOLUME) as UiSound[]) clip(name);      // (fetched at once: they are small)

/** Play one. `pitch` is a playback rate (1 = as made); `volume` scales its own level. */
export function uiSound(name: UiSound, options: { pitch?: number; volume?: number } = {}) {
  const on = document.getElementById('sounds') as HTMLInputElement | null;
  if (on && !on.checked) return;
  const fx = Number((document.getElementById('effects-volume') as HTMLInputElement | null)?.value ?? 1);
  const a = clip(name).cloneNode() as HTMLAudioElement;
  a.volume = Math.max(0, Math.min(1, VOLUME[name] * (options.volume ?? 1) * (Number.isFinite(fx) ? fx : 1)));
  a.preservesPitch = false;
  a.playbackRate = options.pitch ?? 1;
  void a.play().catch(() => { /* not allowed yet, or no sound: nothing to do */ });
}
