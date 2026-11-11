import { Color, NoToneMapping, SessionMode, World, createSystem } from '@iwsdk/core';
import { createGarden, settings } from './garden';
import { createSword } from './sword';
import { GardenMusic } from './audio';
import { GardenSounds } from './ambience';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mood = $<HTMLInputElement>('mood');
const play = $<HTMLButtonElement>('play');
const vr = $<HTMLButtonElement>('vr');
const motion = $<HTMLInputElement>('motion');
const formatTime = (value: number) => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;
motion.checked = settings.motion;
let uiTime = 0;
function refresh() {
  mood.value = String(settings.blend);
  $('phase').textContent = settings.blend < .25 ? 'Dusk' : settings.blend < .8 ? 'Blue hour' : 'Twilight';
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
$('show-ui').addEventListener('click',()=>document.body.classList.remove('hidden-ui'));

async function main() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('emulate') === '1') {
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
  world.scene.background=new Color('#17151e');
  world.renderer.toneMapping=NoToneMapping;
  world.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  world.renderer.shadowMap.enabled=false;
  world.renderer.xr.setFoveation(1);
  world.createTransformEntity(garden.group);
  const sword = createSword(world);
  $('swing').addEventListener('click', sword.previewSwing);
  const music = new GardenMusic(message => { $('audio-status').textContent = message; });
  $('music').addEventListener('change', e => music.setEnabled((e.target as HTMLInputElement).checked));
  $('volume').addEventListener('input', e => music.setVolume(Number((e.target as HTMLInputElement).value)));
  // Nature under the music, and the katana's swing (src/ambience.ts).
  const sounds = new GardenSounds();
  $('sounds').addEventListener('change', e => sounds.setEnabled((e.target as HTMLInputElement).checked));
  $('sounds-volume').addEventListener('input', e => sounds.setVolume(Number((e.target as HTMLInputElement).value)));
  $('swing').addEventListener('click', sounds.unlock);
  class AtmosphereSystem extends createSystem({}) {
    update(delta:number) {
      const dt = document.hidden && !world.renderer.xr.isPresenting ? 0 : Math.min(delta,.25);
      if(settings.playing){settings.elapsed=Math.min(settings.duration,settings.elapsed+dt);settings.blend=settings.elapsed/settings.duration;if(settings.elapsed===settings.duration)settings.playing=false;}
      world.camera.getWorldPosition(garden.viewPosition);
      garden.update(dt,garden.viewPosition,world.renderer.getPixelRatio());
      music.update(dt);
      sword.update(dt,this.xrFrame,settings.motion,settings.blend);
      sounds.update(dt,settings.blend,settings.wind,world.camera,world.scene);
      // No controller meshes or pointer rays in this quiet seated experience.
      world.player.raySpaces.left.visible=false;world.player.raySpaces.right.visible=false;
      for(const side of ['left','right'] as const){const visual=world.input.xr.visualAdapters.controller[side].visual;if(visual)visual.model.visible=false;}
      world.player.gripSpaces.left.visible=false;world.player.gripSpaces.right.visible=false;
      uiTime+=dt;if(uiTime>.15){refresh();uiTime=0;}
    }
  }
  world.registerSystem(AtmosphereSystem);
  let dragging=false,lastX=0,lastY=0,yaw=0,pitch=0;
  const canvas=world.renderer.domElement;
  function look(){world.camera.rotation.set(pitch,yaw,0,'YXZ');}
  canvas.addEventListener('pointerdown',e=>{if(world.renderer.xr.isPresenting)return;dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);$('scene').focus();});
  canvas.addEventListener('pointermove',e=>{if(!dragging||world.renderer.xr.isPresenting)return;yaw-=(e.clientX-lastX)*.0025;pitch=Math.max(-1.2,Math.min(1.2,pitch-(e.clientY-lastY)*.0025));lastX=e.clientX;lastY=e.clientY;look();});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  window.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,select,button,summary'))return;if(e.key.toLowerCase()==='h')document.body.classList.toggle('hidden-ui');if(world.renderer.xr.isPresenting)return;if(e.key.startsWith('Arrow')){e.preventDefault();if(e.key==='ArrowLeft')yaw+=.08;if(e.key==='ArrowRight')yaw-=.08;if(e.key==='ArrowUp')pitch=Math.min(1.2,pitch+.06);if(e.key==='ArrowDown')pitch=Math.max(-1.2,pitch-.06);look();}});
  const supported=await navigator.xr?.isSessionSupported('immersive-vr').catch(()=>false);
  vr.disabled=!supported;vr.textContent=supported?'Enter VR':'VR unavailable';
  if(!supported)$('xr-status').textContent=window.isSecureContext?'Explore here, or open in a WebXR headset browser.':'VR needs HTTPS or localhost. Desktop preview is available here.';
  vr.addEventListener('click',()=>{world.launchXR();});
  let musicSession: XRSession | null = null;
  const syncMusicVisibility = () => { const showing = !!musicSession && musicSession.visibilityState !== 'hidden'; music.setActive(showing); sounds.setActive(showing); };
  const startSession = () => {
    document.body.classList.add('in-vr');garden.recenterDepth();sword.clearTrail();
    musicSession?.removeEventListener('select', music.resume);
    musicSession?.removeEventListener('visibilitychange', syncMusicVisibility);
    musicSession = world.renderer.xr.getSession();
    musicSession?.addEventListener('select', music.resume);
    musicSession?.addEventListener('select', sounds.unlock);
    musicSession?.addEventListener('visibilitychange', syncMusicVisibility);
    syncMusicVisibility();
  };
  world.renderer.xr.addEventListener('sessionstart',startSession);
  world.renderer.xr.addEventListener('sessionend',()=>{
    document.body.classList.remove('in-vr');garden.recenterDepth();sword.clearTrail();
    musicSession?.removeEventListener('select', music.resume);
    musicSession?.removeEventListener('select', sounds.unlock);
    musicSession?.removeEventListener('visibilitychange', syncMusicVisibility);musicSession=null;
    music.setActive(false);sounds.setActive(false);
  });
  // Native Quest deep links may grant the session during World.create().
  if(world.renderer.xr.isPresenting) startSession();
  $('loading').remove();refresh();
  // Read-only diagnostics for verification and tuning, no per-frame DOM work.
  Object.assign(window,{gardenDiagnostics:()=>({blend:settings.blend,elapsed:settings.elapsed,duration:settings.duration,depth:settings.depth,motion:settings.motion,quality:settings.quality,calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,textures:world.renderer.info.memory.textures,xr:world.renderer.xr.isPresenting,music:music.diagnostics(),sounds:sounds.diagnostics(),sword:sword.diagnostics()})});
  import.meta.hot?.dispose(()=>{musicSession?.removeEventListener('select',music.resume);musicSession?.removeEventListener('visibilitychange',syncMusicVisibility);music.dispose();sounds.dispose();sword.dispose();world.destroy();});
}
main().catch(error=>{console.error(error);$('loading').textContent='The garden could not load. Please refresh to try again.';});
