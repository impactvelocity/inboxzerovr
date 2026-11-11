import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createArenaFloor,
  createHammer,
  createSword,
} from './scene-assets/arena.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'arena-floor': createArenaFloor(),
  // Registered so they can be previewed; the game builds its own instances.
  sword: createSword(),
  hammer: createHammer(),
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
});
