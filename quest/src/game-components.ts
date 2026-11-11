import { createComponent, Types } from '@iwsdk/core';

/**
 * Lives on the email card. Its fields mirror the session so tools and tests
 * can read the game state from the ECS (the entity-component store).
 */
export const Inbox = createComponent('Inbox', {
  phase: { type: Types.String, default: 'home' },
  card: { type: Types.String, default: 'hidden' },
  weapon: { type: Types.String, default: 'sword' },
  remaining: { type: Types.Int16, default: 0 },
  mistakes: { type: Types.Int16, default: 0 },
  destroyed: { type: Types.Int16, default: 0 },
  kept: { type: Types.Int16, default: 0 },
  replied: { type: Types.Int16, default: 0 },
  dictated: { type: Types.Int16, default: 0 },
  later: { type: Types.Int16, default: 0 },
});

/** A button on the home screen. `action` says what pressing it does. */
export const HomeButton = createComponent('HomeButton', {
  action: { type: Types.String, default: '' },
});
