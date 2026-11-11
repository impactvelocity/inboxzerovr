import { SessionController } from './app/SessionController';
import { AudioFeedback } from './audio/AudioFeedback';
import { LaunchScreen } from './dom/launch';
import { DesktopControls } from './input/DesktopControls';
import { browserStore } from './persistence/storage';
import { localDraftStore, localReminderStore } from './persistence/stores';
import { DemoEmailProvider } from './providers/EmailProvider';
import { GameView } from './render/GameView';

async function boot(): Promise<void> {
  // Development only: `?emulate` installs an emulated Quest 3 so the VR paths
  // can be exercised without a headset. It is never part of a production build.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('emulate')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const device = new XRDevice(metaQuest3);
    // Desktop Chrome has a native navigator.xr with no headset behind it; replace it.
    device.installRuntime({ forceInstall: true });
    (window as unknown as Record<string, unknown>).__xrDevice = device;
  }

  const { store, durable } = browserStore();
  const controller = new SessionController({
    store,
    reminders: localReminderStore(store),
    drafts: localDraftStore(store),
    provider: new DemoEmailProvider(),
  });
  const audio = new AudioFeedback();

  let launch: LaunchScreen | null = null;
  const view = new GameView(document.getElementById('app')!, controller, audio, {
    onExitToLaunch: () => launch?.showLaunch(),
    onVRChange: () => launch?.onVRChange(),
  });
  const desktop = new DesktopControls(view.renderer.domElement, controller, view);
  launch = new LaunchScreen(controller, view, audio, desktop, durable);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__inboxzero = { controller, view };
  }
}

void boot();
