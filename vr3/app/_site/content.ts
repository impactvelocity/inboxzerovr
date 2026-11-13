/**
 * What the front page says: links, the levels, and the words that are most likely to be changed.
 * The levels repeat a little of play/src/levels/index.ts (name and colour): that file
 * pulls in three.js and the game's own code, so the site keeps its own short list. Art is the
 * game's own, served from its build at /play/.
 */
export const SITE = {
  /** The demo video's YouTube id (the part after v=). Empty: the player shows "coming soon". */
  demoVideo: '',
  competition: { name: 'Meta VR Start Developer Competition 2026', url: 'https://start-developer-competition-26.devpost.com/' },
  segments: 'https://developers.meta.com/vr/blog/know-your-players-understanding-your-audience-with-2025-quest-gamer-segments/',
  author: { name: 'Dylan Jones', url: 'https://hidylanjones.com', linkedin: 'https://www.linkedin.com/in/hidylanjones', avatar: '/site/dylan.webp' },
  github: 'https://github.com/impactvelocity/inboxzerovr',
  /** What it was made with, in the footer. */
  tools: [
    { name: 'Immersive Web SDK', url: 'https://iwsdk.dev/' },
    { name: 'three.js', url: 'https://threejs.org/' },
    { name: 'Next.js', url: 'https://nextjs.org/' },
    { name: 'AI SDK + AI Gateway', url: 'https://ai-sdk.dev/' },
    { name: 'Claude', url: 'https://www.anthropic.com/claude' },
    { name: 'ElevenLabs', url: 'https://elevenlabs.io/' },
  ],
};

export interface SiteLevel {
  id: string; name: string; accent: string;
  /** How the headline ends while this level is showing: "Clear your inbox with …". */
  hero: string;
  /** A few fun lines about it, beside its scene. */
  story: string;
}

export const LEVELS: SiteLevel[] = [
  { id: 'kyoto', name: 'Kyoto Nights', hero: 'a katana', accent: '#f6b3cc',
    story: 'It has just stopped raining in the courtyard. Letters drift in over the pond, you draw a katana, and the spam leaves in a cloud of cherry blossom.' },
  { id: 'office', name: 'Keyboard Smash', hero: 'a keyboard', accent: '#7dffc9',
    story: 'The office CRT will not stop receiving, and somebody has replied all again. Pick up the beige keyboard and hit the email with it, and the monitor takes the beating too.' },
  { id: 'castle', name: 'The Haunted Hall', hero: 'a sword', accent: '#b79cff',
    story: 'Royal dispatches float down a candlelit corridor in haunted picture frames. Most of them are bills. You have a knight’s sword and no patience.' },
  { id: 'lab', name: 'Toxic Danger', hero: 'a spray gun', accent: '#8dff6a',
    story: 'Something in the containment chamber keeps sending mail, and the junk is radioactive. One squirt from the spray gun and it froths over, melts and drips away.' },
  { id: 'space', name: 'Super Space', hero: 'a saber', accent: '#35e8ff',
    story: 'You are at warp, the stars are streaks, and the transmissions keep coming. Light the saber and cut them out of the sky.' },
  { id: 'inferno', name: 'Inferno', hero: 'a flamethrower', accent: '#ff8a3d',
    story: 'Mail drops down a chute into a furnace hall. You are holding a flame thrower. Junk mail turns out to be highly flammable.' },
  { id: 'lumber', name: 'LumberHack', hero: 'an axe', accent: '#ffc440',
    story: 'Golden hour in a timber yard. The post flies out of the barn’s hatch, and you split it with an axe while the leaves come down.' },
];

/** The card types the sorting model chooses from, in the game's own colours (play/src/mail/emails.ts). */
export const CATEGORIES: [string, string][] = [
  ['Work', '#4aa8ff'], ['Personal', '#ff6ec7'], ['Newsletter', '#b388ff'], ['Spam', '#ff4d6d'], ['Promo', '#ffa24a'], ['Receipt', '#5eead4'],
  ['Bill', '#ffd24a'], ['Tracking', '#a3e635'], ['Social', '#c084fc'], ['Calendar', '#7dd3fc'], ['Alert', '#ff8a4a'],
];
