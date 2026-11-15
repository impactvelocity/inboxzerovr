# Inbox Zero VR

[![Play at InboxZeroVR.com](https://img.shields.io/badge/Play-InboxZeroVR.com-ff4d6d?style=for-the-badge)](https://inboxzerovr.com)
[![Meta Quest](https://img.shields.io/badge/Meta_Quest-VR-0467DF?style=for-the-badge&logo=meta&logoColor=white)](https://inboxzerovr.com)
[![Devpost: Meta VR Start Developer Competition 2026](https://img.shields.io/badge/Devpost-Meta_VR_Start_2026-003E54?style=for-the-badge&logo=devpost&logoColor=white)](https://start-developer-competition-26.devpost.com/)

[![WebXR](https://img.shields.io/badge/WebXR-browser_VR-6e44ff)](https://immersiveweb.dev/)
[![Immersive Web SDK](https://img.shields.io/badge/Immersive_Web_SDK-1.1-0467DF?logo=meta&logoColor=white)](https://iwsdk.dev/)
[![three.js](https://img.shields.io/badge/three.js-0.185-black?logo=threedotjs)](https://threejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![MCP server](https://img.shields.io/badge/MCP-server-555?logo=modelcontextprotocol)](vr3/public/agent.md)
[![Built with Claude](https://img.shields.io/badge/Built_with-Claude-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/claude)
[![ElevenLabs](https://img.shields.io/badge/Sound-ElevenLabs-black?logo=elevenlabs)](https://elevenlabs.io/)

![Inbox Zero VR: Slash, Burn and Smash Your Way to Inbox Zero](https://www.inboxzerovr.com/site/devpost/hero.png)

Turn your unread email into a short VR game on the Meta Quest. Slice and smash the newsletters and spam, and reply to the real ones.

**[Play it at InboxZeroVR.com](https://inboxzerovr.com)**: open it in the Quest browser and play with a demo inbox. Nothing to install.

Made for the [Meta VR Start Developer Competition 2026](https://start-developer-competition-26.devpost.com/). Everything in this README is about the game in [`vr3/`](vr3). The other folders are earlier versions and the demo video's tools.

## Why I made it

Email stresses me out. When unread emails pile up, I ignore them, and ignoring them stresses me out even more. I think a lot of people deal with the same thing.

So I wanted to make a productivity app that feels like a game. Something anyone could play every day: load up your latest unread, get through it in a few minutes, and feel like you won.

## How to play

A game has at most 20 emails, so you can finish it in a few minutes. It's built for sitting down. You never have to move around.

![How to play: Round One, grab to read and slash to clear; Round Two, pick a reply or say your own](https://www.inboxzerovr.com/site/devpost/rounds.png)

**Round 1 is sorting.** Close your left hand to grab an email, and it comes closer so you can read it. Throw it to keep it for round two if you want to reply, or close your right fist to make the weapon live and smash the email into tiny little pieces.

**Round 2 is replying.** All the emails you kept come back. Use one of the two pre-written replies (drag and hover to send), or use your mic to say your reply out loud and it's transcribed to text.

Every level ends with a winning celebration and a results screen.

It works with tracked hands or Quest controllers. On a monitor you can try it too: drag or use the arrow keys to look around, X or Space uses the weapon, C keeps the email, Esc goes back to the menu.

## The levels

Each level has its own weapon, art, music and sounds.

![Seven levels, seven weapons](https://www.inboxzerovr.com/site/devpost/levels.png)

| # | Level | Weapon |
| --- | --- | --- |
| 01 | Kyoto Nights | Katana |
| 02 | Keyboard Smash | Keyboard |
| 03 | Haunted Halls | Sword |
| 04 | Toxic Danger | Spray gun |
| 05 | Super Space | Saber |
| 06 | Inferno | Flame thrower |
| 07 | LumberHack | Axe |

## Your inbox comes from your own agent

I first built a way to connect Gmail and do the sorting and summarizing with AI. Then I thought of a simpler way for anyone to use it. Everybody has their favourite agent, and it's already connected to their email. So Inbox Zero VR is an MCP server you give to your agent:

![How the MCP works: your agent, Inbox Zero VR, your Quest, and results back to your agent](https://www.inboxzerovr.com/site/devpost/agent.png)

1. You tell your agent "let's play Inbox Zero". It reads your newest unread emails, summarizes and categorizes them, and writes the pre-written replies.
2. It sends that to Inbox Zero VR, which creates a game under a 4-digit code.
3. The agent gives you the code (or a link), and you type it on the keypad in the headset.
4. When you finish, your agent gets the results (what to archive, what to reply and with what words) and, with your OK, acts on your inbox with its own tools.

The game only gets a JSON of email summaries: sender, subject line, category, a short summary and the reply drafts. It never sees the full email or the real message ids. A game is kept for 24 hours at most, the emails are deleted as soon as you've played, and the results are deleted 10 minutes after your agent reads them.

This way there are no expensive AI calls to sort mail, no email permissions to ask for, and it works with any email provider. It doesn't even have to be email. Your agent can send anything in the right shape, a to-do list or groceries, and you can chop it up.

The instructions agents read are in [`vr3/public/agent.md`](vr3/public/agent.md).

## How it works

`vr3/` is two apps:

- **[`vr3/play/`](vr3/play)** is the game. It runs in the browser with WebXR, built on the [Immersive Web SDK](https://iwsdk.dev/) and [three.js](https://threejs.org/), bundled with Vite.
- **[`vr3/`](vr3)** itself is a Next.js app. It has the front page, serves the game's build at `/play/`, and runs the MCP server and API that hold each game until it's played.

### The levels are paintings

Each level is a painted image that wraps around you, 270° wide. Only the weapon, the emails and the particles are real 3D, which keeps it running well on the Quest. I tried full 3D scenes first and they were too hard to keep smooth.

![One painting wrapped around you: the flat Kyoto painting and the same scene in the headset](https://www.inboxzerovr.com/site/devpost/backdrop.png)

A few tricks make the painting feel like a place:

- **Depth.** Each level has a small model of how far away each part of its painting is (`inverseDepthAt()` in GLSL). Each eye looks up the painting from its own position, so near things separate from far ones in stereo, and leaning your head shifts them.
- **Two lightings.** Every level has a start and an end painting, blended in one shader, so the light changes as you clear your inbox.
- **Things that move.** Flickering lamps, drifting cloud, mist, rain on water, petals, embers, sparks: drawn in the backdrop's shader or as small instanced particles.

The shared stage is [`play/src/levels/backdrop.ts`](vr3/play/src/levels/backdrop.ts). Each level is one entry in [`play/src/levels/index.ts`](vr3/play/src/levels/index.ts) with its paintings, its lights, its email style, its sounds and its weapon.

### Emails you can cut

Emails are drawn as cards onto real meshes ([`play/src/mail/`](vr3/play/src/mail)). When a blade goes through one, [`play/src/cut.ts`](vr3/play/src/cut.ts) cuts the mesh itself along the line of the swing, so the two halves are the real halves, words and all. Hard swings shatter it into more pieces. The spray gun and the flame thrower melt or burn the email instead of cutting it.

### Made for sitting down

You can't step towards an email, so the controls make up for it:

- Swings and strikes have extra tolerance for distance, and each weapon's length helps you reach further.
- You close your right fist to make the weapon live. Otherwise you'd hit every email your hand passes.
- Closing your left fist grabs an email from a distance, and it scales towards you so it's easier to read and to hit.
- A line runs from your left hand to the email, so you can see what you're holding while it floats in front of you.

Hands and controllers each have their own path in [`play/src/controls/`](vr3/play/src/controls), chosen by what you're holding. Hand tracking loses fast movement, so the hand path holds a pose for a moment when tracking drops.

### The server

- **MCP server** at `/mcp` ([`vr3/app/mcp/route.ts`](vr3/app/mcp/route.ts)), with three tools: `create_round`, `get_results` and `cancel_round`. The same is at `/api/rounds` over REST for agents without MCP.
- **Storage** is Upstash Redis ([`vr3/lib/store.ts`](vr3/lib/store.ts)). Every key expires, and the agent's key is stored only as a hash. Wrong codes are rate limited, since 4 digits is easy to guess.
- **The mic** streams to ElevenLabs Scribe through the Vercel AI Gateway. In an agent game, what you said is written up as an email by Claude Haiku when the game finishes. Without a key the game falls back to the browser's own speech recognition.

## How I made it

This was my first VR game, and the first game I've made since the early days of Flash.

I built a few versions before this one. The first used Unity and Blender, and it became too slow: too many assets, and hard to test. Then I made a WebXR version with full 3D scenes, but that was hard to optimize too. The wrap-around painting is what finally worked.

- **Code:** most of it was written with Claude Opus 5.5, with bits of Fable.
- **Art:** the paintings, logos and level cards were designed with GPT Image.
- **Music:** made with Suno.
- **Sound effects:** made with ElevenLabs. Python scripts in [`play/tools/`](vr3/play/tools) cut, loop and level the takes for each level.
- **Spoken replies:** transcribed with ElevenLabs Scribe.

Most of the work was game feel with the hands and weapons. There are 7 weapons and 7 different models, and each one had to sit right in the hand and hit emails in a natural way. To get there I built my own tuning page, [`play/tune.html`](vr3/play/tune.html). It runs on the dev server next to the game in the headset: I pick a level, turn and move its weapon around the fist, and every change shows up in the headset at once while I'm playing. When it feels right, "Save as default" writes the numbers into the game.

## Run it locally

Use Node 24 (`nvm use` in `vr3`).

```bash
cd vr3 && npm install && npm --prefix play install
```

```bash
npm run dev:all
```

That starts the site and API on port 3000 and the game on port 5183. Open http://localhost:5183/. The game passes its `/api` calls through to the site.

To play on a Quest over USB, forward the port and open http://localhost:5183/ in the Quest browser. WebXR needs localhost or HTTPS.

```bash
adb reverse tcp:5183 tcp:5183
```

Settings go in `vr3/.env.local`, and [`vr3/.env.example`](vr3/.env.example) lists them. Every key is optional: with none set, the demo inbox still plays.

To try an agent game from Claude Code against your local server:

```bash
claude mcp add --transport http inboxzero http://localhost:3000/mcp
```

`npm run build` in `vr3` builds the game into `public/play` and then builds the site. It deploys to Vercel with `vr3` as the project root. The music and images are kept out of git, so deploy with `vercel` from a machine that has them.

## More detail

- [`vr3/README.md`](vr3/README.md): the site, agent rounds, the mic and deploying.
- [`vr3/play/README.md`](vr3/play/README.md): the full build log for the game, level by level.
- [`vr3/play/CONTROLS-PLAN.md`](vr3/play/CONTROLS-PLAN.md): hands, then desktop and mobile controls.

## What's next

- Controls for playing in the browser with a mouse and keyboard
- Mobile support, so you can slice and reply with your fingers
- More levels and modes, maybe just a slice and dice mode
