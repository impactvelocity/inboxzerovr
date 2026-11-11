import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { InboxSystem } from './inbox-system.js';
import { PanelSystem } from './panel.js';
import { SeatedSystem } from './seated.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(SeatedSystem);
  world.registerSystem(InboxSystem);
  world.registerSystem(PanelSystem);
});
