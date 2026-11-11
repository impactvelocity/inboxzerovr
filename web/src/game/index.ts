import * as THREE from 'three';
import type { Game, GameContext } from '../api';
import { InboxGame } from './game';
import type { Side } from './hands';
import { tuning } from './tuning';

export { InboxGame } from './game';
export { tuning } from './tuning';

/**
 * The game half of the web build: letters, katana, hands, rounds and sounds, ported from the
 * Unity project's "KYOTO V2" level. Everything it draws goes under `ctx.unity`.
 *
 * For testing from the console, the game is also at `window.__game`:
 *
 *   __game.key('Space' | 'A' | '1' | '2' | 'M' | 'W')   what the keyboard does
 *   __game.start(seed?)                                   start a round (the same seed deals the same emails)
 *   __game.state()                                        phase, card state, counts
 *   __game.tuning                                         every timing and distance, live
 *   __game.fakeHand('left', true, [x, y, z], closed)      stand in for a controller (Unity space); false to stop
 *   __game.game                                           the InboxGame itself
 */
export function createGame(ctx: GameContext): Game {
  const game = new InboxGame(ctx);
  const hooks = {
    game,
    tuning,
    session: game.session,
    key: (name: string) => game.key(name),
    start: (seed?: number) => (seed === undefined ? game.pressHome('start') : game.startRound(seed)),
    state: () => ({
      phase: game.phase,
      card: game.cardNow,
      cardAt: game.cardPosition.toArray(),
      remaining: game.session.remaining,
      streak: game.session.streak,
      mistakes: game.session.mistakes,
      current: game.session.current,
      status: game.status(),
    }),
    fakeHand: (side: Side, tracked: boolean, at: [number, number, number] = [0, 0, 0], closed = false) =>
      game.fakeHand(side, tracked, new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion(), closed),
  };
  (window as unknown as { __game?: typeof hooks }).__game = hooks;
  return game;
}
