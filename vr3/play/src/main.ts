import { Color, NoToneMapping, SessionMode, Vector3, World, createSystem } from '@iwsdk/core';
import { tweaks, announce } from './tweak';
import { createGarden, settings } from './garden';
import { BLADE_LENGTH, createSword, setSwordHold, swordHold, SWORD_HOLD_DEFAULT } from './sword';
import { GardenMusic } from './audio';
import { GardenSounds } from './ambience';
import { BladeTracker } from './blade';
import { createSwingFx } from './swingfx';
import { createLetters, type SprayTool } from './letters';
import { createLiveBlade } from './liveblade';
import { fist, useControllerHands } from './hands';
import { controls, desktop } from './controls';
import { createDesktopHands } from './controls/desktophands';
import { createFlame } from './flame';
import { createMist } from './spray';
import { createHome, pixelLabel, pixelWords } from './home';
import { bindHomeMic, bindSetupMic, dictate } from './dictate';
import { bindMicDebug } from './micdebug';
import { bindMcpCard } from './mcpcard';
import { bindVideoCard, videoOpen } from './videocard';
import { bindMailUi } from './mailui';
import { mail } from './mail/source';
import { WEAPON_VERB, createHowto } from './howto';
import { bindResults } from './results';
import { LEVELS, SHOWN, levelById, shownById, type Level } from './levels';
import { createStage, type RoundProgress } from './levels/backdrop';
import { createHeld, type Weapon } from './weapons/held';
import { track } from './analytics';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
const STINGER_SECONDS = 5;      // (the longest sting: tools/stingers.py cuts them to it; Kyoto's own hit is 2.3 s)
const STINGER_VOLUME = 0.8;      // the level-select hits: 80%, on their own, not tied to the music slider (the user, 2026-11-12)
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
const mood = $<HTMLInputElement>('mood');
const play = $<HTMLButtonElement>('play');
const motion = $<HTMLInputElement>('motion');
const formatTime = (value: number) => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;
motion.checked = settings.motion;
let uiTime = 0;
/** The level being shown, for the words on the time-of-day slider. */
let shown: Level = LEVELS[0];
function refresh() {
  mood.value = String(settings.blend);
  $('phase').textContent = shown.phases[settings.blend < .25 ? 0 : settings.blend < .8 ? 1 : 2];
  const seconds = Math.floor(settings.elapsed);
  $('progress').textContent = `${formatTime(seconds)} / ${formatTime(settings.duration)}`;
  play.textContent = settings.playing ? 'Pause transition' : settings.elapsed >= settings.duration ? 'Replay transition' : 'Resume transition';
  play.setAttribute('aria-pressed',String(settings.playing));
}
mood.addEventListener('input',()=>{settings.blend=Number(mood.value);settings.elapsed=settings.duration*settings.blend;settings.playing=false;refresh();});
play.addEventListener('click',()=>{if(settings.elapsed>=settings.duration){settings.elapsed=0;settings.blend=0;}settings.playing=!settings.playing;refresh();});
$('restart').addEventListener('click',()=>{settings.elapsed=0;settings.blend=0;settings.playing=true;refresh();});
$('wind').addEventListener('input',e=>{settings.wind=Number((e.target as HTMLInputElement).value);});
motion.addEventListener('change',()=>{settings.motion=motion.checked;});
$('pace').addEventListener('change',e=>{settings.duration=Number((e.target as HTMLSelectElement).value);settings.elapsed=settings.blend*settings.duration;refresh();});
$('depth').addEventListener('input',e=>{settings.depth=Number((e.target as HTMLInputElement).value);});
$('quality').addEventListener('change',e=>{settings.quality=(e.target as HTMLSelectElement).value;});
const toggleSettings = (open?: boolean) => document.body.classList.toggle('settings-open', open);
$('close-settings').addEventListener('click',()=>toggleSettings(false));
// The katana in the hand (Kyoto): where the fist sits under the guard, forward lean, blade length. Set before entering VR.
const swordInputs = { reach: $<HTMLInputElement>('reach'), tilt: $<HTMLInputElement>('lean'), turn: $<HTMLInputElement>('turn'), blade: $<HTMLInputElement>('blade') };
function showSwordHold() {
  for (const key of ['reach','tilt','turn','blade'] as const) swordInputs[key].value = String(swordHold[key]);
  $('turn-value').textContent = `${Math.round(swordHold.turn)}°`;
  $('reach-value').textContent = `${(swordHold.reach*100).toFixed(1)} cm`;
  $('lean-value').textContent = `${Math.round(swordHold.tilt)}°`;
  $('blade-value').textContent = `${Math.round(swordHold.blade*BLADE_LENGTH*100)} cm`;
}
for (const key of ['reach','tilt','turn','blade'] as const) swordInputs[key].addEventListener('input',()=>{setSwordHold({[key]:Number(swordInputs[key].value)});showSwordHold();});
$('sword-reset').addEventListener('click',()=>{setSwordHold(SWORD_HOLD_DEFAULT);showSwordHold();});
showSwordHold();
// Outline hands drawn where the controllers are held, so the grip on the weapon can be seen in VR.
const hands = $<HTMLInputElement>('hands');
hands.checked = remembered('vr3.hold.hands') !== '0';
hands.addEventListener('change',()=>remember('vr3.hold.hands',hands.checked?'1':'0'));

/** Whatever a level is painted on: Kyoto's garden, or one of the others' stages (levels/backdrop.ts). */
interface Place { group: { visible: boolean }; update(dt: number, eye: Vector3, pixelRatio: number, blade?: BladeTracker): void; recenterDepth(): void; pulse?(amount?: number): void; setHot?(level: number): void;
  /** A level with real things in it (levels/backdrop.ts' StageProps): what happened to a letter, and where the rounds are. */
  onLetter?(kind: string, at: Vector3): void; setGame?(progress: RoundProgress): void }
/** A level once it has been made: its place, and its weapon (null: Kyoto's katana, which is sword.ts). */
interface Played { level: Level; place: Place; weapon: Weapon | null }

async function main() {
  if (import.meta.env.DEV && query.get('emulate') === '1') {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const { DevUI } = await import('@iwer/devui');
    const device = new XRDevice(metaQuest3, { stereoEnabled: true });
    device.installRuntime({ forceInstall: true });
    device.position.set(0, 1.6, 0);
    device.installDevUI(DevUI);
    Object.assign(window, { __xrDevice: device });
    import.meta.hot?.dispose(() => { (device.devui as InstanceType<typeof DevUI> | undefined)?.dispose(); device.uninstallRuntime(); });
  }
  const garden = await createGarden();
  const world = await World.create($('scene'),{
    xr:{ sessionMode:SessionMode.ImmersiveVR,offer:'none',launchOnSessionGranted:true,features:{handTracking:{required:false}} },      // (hands as well as controllers since 2026-11-14: src/controls)
    render:{fov:85,near:.05,far:100,camera:{position:[0,1.6,0]}},
    input:{canvasPointerEvents:false},
    features:{locomotion:false,grabbing:false,physics:false,spatialUI:false,sceneUnderstanding:false,environmentRaycast:false},
  });
  const ground = new Color(LEVELS[0].ground);
  world.scene.background=ground;
  world.renderer.toneMapping=NoToneMapping;
  world.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  world.renderer.shadowMap.enabled=false;
  world.renderer.xr.setFoveation(1);
  world.createTransformEntity(garden.group);
  const sword = createSword(world);
  useControllerHands(world);
  controls.lean.tilt = () => fist.tilt();      // (a tracked hand holds the weapon as the drawn fist does, lean and all: src/controls/hand.ts)
  const music = new GardenMusic(message => { $('audio-status').textContent = message; });
  $('music').addEventListener('change', e => music.setEnabled((e.target as HTMLInputElement).checked));
  $('volume').addEventListener('input', e => music.setVolume(Number((e.target as HTMLInputElement).value)));
  // Each level's own sound under the music, and the weapon's swing (src/ambience.ts).
  const sounds = new GardenSounds();
  $('sounds').addEventListener('change', e => sounds.setEnabled((e.target as HTMLInputElement).checked));
  $('sounds-volume').addEventListener('input', e => sounds.setVolume(Number((e.target as HTMLInputElement).value)));
  $('effects-volume').addEventListener('input', e => sounds.setEffectsVolume(Number((e.target as HTMLInputElement).value)));
  // ?mute=1: no music and no sounds from the start, for checks in a test tab (2026-11-15: "mute the tab for now")
  if (new URLSearchParams(location.search).get('mute') === '1') {
    for (const id of ['music', 'sounds']) { const box = $<HTMLInputElement>(id); box.checked = false; box.dispatchEvent(new Event('change')); }
    // and every clip of its own (the voice-overs, the level names, the menu's clicks)
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) { this.muted = true; return play.call(this); };
  }
  // What is in the right hand, as the sounds, the swing's sparks and the letters all see it (src/blade.ts, src/swingfx.ts).
  const blade = new BladeTracker();
  const swingFx = createSwingFx(world);
  sounds.onSwing = strength => { swingFx.burst(strength, blade, settings.motion && letters.armed()); if (letters.armed()) sounds.kiai(strength); };
  sounds.onStinger = () => music.duck(1.0);       // a round's stinger plays on its own until the countdown begins; then the song
  // The game: emails arrive as letters; the right hand's weapon deals with them, the left hand throws them to keep (src/letters.ts).
  const letters = await createLetters(world, sounds, swingFx);
  const liveBlade = createLiveBlade();      // the katana's glow while its trigger is held (src/liveblade.ts)
  const mist = createMist(world);           // the sprayer's (src/spray.ts)
  const flame = createFlame(world);         // the flame thrower's, and the fire on what it lights (src/flame.ts)
  // How to Play in VR before every game from a code, and the demo's first (src/howto.ts): the game waits at its start while it runs.
  const howto = createHowto(world, sounds);
  // (on a screen, a card instead: index.html #browser-intro, and the game waits while it is open)
  const browserIntro = $<HTMLDialogElement>('browser-intro');
  // A phone (a finger, and not a headset, which says so in its name): the demo only, round one, upright. Its home screen is
  // just Just Play: no How to Play, no Enter Code, no mic (2026-11-15: "on mobile should be only play demo - hiding how to
  // play and center code, and mic").
  const phone = desktop.touch && !/OculusBrowser|Quest|Pacific|Pico|Wolvic/i.test(navigator.userAgent);
  document.body.classList.toggle('phone', phone);
  if (phone) dictate.never();      // (and the mic is never asked for, nor opened: dictate.ts)
  if (phone) {
    // no zooming by accident (2026-11-15): iPhone Safari ignores the viewport's user-scalable=no, so its pinch gestures and a
    // second finger's move are stopped here (a double tap is no zoom by the page's touch-action: style.css body.phone)
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  }
  // (a phone is played upright; turned sideways, the game waits for it to come back: index.html #turn-phone)
  const wrongWay = () => desktop.touch && innerWidth > innerHeight;
  letters.setHold(() => howto.running || browserIntro.open || (playing && !world.renderer.xr.isPresenting && wrongWay()));
  $('browser-intro-play').addEventListener('click', () => {
    // a phone: full screen and upright where the browser allows it (Android does; an iPhone keeps its bars)
    if (desktop.touch) { void document.documentElement.requestFullscreen?.().then(() => (screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> }).lock?.('portrait')).catch(() => undefined); }
    browserIntro.close('play');
  });
  // its words in the game's pixel letters, as the home screen's are (home.ts); the controls for a mouse or a finger, and for
  // the level's weapon (a phone, 2026-11-15: "swipes are the weapon, and email touch and press is email grab"; on the
  // sprayer and flame levels a held finger sprays; on a phone the GRAB button grabs)
  browserIntro.querySelectorAll<HTMLElement>('.intro-turn .px-words').forEach(pixelWords);
  document.querySelectorAll<HTMLElement>('#turn-phone .px-words').forEach(pixelWords);
  // the level's word for what its weapon does: How to Play's (Slash, Smash, Chop, Burn), but the lab's sprayer melts
  const cardVerb = () => now.level.id === 'lab' ? 'Melt' : WEAPON_VERB[now.level.id] ?? 'Slash';
  const introWords = () => {
    const accent = now.level.accent; browserIntro.style.setProperty('--accent', accent);
    // (what the level's weapon does, in its own word: 2026-11-15, "make slash dynamic for level - slash, chop, melt, burn")
    const sprays = !!now.weapon?.aim, verb = cardVerb(), keys: [string, string, string][] = desktop.touch
      ? [sprays ? ['Hold', verb, 'Where your finger is'] : ['Swipe', verb, 'Through the emails'], ['Grab button', 'Grab email', 'Let go to save it']]
      : [['Space bar', 'Grab email', 'Let go to save it'], ['Mouse click', 'Activate weapon', 'Hold it down'], ['Mouse', verb, sprays ? 'Aim at the emails' : 'Move through emails']];
    const box = browserIntro.querySelector<HTMLElement>('.intro-keys')!;
    box.style.setProperty('--n', String(keys.length));
    box.replaceChildren(...keys.map(([key, does, more]) => {
      const card = document.createElement('div'); card.className = 'intro-key pixbox';
      card.innerHTML = `<span class="keycap pixbox"><span class="px-words"></span></span><span class="px-words"></span><span class="px-words dim"></span>`;
      const words = card.querySelectorAll<HTMLElement>('.px-words'); [key, does, more].forEach((text, i) => { words[i].textContent = text; pixelWords(words[i]); });
      return card;
    }));
    // ("VR Game" until 2026-11-15, then "Browser Demo": it is a taste, the real game is in the headset)
    pixelLabel($('browser-intro-title'), 'Browser Demo', Math.min(5, Math.floor(innerWidth * 0.88 / (12 * 6) * 4) / 4), accent, 'rgba(0,0,0,.85)');
    // (no wider than the screen: a pixel letter is about six cells across, so a narrow phone gets smaller cells)
    const fit = (text: string) => Math.min(2.5, Math.floor(innerWidth * 0.88 / (text.length * 6) * 4) / 4);
    const sub = desktop.touch ? 'Mobile plays Round 1 only' : 'Desktop plays Round 1 only', quest = 'Play for real on a Meta Quest';
    pixelLabel(browserIntro.querySelector<HTMLElement>('.intro-sub')!, sub, fit(sub), '#ffffff');
    pixelLabel(browserIntro.querySelector<HTMLElement>('.intro-quest')!, quest, fit(quest), accent, 'rgba(0,0,0,.85)');      // (the whole game, both rounds, is the VR one)
    pixelLabel($('browser-intro-play'), 'Play', 2, '#14121a');
    grabButton.style.setProperty('--accent-grab', accent); pixelLabel(grabButton, 'Grab', 3, accent);      // (its word in the level's colour, on dark)
    hintWords();
  };
  browserIntro.addEventListener('cancel', () => { browserIntro.returnValue = 'home'; });      // (Esc: home, as it is in a game)
  const triggerCut = $<HTMLInputElement>('trigger-cut');
  triggerCut.checked = letters.tune.triggerToCut;
  triggerCut.addEventListener('change',()=>{letters.tune.triggerToCut=triggerCut.checked;remember('vr3.hold.triggerCut',triggerCut.checked?'1':'0');});
  window.addEventListener('keydown', sounds.unlock);

  // ---------------------------------------------------------------- levels
  // Kyoto is made at the start. Each other level is made the first time it is chosen and kept;
  // changing level shows one and hides the rest, and tells the letters, the effects and the sound.
  // Weapon tuning (development only, src/tweak.ts and tune.html): this page says now and then which level it is on
  // and whether it is in VR, so the tuning page can show the headset is listening.
  if (import.meta.hot) {
    const pageId = Math.random().toString(36).slice(2, 10), headset = /OculusBrowser|Quest|Pacific|Pico|Wolvic/i.test(navigator.userAgent);
    const hello = () => announce({ id: pageId, kind: 'game', level: tweaks.level, vr: world.renderer.xr.isPresenting, headset, hands: controls.isHand(world.renderer.xr.getSession(), 'right') });
    hello(); setInterval(hello, 3000);
  }
  const made = new Map<string, Played>([['kyoto', { level: LEVELS[0], place: garden, weapon: null }]]);
  let now = made.get('kyoto')!, choosing = 0, playing = false, restoreLook = () => {}, hintWords = () => {};
  let session: XRSession | null = null;
  // Not heard from a tab that is out of sight, nor while a sound picker page (public/spray.html, flame.html) is open:
  // the song kept playing behind them (2026-11-13: "remove background music, its playing somewhere"). In VR the session decides.
  let hushed = false;
  const syncSound = () => {
    const heard = playing && !hushed && (session ? session.visibilityState !== 'hidden' : document.visibilityState !== 'hidden');
    music.setActive(heard && !!now.level.music); sounds.setActive(heard);
  };
  function enter(next: Played) {
    if (next !== now) {
      now.place.group.visible = false; now.weapon?.hide();
      if (!now.weapon) { const katana = world.scene.getObjectByName('Sakura katana — right grip'); if (katana) katana.visible = false; sword.clearTrail(); }
      now = next; now.place.group.visible = true; now.place.recenterDepth();
    }
    const level = shown = now.level;
    tweaks.level = level.id;      // (weapon tuning, development only: src/tweak.ts)
    letters.setTheme(level.letters); swingFx.setStyle(level.fx); sounds.setLevel(level.sound);
    if (level.music) music.setTrack(level.music);
    if (level.anthem) music.prepare(level.anthem);      // (its end song, held in memory from now: see audio.ts)
    blade.use(now.weapon ? now.weapon.hit ?? 'none' : null);
    fist.tilt = now.weapon ? () => now.weapon!.spec.tilt : () => swordHold.tilt;
    settings.elapsed = 0; settings.blend = 0; settings.playing = true;        // every level begins at its start lighting
    ground.set(level.ground);
    document.body.dataset.level = level.id; document.body.style.setProperty('--accent', level.accent);
    $('end-a').textContent = level.ends[0]; $('end-b').textContent = level.ends[1];
    pixelLabel($('hud-level'), level.name, 2, '#ffffff', 'rgba(0,0,0,.85)');      // (the name alone, no number, in the game's pixel letters at the top right: 2026-11-15)
    $('swing').textContent = now.weapon?.aim ? (level.jet === 'flame' ? 'Fire' : 'Spray') : level.letters.mechanic === 'punch' ? 'Throw a punch' : `Swing the ${level.weapon.toLowerCase()}`;
    // How this level's weapon sits in the fist, if it is one that can be changed (set before entering VR; remembered per level).
    const rod = now.weapon?.spec.rod;
    $('weapon-settings').hidden = !rod;
    if (rod && now.weapon) {
      rodDefaults[level.id] ??= { tilt: rod.tilt, turn: rod.turn };
      for (const key of ['tilt', 'turn'] as const) { const saved = parseFloat(remembered(`vr3.rod2.${level.id}.${key}`) ?? ''); if (Number.isFinite(saved)) now.weapon.setRod({ [key]: saved }); }
      showRod();
    }
    remember('vr3.level', level.id);
    syncSound(); refresh();
  }
  const LOAD_TRIES = 4, LOAD_RETRY_MS = 2500;      // (about 8 s in all: the tunnel keeper checks every 3 s)
  async function choose(level: Level) {
    home.select(level.id);
    const ticket = ++choosing;
    let next = made.get(level.id);
    home.busy(!next);      // (a pick of a level already made ends any earlier one's loading: it left Start greyed before)
    // A level's files fetched as it is first picked. On the headset the USB tunnel to the Mac drops now and then
    // (2026-11-14: "sometimes when it goes back to level select, its not letting me select the next level": every
    // fetch was refused and the pick fell back to the level before). The tunnel keeper puts it back within seconds
    // (vr3/scripts/quest-tunnel.mjs), so a failed load tries again a few times before giving up.
    for (let attempt = 0; !next && attempt < LOAD_TRIES && ticket === choosing; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, LOAD_RETRY_MS));
      if (ticket !== choosing) break;
      try {
        const stage = await createStage(level.stage!, world.renderer);
        stage.hear.play = (name, pitch, volume, at) => sounds.play(name, pitch, volume, at);
        const weapon = createHeld(world, level.held!(world.renderer));
        stage.group.visible = false; world.createTransformEntity(stage.group);
        next = { level, place: stage, weapon };
        made.set(level.id, next);
      } catch (error) { console.error(`loading ${level.id} (try ${attempt + 1} of ${LOAD_TRIES})`, error); }
    }
    if (ticket === choosing) home.busy(false);
    if (ticket !== choosing) return;          // another was chosen while this one loaded
    if (next) enter(next); else home.select(now.level.id);
  }
  const rodDefaults: Record<string, { tilt: number; turn: number }> = {};
  const rodInputs = { tilt: $<HTMLInputElement>('weapon-lean'), turn: $<HTMLInputElement>('weapon-turn') };
  function showRod() {
    const rod = now.weapon?.spec.rod; if (!rod) return;
    rodInputs.tilt.value = String(rod.tilt); rodInputs.turn.value = String(rod.turn);
    $('weapon-lean-value').textContent = `${Math.round(rod.tilt)}°`; $('weapon-turn-value').textContent = `${Math.round(rod.turn)}°`;
  }
  for (const key of ['tilt', 'turn'] as const) rodInputs[key].addEventListener('input', () => {
    now.weapon?.setRod({ [key]: Number(rodInputs[key].value) }); remember(`vr3.rod2.${now.level.id}.${key}`, rodInputs[key].value); showRod();
  });
  $('weapon-reset').addEventListener('click', () => {
    const start = rodDefaults[now.level.id]; if (!start || !now.weapon) return;
    now.weapon.setRod(start); for (const key of ['tilt', 'turn'] as const) { try { localStorage.removeItem(`vr3.rod2.${now.level.id}.${key}`); } catch { /* private window */ } }
    showRod();
  });
  /**
   * In a game the level's lighting follows the rounds (asked for on 2026-11-11, numbers 2026-11-13): from its
   * start lighting, 75% of the way to its end lighting through round one, a step for each email dealt with;
   * then the rest quickly as round two's intro begins. A new day comes back to the start lighting through
   * round one's intro. (On the home screen the Transition setting still runs it on a timer.)
   */
  let lightFrom = 0, lightPhase = '', lightRound = 0;
  const ROUND_ONE_NIGHT = 0.75;      // how far to night round one goes, all of it dealt with (75% since 2026-11-13: "make the night transition on round 1 be 75% then last 25% during the round 2 intro start"; it was 65%)
  const ROUND_TWO_NIGHT = 1.2;       // seconds round two's intro takes to bring the rest of the night
  function lightFromRounds() {
    const p = letters.progress as typeof letters.progress & { timer: number };
    // Day to night over the game, every level (2026-11-11; 2026-11-13: "start normal day ... and transition to 65% of the darker
    // version as it plays", "round 2 should be 65% and then quick transition to 100% during the round 2 intro", "depending on how
    // fast they play, so each email done is %"; then 75%): the start lighting as round one begins; 75% of the way to night by the end of
    // round one, a step with each email dealt with (1/total of it); the rest quickly at the start of round two's intro.
    const want = p.round >= 2 ? 1 : 0;
    if (p.phase === 'intro' && (lightPhase !== 'intro' || lightRound !== p.round)) lightFrom = settings.blend;
    lightPhase = p.phase; lightRound = p.round;
    let blend = settings.blend;
    if (p.phase === 'intro') {
      // round one's: back to day over the intro's lead-in and the ring; round two's: to night quickly, in its first moments
      const t = Math.min(1, Math.max(0, p.timer / (p.round >= 2 ? ROUND_TWO_NIGHT : 1 + letters.tune.readySeconds)));
      blend = lightFrom + (want - lightFrom) * t * t * (3 - 2 * t);
    } else if (p.phase === 'play' && p.round === 1) {
      const done = p.total > 0 ? Math.min(1, p.marks.length / p.total) : 0;
      blend += (ROUND_ONE_NIGHT * done - blend) * 0.02;            // (eased, so each email's step is a slow slide, not a jump)
    } else if (p.phase === 'play') blend = want;
    else if (p.phase === 'summary') blend = Math.max(blend, want);      // (a game that ends in round one stays where round one left it)
    settings.blend = blend; settings.elapsed = blend * settings.duration; settings.playing = false;
  }
  /**
   * A level's sting, as it is chosen (on the home screen, or in the menu in VR): about five seconds of fun
   * music ending on a hit, one per level (2026-11-12; its name is said as a game begins). At its own
   * volume (STINGER_VOLUME), whatever the music slider says; in a game (the menu in VR) the song waits under it.
   */
  const stinger = new Audio(); stinger.preload = 'auto';
  function playStinger(url: string | undefined) {
    stopStinger();
    if (!url || !$<HTMLInputElement>('music').checked) return;
    stinger.src = `${import.meta.env.BASE_URL}${url}`; stinger.volume = STINGER_VOLUME;
    void stinger.play().catch(() => undefined);
    if (playing) music.duck(STINGER_SECONDS - 0.4);
    // (a shorter sting lets the song back sooner: Kyoto's hit, 2026-11-12)
    stinger.onloadedmetadata = () => { if (playing && isFinite(stinger.duration) && stinger.duration < STINGER_SECONDS) music.duck(stinger.duration - 0.3, true); };
  }
  function stopStinger() { stinger.pause(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopStinger(); else hushed = false; syncSound(); });
  window.addEventListener('focus', () => { if (hushed) { hushed = false; syncSound(); } });
  try { new BroadcastChannel('vr3-sound-picker').onmessage = () => { hushed = true; stopStinger(); syncSound(); }; } catch { /* no channel: the hidden-tab rule still holds */ }
  /** At the home screen nothing arrives and nothing is heard; playing, the level's title letter comes. */
  function setPlaying(on: boolean) {
    playing = on;
    desktop.reset(); if (!on) restoreLook();      // (nothing held by the mouse; the view as it was for looking round at home: src/controls/desktop.ts)
    document.body.classList.toggle('at-home', !on); document.body.classList.toggle('playing', on);
    results.refresh();      // (back home after a real game: its results)
    if (on) { toggleSettings(false); settings.elapsed = 0; settings.blend = 0; settings.playing = true; }
    // A level starts its song from the top, at full volume, as round one's countdown begins (the 'ready' moment and the intro's lead-in first)
    // (a game begins with its level's name said; its sting plays as it is chosen: 2026-11-12)
    // (the song from the first moment, at full volume, with the name said over it: 2026-11-12; it waited for the countdown before)
    if (on) {
      stopStinger(); music.restart();
      // Before a game from a code (always) or the demo's first, How to Play first (src/howto.ts, 2026-11-14): the level's name
      // waits for it ("after skipping / watching, it starts the level with announcement"), but the song plays from the
      // start under it, softer while the voice talks ("play level music at start of level even when how to play intro", 2026-11-14).
      if (!world.renderer.xr.isPresenting) {
        // On a screen: no How to Play, but a card saying it is round one only and what the keys do (2026-11-15); the level's
        // name once it is closed. Play (or Enter) starts; Esc goes home.
        introWords();
        const go = () => { browserIntro.removeEventListener('close', go); if (playing && browserIntro.returnValue !== 'home') home.announce(now.level.id); else if (playing) setPlaying(false); };
        browserIntro.returnValue = ''; browserIntro.addEventListener('close', go);
        if (!browserIntro.open) browserIntro.showModal();
      } else if (howto.wanted()) {
        const theme = now.level.letters;
        howto.start({ accent: now.level.accent, colours: theme.bar ?? [now.level.accent, now.level.accent], at: theme.dock?.intro ?? theme.intro,
          vr: world.renderer.xr.isPresenting, verb: WEAPON_VERB[now.level.id],
          // skipped, its parts are cut up like emails, or burnt / melted where the level's weapon does that (2026-11-14)
          breakApart: (parts, at, along, push) => letters.breakApart(parts, at, along, push, now.level.id === 'inferno' || now.level.id === 'lab' ? 'burn' : 'cut'),
          done: () => { if (playing) home.announce(now.level.id); } });
      } else home.announce(now.level.id);
    }
    else { stopStinger(); howto.stop(); if (browserIntro.open) browserIntro.close('home'); }
    letters.setActive(on);
    syncSound(); refresh();
  }
  // A level chosen, to PostHog: on the home screen (a click or the arrow keys), from the menu in VR, or opened by a link (?level=)
  const trackPick = (level: Level, from: 'home' | 'vr_menu' | 'link') =>
    track('level_selected', { level: level.id, level_name: level.name, level_number: level.number, from, previous: now.level.id, in_vr: world.renderer.xr.isPresenting });
  const home = createHome({
    levels: SHOWN,
    pick: level => { playStinger(level.stinger); trackPick(level, 'home'); void choose(level); },
    start: where => {
      sounds.unlock();
      const go = () => { dictate.hold(); if (where === 'vr') world.launchXR(); else { setPlaying(true); $('scene').focus(); } };
      // the mic asked for here on the home page, never in VR (asking there takes the player out): then in
      if (dictate.unasked && !phone) void dictate.ask().then(go); else go();      // (a phone plays round one only: no mic to ask for)
    },
    settings: () => toggleSettings(),
  });
  bindSetupMic();      // the mic line and Allow mic on the Setup card (dictate.ts)
  bindHomeMic();       // and Connect mic beside Setup: the mic is only ever asked for here, never in VR
  bindVideoCard();     // Video beside the mic: the demo video in a card, to watch on the Quest (videocard.ts)
  bindMcpCard();       // MCP by the hackathon badge: the address an AI agent makes a round from (mcpcard.ts)
  bindMicDebug();      // and Debug Mic beside it: a real take on the home page, saying what works and what doesn't (micdebug.ts)
  // (and on the first click anywhere on the home page, so round two hears real words in the demo too: 2026-11-13)
  { const home = $('home') ?? document.body; const first = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.('#start, #just-play')) return; home.removeEventListener('pointerdown', first, true); if (dictate.unasked && !world.renderer.xr.isPresenting && !phone) void dictate.ask(); }; home.addEventListener('pointerdown', first, true); }
  bindMailUi();        // Enter Code / Just Play: an agent's game code, or the demo (mailui.ts, mail/source.ts)
  if (phone) pixelLabel($('just-play'), 'Just Play', 3, '#14121a');      // (a phone: the one button, in the level's colour like Enter Code's)
  document.querySelectorAll<HTMLElement>('.phone-note .px-words').forEach(pixelWords);      // (and under it, the real game is in VR)
  // A real game is ready (a code is in): its How to Play hands are fetched and made now, so they are there in VR.
  { const ready = () => { if (mail.roundReady()) void howto.prepare(); }; mail.listen(ready); ready(); }      // (the hands fetched as a code is found; the demo's first fetches them as it starts)
  // After a real game, its results instead of the level select (src/results.ts); Play Again shows How to Play again.
  const results = bindResults();
  $('menu').addEventListener('click', () => setPlaying(false));
  pixelLabel($('menu'), 'Menu', 2, '#ffffff');      // (a pixel button, as the home screen's are)
  const useWeapon = () => { sounds.unlock(); if (now.weapon) now.weapon.previewSwing(); else sword.previewSwing(); };
  $('swing').addEventListener('click', useWeapon);
  // The menu in VR (letters.showMenu): every level as a card, each with its home-screen picture.
  const menuLevels = () => SHOWN.map(l => ({ id: l.id, name: l.name, accent: l.accent, picture: `home/${l.id === 'office2' ? 'office' : l.id}.webp` }));
  letters.events.on = (kind, at, id) => {
    // Inferno: a letter the jet has touched is alight (the flames stay on it as it drifts), and flares as it burns through
    if (now.level.jet === 'flame') { if (kind === 'cut') flame.ignite(at); else if (kind === 'melt') flame.flare(at); }
    // the game is over (it has faded to black): in a headset, the menu in VR, to choose and play again
    // without taking it off; on a screen, the home screen
    // the end over and black: out of VR, to the home screen (2026-11-13: "after a round, and it fades to black, exit the vr mode back to home
    // screen"; until then it opened the menu inside VR, letters.showMenu, still there for the Menu button). Leaving VR comes home: 'sessionend'.
    if (kind === 'home') { const xr = world.renderer.xr.getSession(); if (world.renderer.xr.isPresenting && xr) void xr.end().catch(() => setPlaying(false)); else setPlaying(false); return; }
    // in the menu: a level's card cut (its name said, then once the view is black the level changes and the
    // menu comes again), START cut (a game begins), EXIT cut (out of VR, to the home screen)
    if (kind === 'pick') { const level = levelById(id ?? null); if (level) { playStinger(level.stinger); trackPick(level, 'vr_menu'); void choose(level).then(() => { if (world.renderer.xr.isPresenting) void letters.showMenu(menuLevels(), now.level.id, true); }); } return; }
    if (kind === 'start') { setPlaying(true); return; }
    if (kind === 'exit') { void world.renderer.xr.getSession()?.end(); return; } if (kind === 'arrive') now.place.pulse?.(1); else if (kind === 'melt') now.place.pulse?.(0.9); else if (kind === 'cut') now.place.pulse?.(0.3); now.place.onLetter?.(kind, at); };

  // The sprayer's nozzle and trigger, for the letters and the mist.
  const tool: SprayTool = { origin: new Vector3(), direction: new Vector3(0, 0, -1), on: 0, valid: false };
  const eye = new Vector3();
  const deskHands = createDesktopHands(world);      // (the outline hands on a monitor: src/controls/desktophands.ts)
  // the GRAB button (a phone, every level): held, the email in front is grabbed; let go, it is thrown for later (2026-11-15)
  const grabButton = $<HTMLButtonElement>('grab-button'), grabAt = new Vector3();
  pixelLabel(grabButton, 'Grab', 3, '#f6b3cc');
  grabButton.addEventListener('pointerdown', e => { e.preventDefault(); desktop.setGrab(true); grabButton.classList.add('pressed'); try { grabButton.setPointerCapture(e.pointerId); } catch { /* (no capture: let go still lets go) */ } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) grabButton.addEventListener(type, () => { desktop.setGrab(false); grabButton.classList.remove('pressed'); });
  grabButton.addEventListener('contextmenu', e => e.preventDefault());
  // a mouse or a finger on Inferno: how far along the jet the email in front is, if the jet is on it, so the flames end there (flame.ts)
  const flameTo = new Vector3();
  const flameStop = () => {
    const now = letters.debug.current(); if (!now || !tool.valid) return 0;
    const to = flameTo.copy(now.body.mesh.position).sub(tool.origin), along = to.dot(tool.direction);
    if (along <= 0.1) return 0;
    const off = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
    return off < 0.35 * now.body.size + 0.05 ? along : 0;
  };
  const reticle = document.createElement('div'); reticle.id = 'reticle'; reticle.hidden = true; document.body.append(reticle);      // (where a mouse aims: src/controls/desktop.ts)
  class LevelSystem extends createSystem({}) {
    update(delta:number) {
      const dt = document.hidden && !world.renderer.xr.isPresenting ? 0 : Math.min(delta,.25);
      // tracked hands are read once, here, before anything asks after them (src/controls/hand.ts); controllers are read as asked
      if (world.renderer.xr.isPresenting) controls.update(world.renderer.xr.getSession(), this.xrFrame, world.renderer.xr.getReferenceSpace(), performance.now() / 1000);
      if(playing) lightFromRounds();      // in a game, the light follows the rounds: day in round one, night falls through round two's intro
      else if(settings.playing){settings.elapsed=Math.min(settings.duration,settings.elapsed+dt);settings.blend=settings.elapsed/settings.duration;if(settings.elapsed===settings.duration)settings.playing=false;}
      desktop.active = playing && desktop.enabled && !world.renderer.xr.isPresenting;
      desktop.sprays = !!now.weapon?.aim;
      { const touch = desktop.active && desktop.touch, ready = !wrongWay();
        document.body.classList.toggle('touch-play', touch); document.body.classList.toggle('wrong-way', touch && !ready);
        grabButton.hidden = !(touch && letters.progress.phase !== 'summary');      // (from the start, so it is seen before the first email; not at the end: 2026-11-15, "show grab button on intro so they can see it, just hide from end")
        $<HTMLButtonElement>('browser-intro-play').disabled = desktop.touch && !ready; browserIntro.classList.toggle('wrong-way', desktop.touch && !ready); }
      if (desktop.active) {
        // a mouse: the view is held head on, the seated view, and never moves ("dont move head, its bad experience",
        // 2026-11-15); the weapon aims out to the letter's distance
        desktop.update(dt); world.camera.rotation.set(0, 0, 0, 'YXZ');
        const target = letters.debug.current(); world.camera.getWorldPosition(eye);
        desktop.depthWanted = target ? Math.max(0.6, Math.min(2.5, target.body.mesh.position.distanceTo(eye))) : 1.5;
      }
      // the cursor, drawn as a ring (the system's is hidden over the game)
      reticle.hidden = !desktop.active || desktop.touch;      // (a finger is its own pointer) if (desktop.active) { const at = desktop.cursor; reticle.style.transform = `translate(${(at.x * 0.5 + 0.5) * innerWidth}px,${(0.5 - at.y * 0.5) * innerHeight}px)`; reticle.className = desktop.live() ? 'swing' : desktop.grab ? 'grab' : ''; }
      document.body.classList.toggle('mouse-play', desktop.active);
      world.camera.getWorldPosition(eye); garden.viewPosition.copy(eye);
      const pixelRatio = world.renderer.getPixelRatio();
      now.place.update(dt,eye,pixelRatio,blade);
      letters.setBeat(music.pulse());      // the end of a game moves to the music
      letters.setEndSong(music.celebrating(), music.celebrationProgress(), music.celebrationTime());      // and waits for its song to end, going dark with it
      dictate.update(dt, letters.progress.recording);      // the real mic (dictate.ts): its take ends by itself, and stops if the game moves on
      music.setSoft(videoOpen() ? 0 : letters.progress.recording || dictate.debugging ? (dictate.live ? 0.12 : 0.3) : howto.running ? 0.5 : 1);      // (softer under How to Play's voice)
      sounds.setRecordSoft(letters.progress.recording ? (dictate.live ? 1 : 0.75) : howto.running ? 0.55 : 0);      // (How to Play's voice over the level's sounds too)      // (and the level's background steps back too: 2026-11-13)      // round two's dictation: the song goes soft while it records (softer for a real mic, so it is not heard)
      // the end of a game: a level with a celebration song crossfades into it as the last email is dealt with
      { const p = letters.progress, lastDone = p.phase === 'play' && p.round === 2 && p.total > 0 && p.marks.length >= p.total;
        if (playing && (p.phase === 'summary' || lastDone) && now.level.anthem) music.celebrate(now.level.anthem); else music.endCelebration();
        sounds.setEndSoft(playing && music.celebrating() ? 1 : 0); }      // (the end song is the main thing: the background and game sounds step back under it)
      music.update(dt);
      if (now.weapon) now.weapon.update(dt,this.xrFrame,settings.motion,settings.blend); else sword.update(dt,this.xrFrame,settings.motion,settings.blend);
      blade.update(dt,world.scene);
      deskHands.update(dt,hands.checked,!now.weapon?.spec.hidesHand,fist.tilt());
      if (desktop.active && desktop.touch) {
        // a phone: the left hand is the GRAB button, so the thread to a held email runs from just behind it (2026-11-15: "when
        // grab activated in mobile draw the line from button to email, to show that connection")
        const box = grabButton.getBoundingClientRect(), view = world.renderer.domElement.getBoundingClientRect();
        if (box.width > 0 && view.width > 0) {
          world.camera.getWorldPosition(eye);
          grabAt.set(((box.left + box.width / 2 - view.left) / view.width) * 2 - 1, 1 - ((box.top + box.height / 2 - view.top) / view.height) * 2, 0.5).unproject(world.camera).sub(eye).normalize();
          desktop.handAt.copy(eye).addScaledVector(grabAt, 0.45); desktop.handAtSet = true;
        }
      }
      sounds.update(dt,settings.blend,settings.wind,world.camera,blade);
      swingFx.update(dt,blade,settings.motion&&letters.armed(),settings.blend,settings.wind,pixelRatio);   // a weapon that is not cutting sheds nothing
      const aim = now.weapon?.aim ?? null;
      if (aim) {
        tool.valid = aim.valid; tool.origin.copy(aim.origin); tool.direction.copy(aim.direction);
        let pull = now.weapon!.pressed();
        const xr = world.renderer.xr.isPresenting ? world.renderer.xr.getSession() : null;
        if (xr) pull = controls.trigger(xr, 'right');      // (src/controls)
        else if (desktop.active && desktop.swing) pull = 1;      // (a mouse: held, it sprays along the nozzle, which the cursor aims: src/controls/desktop.ts)
        else {
          // on a monitor nobody is aiming: the staged sprayer's mist goes to the letter in front of it
          const target = letters.debug.current();
          if (target) tool.direction.copy(target.body.mesh.position).sub(tool.origin).normalize();
        }
        tool.on = pull;
      }
      // (a phone turned sideways: everything waits, the letter in front too, until it is upright again: index.html #turn-phone)
      letters.update(playing && !world.renderer.xr.isPresenting && wrongWay() ? 0 : dt,this.xrFrame,blade,eye,settings.blend,aim?tool:undefined);
      howto.update(dt,eye,letters.armed()?blade:null,aim?tool:null);      // (How to Play before a real game: a swing through it skips it, only with the weapon live: 2026-11-15, "only breaks / slash apart if weapon is active")
      now.place.setGame?.(letters.progress as RoundProgress);      // (its 'menu' phase, the in-VR menu, is none of a level's business: it compares only the others)
      sounds.watchRound(letters.progress);      // a level's sounds for the end of a round (the castle's door slam and witches)
      const live=letters.live();
      {const hit=letters.impact();if(hit>0)now.weapon?.spec.onImpact?.(hit);}      // Knockout: the glove squashes as it lands
      now.weapon?.setLive(live);now.weapon?.spec.onArmed?.(letters.armed());liveBlade.update(dt,now.weapon?0:live,blade);sounds.live(live,blade.speed);
      const fiery=now.level.jet==='flame';
      mist.update(dt,aim&&!fiery?tool:null,pixelRatio);flame.update(dt,aim&&fiery?tool:null,eye,fiery&&desktop.active?flameStop():0);
      const hot=fiery?Math.max(letters.hazard(),tool.valid&&tool.on>.25?.85:0):letters.hazard();now.place.setHot?.(hot);sounds.setHot(hot);      // (Inferno: the room is lit by your own fire, too)
      // No controller meshes or pointer rays in this quiet seated experience; outline hands if asked for.
      world.player.raySpaces.left.visible=false;world.player.raySpaces.right.visible=false;
      for(const side of ['left','right'] as const){const visual=world.input.xr.visualAdapters.controller[side].visual;if(visual)visual.model.visible=hands.checked&&!(side==='right'&&now.weapon?.spec.hidesHand);}      // (a glove is worn over the fist: no outline hand inside it)
      world.player.gripSpaces.left.visible=false;world.player.gripSpaces.right.visible=false;
      uiTime+=dt;if(uiTime>.15){refresh();uiTime=0;}
    }
  }
  world.registerSystem(LevelSystem);
  let dragging=false,lastX=0,lastY=0,yaw=0,pitch=0;
  const canvas=world.renderer.domElement;
  function look(){world.camera.rotation.set(pitch,yaw,0,'YXZ');}
  restoreLook=look;
  desktop.attach(canvas,()=>playing&&!world.renderer.xr.isPresenting);      // (a mouse while playing: src/controls/desktop.ts)
  { const hint=$('hint'),mouse=hintWords=()=>{hint.textContent=desktop.touch?(now.weapon?.aim?`Hold to ${cardVerb().toLowerCase()} · Hold KEEP to grab the email, let go to save it for later`:`Swipe to ${cardVerb().toLowerCase()} · Touch and hold an email to grab it, let go to save it for later`):desktop.enabled?`Hold left click to ${cardVerb().toLowerCase()} · Hold Space to grab, let go to save it for later · Esc: menu`:'Drag to look around · X or Space: use your weapon · C: keep · round two: 1 and 2 reply, M mic · Esc: menu';};mouse();canvas.addEventListener('pointerdown',mouse); }
  canvas.addEventListener('pointerdown',e=>{if(world.renderer.xr.isPresenting||playing)return;      // (playing on a screen, the mouse or a finger is the weapon and hand: src/controls/desktop.ts)
    dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);$('scene').focus();});
  canvas.addEventListener('pointermove',e=>{if(!dragging||world.renderer.xr.isPresenting)return;yaw-=(e.clientX-lastX)*.0025;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-lastY)*.0025));lastX=e.clientX;lastY=e.clientY;look();});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  window.addEventListener('keydown',e=>{
    if((e.target as HTMLElement).matches?.('input,select,button,summary'))return;
    if(e.key.toLowerCase()==='h'&&!playing)toggleSettings();      // (no Settings while playing: 2026-11-15)
    if(world.renderer.xr.isPresenting)return;
    if(e.key==='Escape'&&playing)setPlaying(false);
    if(howto.running&&(e.key.toLowerCase()==='x'||e.key===' '||e.key==='Enter')){e.preventDefault();howto.skip();return;}      // (How to Play: skip it)
    if(e.key===' '&&playing&&!desktop.enabled){e.preventDefault();if(!e.repeat)useWeapon();}      // (with a mouse, Space is the left hand: src/controls/desktop.ts)
    if(e.key.startsWith('Arrow')){e.preventDefault();if(e.key==='ArrowLeft')yaw+=.08;if(e.key==='ArrowRight')yaw-=.08;if(e.key==='ArrowUp')pitch=Math.min(1.2,pitch+.06);if(e.key==='ArrowDown')pitch=Math.max(-1.2,pitch-.06);look();}
  });
  const startSession = () => {
    document.body.classList.add('in-vr');now.place.recenterDepth();sword.clearTrail();now.weapon?.clearTrail();
    session?.removeEventListener('select', music.resume);
    session?.removeEventListener('visibilitychange', syncSound);
    session = world.renderer.xr.getSession();
    session?.addEventListener('select', music.resume);
    session?.addEventListener('select', sounds.unlock);
    session?.addEventListener('visibilitychange', syncSound);
    setPlaying(true);
  };
  world.renderer.xr.addEventListener('sessionstart',startSession);
  world.renderer.xr.addEventListener('sessionend',()=>{
    document.body.classList.remove('in-vr');now.place.recenterDepth();sword.clearTrail();now.weapon?.clearTrail();
    session?.removeEventListener('select', music.resume);
    session?.removeEventListener('select', sounds.unlock);
    session?.removeEventListener('visibilitychange', syncSound);session=null;
    setPlaying(false);       // back to the home screen, to choose again
  });
  // The level to open on: the address bar's (?level=castle, a hidden one too), else the one last played if it
  // is still shown (v1's opens v2), else Kyoto.
  const first = levelById(query.get('level')) ?? shownById(query.get('level')) ?? shownById(remembered('vr3.level')) ?? LEVELS[0];      // (shownById: an old ?level=office opens Keyboard Smash)
  letters.setActive(false);        // the home screen comes first: nothing arrives until Start
  enter(now);
  if (query.get('level') && first.id === (levelById(query.get('level')) ?? shownById(query.get('level')))?.id) trackPick(first, 'link');
  if (first.id !== 'kyoto') await choose(first); else home.select('kyoto');
  const supported=!!(await navigator.xr?.isSessionSupported('immersive-vr').catch(()=>false));
  // (a phone: Android Chrome says it can do VR, but a phone plays on its screen: CONTROLS-PLAN.md step 3)
  home.vr(supported && !phone);
  // Native Quest deep links may grant the session during World.create().
  if(world.renderer.xr.isPresenting) startSession();
  else if(query.get('play')==='1') setPlaying(true);            // straight in, for checks
  { const loading=$('loading'); loading.classList.add('gone'); setTimeout(()=>loading.remove(),700); } refresh();      // (the loading screen fades out)
  // Read-only diagnostics for verification and tuning, no per-frame DOM work.
  if (import.meta.env.DEV) Object.assign(window,{__vr3:{world,garden,blade,letters,desktop,liveBlade,sounds,made,howto,mail,choose:(id:string)=>choose(levelById(id)??LEVELS[0]),setPlaying,flame,get now(){return now;},
    // run the game forward by hand, for checks where the page gets few animation frames (a hidden or background pane)
    step:(seconds:number,rate=60)=>{let t=performance.now()/1000;for(let i=Math.round(seconds*rate);i>0;i--){t+=1/rate;world.update(1/rate,t);}world.renderer.render(world.scene,world.camera);}}});   // for poking at from the console while developing
  Object.assign(window,{gardenDiagnostics:()=>({level:now.level.id,playing,blend:settings.blend,elapsed:settings.elapsed,duration:settings.duration,depth:settings.depth,motion:settings.motion,quality:settings.quality,calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,textures:world.renderer.info.memory.textures,xr:world.renderer.xr.isPresenting,music:music.diagnostics(),sounds:sounds.diagnostics(),swingFx:swingFx.diagnostics(),letters:letters.diagnostics(),sword:now.weapon?now.weapon.diagnostics():sword.diagnostics(),mist:mist.diagnostics(),dictate:dictate.diagnostics()})});
  import.meta.hot?.dispose(()=>{session?.removeEventListener('select',music.resume);session?.removeEventListener('visibilitychange',syncSound);music.dispose();sounds.dispose();swingFx.dispose();letters.dispose();liveBlade.dispose();mist.dispose();flame.dispose();for(const one of made.values())one.weapon?.dispose();sword.dispose();world.destroy();});
}
main().catch(error=>{console.error(error);const text=document.querySelector('#loading .load-text');if(text){text.textContent='It could not load. Please refresh to try again.';text.classList.add('failed');}document.querySelector('#loading .load-bar')?.remove();});
