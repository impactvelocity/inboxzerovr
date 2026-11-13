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
import { createFlame } from './flame';
import { createMist } from './spray';
import { createHome } from './home';
import { bindHomeMic, bindSetupMic, dictate } from './dictate';
import { bindMailUi } from './mailui';
import { LEVELS, SHOWN, levelById, shownById, type Level } from './levels';
import { createStage, type RoundProgress } from './levels/backdrop';
import { createHeld, type Weapon } from './weapons/held';
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
$('hud-settings').addEventListener('click',()=>toggleSettings());
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
    xr:{ sessionMode:SessionMode.ImmersiveVR,offer:'none',launchOnSessionGranted:true,features:{handTracking:false} },
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
  const music = new GardenMusic(message => { $('audio-status').textContent = message; });
  $('music').addEventListener('change', e => music.setEnabled((e.target as HTMLInputElement).checked));
  $('volume').addEventListener('input', e => music.setVolume(Number((e.target as HTMLInputElement).value)));
  // Each level's own sound under the music, and the weapon's swing (src/ambience.ts).
  const sounds = new GardenSounds();
  $('sounds').addEventListener('change', e => sounds.setEnabled((e.target as HTMLInputElement).checked));
  $('sounds-volume').addEventListener('input', e => sounds.setVolume(Number((e.target as HTMLInputElement).value)));
  $('effects-volume').addEventListener('input', e => sounds.setEffectsVolume(Number((e.target as HTMLInputElement).value)));
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
    const hello = () => announce({ id: pageId, kind: 'game', level: tweaks.level, vr: world.renderer.xr.isPresenting, headset });
    hello(); setInterval(hello, 3000);
  }
  const made = new Map<string, Played>([['kyoto', { level: LEVELS[0], place: garden, weapon: null }]]);
  let now = made.get('kyoto')!, choosing = 0, playing = false;
  let session: XRSession | null = null;
  const syncSound = () => {
    const heard = playing && (!session || session.visibilityState !== 'hidden');
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
    $('hud-level').textContent = `${level.number} · ${level.name}`;
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
  async function choose(level: Level) {
    home.select(level.id);
    const ticket = ++choosing;
    let next = made.get(level.id);
    if (!next) {
      home.busy(true);
      try {
        const stage = await createStage(level.stage!, world.renderer);
        stage.hear.play = (name, pitch, volume, at) => sounds.play(name, pitch, volume, at);
        stage.group.visible = false; world.createTransformEntity(stage.group);
        next = { level, place: stage, weapon: createHeld(world, level.held!(world.renderer)) };
        made.set(level.id, next);
      } catch (error) { console.error(error); next = undefined; }
      if (ticket === choosing) home.busy(false);
    }
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
   * In a game the level's lighting follows the rounds (asked for on 2026-11-11): its start lighting all
   * through round one; as round one ends and round two's intro begins it starts to fall, and it is
   * fully at its end lighting by the time the ring is full and round two begins. A new day comes back
   * to the start lighting the same way, through round one's intro. (On the home screen the Transition
   * setting still runs it on a timer.)
   */
  let lightFrom = 0, lightPhase = '', lightRound = 0;
  function lightFromRounds() {
    const p = letters.progress as typeof letters.progress & { timer: number };
    // Day to night over the game (2026-11-11): the start lighting as round one begins; halfway to night by the
    // end of round one, a little more with each email dealt with; the other half through round two's intro.
    const want = p.round >= 2 ? 1 : 0;
    if (p.phase === 'intro' && (lightPhase !== 'intro' || lightRound !== p.round)) lightFrom = settings.blend;
    lightPhase = p.phase; lightRound = p.round;
    let blend = settings.blend;
    if (p.phase === 'intro') {
      const t = Math.min(1, Math.max(0, p.timer / (1 + letters.tune.readySeconds)));      // the intro's lead-in, then the ring
      blend = lightFrom + (want - lightFrom) * t * t * (3 - 2 * t);
    } else if (p.phase === 'play' && p.round === 1) {
      const done = p.total > 0 ? Math.min(1, p.marks.length / p.total) : 0;
      blend += (0.5 * done - blend) * 0.02;            // (eased, so each email's step is a slow slide, not a jump)
    } else if (p.phase === 'play' || p.phase === 'summary') blend = want;
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
  /** At the home screen nothing arrives and nothing is heard; playing, the level's title letter comes. */
  function setPlaying(on: boolean) {
    playing = on;
    document.body.classList.toggle('at-home', !on); document.body.classList.toggle('playing', on);
    if (on) { toggleSettings(false); settings.elapsed = 0; settings.blend = 0; settings.playing = true; }
    // A level starts its song from the top, at full volume, as round one's countdown begins (the 'ready' moment and the intro's lead-in first)
    // (a game begins with its level's name said; its sting plays as it is chosen: 2026-11-12)
    // (the song from the first moment, at full volume, with the name said over it: 2026-11-12; it waited for the countdown before)
    if (on) { stopStinger(); music.restart(); home.announce(now.level.id); }
    else stopStinger();
    letters.setActive(on);
    syncSound(); refresh();
  }
  const home = createHome({
    levels: SHOWN,
    pick: level => { playStinger(level.stinger); void choose(level); },
    start: where => { sounds.unlock(); dictate.hold(); if (where === 'vr') world.launchXR(); else { setPlaying(true); $('scene').focus(); } },
    settings: () => toggleSettings(),
  });
  bindSetupMic();      // the mic line and Allow mic on the Setup card (dictate.ts)
  bindHomeMic();       // and Connect mic beside Setup: the mic is only ever asked for here, never in VR
  bindMailUi();        // Enter Code / Just Play: an agent's game code, or the demo (mailui.ts, mail/source.ts)
  $('menu').addEventListener('click', () => setPlaying(false));
  const useWeapon = () => { sounds.unlock(); if (now.weapon) now.weapon.previewSwing(); else sword.previewSwing(); };
  $('swing').addEventListener('click', useWeapon);
  // The menu in VR (letters.showMenu): every level as a card, each with its home-screen picture.
  const menuLevels = () => SHOWN.map(l => ({ id: l.id, name: l.name, accent: l.accent, picture: `home/${l.id === 'office2' ? 'office' : l.id}.webp` }));
  letters.events.on = (kind, at, id) => {
    // Inferno: a letter the jet has touched is alight (the flames stay on it as it drifts), and flares as it burns through
    if (now.level.jet === 'flame') { if (kind === 'cut') flame.ignite(at); else if (kind === 'melt') flame.flare(at); }
    // the game is over (it has faded to black): in a headset, the menu in VR, to choose and play again
    // without taking it off; on a screen, the home screen
    if (kind === 'home') { if (world.renderer.xr.isPresenting) void letters.showMenu(menuLevels(), now.level.id); else setPlaying(false); return; }
    // in the menu: a level's card cut (its name said, then once the view is black the level changes and the
    // menu comes again), START cut (a game begins), EXIT cut (out of VR, to the home screen)
    if (kind === 'pick') { const level = levelById(id ?? null); if (level) { playStinger(level.stinger); void choose(level).then(() => { if (world.renderer.xr.isPresenting) void letters.showMenu(menuLevels(), now.level.id, true); }); } return; }
    if (kind === 'start') { setPlaying(true); return; }
    if (kind === 'exit') { void world.renderer.xr.getSession()?.end(); return; } if (kind === 'arrive') now.place.pulse?.(1); else if (kind === 'melt') now.place.pulse?.(0.9); else if (kind === 'cut') now.place.pulse?.(0.3); now.place.onLetter?.(kind, at); };

  // The sprayer's nozzle and trigger, for the letters and the mist.
  const tool: SprayTool = { origin: new Vector3(), direction: new Vector3(0, 0, -1), on: 0, valid: false };
  const eye = new Vector3();
  class LevelSystem extends createSystem({}) {
    update(delta:number) {
      const dt = document.hidden && !world.renderer.xr.isPresenting ? 0 : Math.min(delta,.25);
      if(playing) lightFromRounds();      // in a game, the light follows the rounds: day in round one, night falls through round two's intro
      else if(settings.playing){settings.elapsed=Math.min(settings.duration,settings.elapsed+dt);settings.blend=settings.elapsed/settings.duration;if(settings.elapsed===settings.duration)settings.playing=false;}
      world.camera.getWorldPosition(eye); garden.viewPosition.copy(eye);
      const pixelRatio = world.renderer.getPixelRatio();
      now.place.update(dt,eye,pixelRatio,blade);
      letters.setBeat(music.pulse());      // the end of a game moves to the music
      letters.setEndSong(music.celebrating());      // and waits for its song to end
      dictate.update(dt, letters.progress.recording);      // the real mic (dictate.ts): its take ends by itself, and stops if the game moves on
      music.setSoft(letters.progress.recording ? (dictate.live ? 0.12 : 0.3) : 1);      // round two's dictation: the song goes soft while it records (softer for a real mic, so it is not heard)
      // the end of a game: a level with a celebration song crossfades into it as the last email is dealt with
      { const p = letters.progress, lastDone = p.phase === 'play' && p.round === 2 && p.total > 0 && p.marks.length >= p.total;
        if (playing && (p.phase === 'summary' || lastDone) && now.level.anthem) music.celebrate(now.level.anthem); else music.endCelebration();
        sounds.setEndSoft(playing && music.celebrating() ? 1 : 0); }      // (the end song is the main thing: the background and game sounds step back under it)
      music.update(dt);
      if (now.weapon) now.weapon.update(dt,this.xrFrame,settings.motion,settings.blend); else sword.update(dt,this.xrFrame,settings.motion,settings.blend);
      blade.update(dt,world.scene);
      sounds.update(dt,settings.blend,settings.wind,world.camera,blade);
      swingFx.update(dt,blade,settings.motion&&letters.armed(),settings.blend,settings.wind,pixelRatio);   // a weapon that is not cutting sheds nothing
      const aim = now.weapon?.aim ?? null;
      if (aim) {
        tool.valid = aim.valid; tool.origin.copy(aim.origin); tool.direction.copy(aim.direction);
        let pull = now.weapon!.pressed();
        const xr = world.renderer.xr.isPresenting ? world.renderer.xr.getSession() : null;
        if (xr) { pull = 0; for (const source of xr.inputSources) if (source.handedness === 'right') pull = source.gamepad?.buttons?.[0]?.value ?? 0; }
        else {
          // on a monitor nobody is aiming: the staged sprayer's mist goes to the letter in front of it
          const target = letters.debug.current();
          if (target) tool.direction.copy(target.body.mesh.position).sub(tool.origin).normalize();
        }
        tool.on = pull;
      }
      letters.update(dt,this.xrFrame,blade,eye,settings.blend,aim?tool:undefined);
      now.place.setGame?.(letters.progress as RoundProgress);      // (its 'menu' phase, the in-VR menu, is none of a level's business: it compares only the others)
      sounds.watchRound(letters.progress);      // a level's sounds for the end of a round (the castle's door slam and witches)
      const live=letters.live();
      {const hit=letters.impact();if(hit>0)now.weapon?.spec.onImpact?.(hit);}      // Knockout: the glove squashes as it lands
      now.weapon?.setLive(live);now.weapon?.spec.onArmed?.(letters.armed());liveBlade.update(dt,now.weapon?0:live,blade);sounds.live(live,blade.speed);
      const fiery=now.level.jet==='flame';
      mist.update(dt,aim&&!fiery?tool:null,pixelRatio);flame.update(dt,aim&&fiery?tool:null,eye);
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
  canvas.addEventListener('pointerdown',e=>{if(world.renderer.xr.isPresenting)return;dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);$('scene').focus();});
  canvas.addEventListener('pointermove',e=>{if(!dragging||world.renderer.xr.isPresenting)return;yaw-=(e.clientX-lastX)*.0025;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-lastY)*.0025));lastX=e.clientX;lastY=e.clientY;look();});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  window.addEventListener('keydown',e=>{
    if((e.target as HTMLElement).matches?.('input,select,button,summary'))return;
    if(e.key.toLowerCase()==='h')toggleSettings();
    if(world.renderer.xr.isPresenting)return;
    if(e.key==='Escape'&&playing)setPlaying(false);
    if(e.key===' '&&playing){e.preventDefault();if(!e.repeat)useWeapon();}
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
  const first = levelById(query.get('level')) ?? shownById(remembered('vr3.level')) ?? LEVELS[0];
  letters.setActive(false);        // the home screen comes first: nothing arrives until Start
  enter(now);
  if (first.id !== 'kyoto') await choose(first); else home.select('kyoto');
  const supported=!!(await navigator.xr?.isSessionSupported('immersive-vr').catch(()=>false));
  home.vr(supported);
  // Native Quest deep links may grant the session during World.create().
  if(world.renderer.xr.isPresenting) startSession();
  else if(query.get('play')==='1') setPlaying(true);            // straight in, for checks
  { const loading=$('loading'); loading.classList.add('gone'); setTimeout(()=>loading.remove(),700); } refresh();      // (the loading screen fades out)
  // Read-only diagnostics for verification and tuning, no per-frame DOM work.
  if (import.meta.env.DEV) Object.assign(window,{__vr3:{world,garden,blade,letters,liveBlade,sounds,made,choose:(id:string)=>choose(levelById(id)??LEVELS[0]),setPlaying,flame,get now(){return now;},
    // run the game forward by hand, for checks where the page gets few animation frames (a hidden or background pane)
    step:(seconds:number,rate=60)=>{let t=performance.now()/1000;for(let i=Math.round(seconds*rate);i>0;i--){t+=1/rate;world.update(1/rate,t);}world.renderer.render(world.scene,world.camera);}}});   // for poking at from the console while developing
  Object.assign(window,{gardenDiagnostics:()=>({level:now.level.id,playing,blend:settings.blend,elapsed:settings.elapsed,duration:settings.duration,depth:settings.depth,motion:settings.motion,quality:settings.quality,calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,textures:world.renderer.info.memory.textures,xr:world.renderer.xr.isPresenting,music:music.diagnostics(),sounds:sounds.diagnostics(),swingFx:swingFx.diagnostics(),letters:letters.diagnostics(),sword:now.weapon?now.weapon.diagnostics():sword.diagnostics(),mist:mist.diagnostics(),dictate:dictate.diagnostics()})});
  import.meta.hot?.dispose(()=>{session?.removeEventListener('select',music.resume);session?.removeEventListener('visibilitychange',syncSound);music.dispose();sounds.dispose();swingFx.dispose();letters.dispose();liveBlade.dispose();mist.dispose();flame.dispose();for(const one of made.values())one.weapon?.dispose();sword.dispose();world.destroy();});
}
main().catch(error=>{console.error(error);const text=document.querySelector('#loading .load-text');if(text){text.textContent='It could not load. Please refresh to try again.';text.classList.add('failed');}document.querySelector('#loading .load-bar')?.remove();});
