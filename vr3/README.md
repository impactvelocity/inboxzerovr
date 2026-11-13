# VR3: Inbox Zero, the site and the game

Since 2026-11-12 this folder is two apps:

- **`play/`**: the game (IWSDK + three.js, built with Vite). Everything about it is in [play/README.md](play/README.md).
- **the root**: a Next.js app. It has the front page at `/`, serves the game's build at `/play/`, and runs the API the game calls for real email, replies and the mic.

Everyone can play the demo inbox. To play their own mail, a player asks their own AI agent to set up a game: the agent reads their inbox and sends us summaries, and the game never connects to a mailbox ("Agent rounds" below). Gmail sign-in and the models that sorted mail and wrote replies were taken out on 2026-11-13; the one model left writes up what is said into the mic.

## Run

Use Node 24 (`nvm use`). Install both apps once: `npm install`, then `npm --prefix play install`.

| | |
| --- | --- |
| `npm run dev:all` | Starts the site and API on :3000 and the game on :5183. Open the game at http://localhost:5183/. Its `/api` calls go through to Next, so the game and the API share one origin and one sign-in cookie. |
| `npm run dev` | The site and API only, on :3000. |
| `npm --prefix play run dev` | The game only. The demo works; the mic falls back to the browser's speech recognition. |
| `npm run build` | Builds the game, copies it to `public/play`, and builds the site. `npm start` serves the result on :3000 (the game is at `/play/`). |

Settings go in `.env.local`; [.env.example](.env.example) lists them all. Every key is optional: with none set, the site still serves the game and its demo.

## The front page

`app/page.tsx` is the site at `/`: the hero, the demo video, how it works, the AI parts, why it exists, a section per level, and a footer about the competition. Its styles are `app/globals.css`.

- **Words and links** that are likely to change are in `app/_site/content.ts`: the demo video's YouTube id (`demoVideo`; empty shows "coming soon"), the competition and author links, the tools in the footer, and each level's name, weapon and blurb. A new level in the game needs a line there too.
- **In a headset** the hero is the short version with one PLAY GAME button. The page decides from the browser's user agent (Quest, Pico, Wolvic). Add `?vr=1` or `?vr=0` to see either one on a desk.
- **With `?access=<code>`** the hero says judge access is on, and every play link carries the code to the game, where it turns on the mic in the demo.
- **The hands** in the controls part are the user's PNGs in `public/site/hands/`: `left-grab`, `left-read`, `left-throw` and `right-destroy` (which shows the slash and the cut together). They were made from the briefs in `design/site-hands-v1/prompts.md`. `right-slash.png` is there too but not shown: its background did not come out transparent. A tile shows a pixel icon if its file is missing. PNGs are kept out of git, so deploy with `vercel` from this machine.
- **Each level's scene** (`app/_site/LevelScene.tsx`) is the level's painting and logo with the game's own 3D view laid over them in an iframe: `/play/showcase.html?level=<id>`, built from `play/src/showcase.ts`. It shows a Quest hand, one of the level's emails, its weapon and its particles, and the weapon hits the email while the scene is pointed at. It is part of the game's build, so run `npm run build:game` after changing it. Open `play`'s dev server at `/showcase.html?level=castle&hover=1` to work on one by itself.
- **Art** is the game's own, read from its build at `/play/home` and `/play/logos`. Run `npm run build:game` after adding a level, or its picture is missing from the site.

## Agent rounds (MCP or REST)

The no-sign-in way to play your own mail (2026-11-13). The player's own AI agent, which already reads their email, does the reading and the acting; the game only collects decisions. No sign-in and no OAuth. The one model on our side is the mic's ("The mic" below).

1. The player tells their agent "let's play Inbox Zero". The agent reads their newest unread emails and calls **`create_round`** with, per email: its own opaque `ref` (never the real message id), `from`, `subject`, a short `summary` (never the body), a `category`, and for mail from a person, one or two short reply drafts.
2. The server keeps the round (`lib/rounds.ts`) under a free **4-digit code** and gives the agent the code and a **key**.
3. The player presses **Enter Code** on the home screen and types it on the keypad, or opens the agent's link (`/play/?code=1234`), which fills it in, hides Just Play and shows the code top right. The tab remembers it until played. For now a number that is not a live round plays the demo. The next game is that round, whatever inbox is chosen. Round two offers the agent's drafts and the mic (ElevenLabs Scribe; a round opened in this browser unlocks its tokens for 3 hours).
4. At the end the game posts what was done (`POST /api/rounds/{code}/results`) and the **emails are deleted** then. The agent calls **`get_results`** and gets, per ref, `archive`, `reply` (`reply_index` + `reply_text` for a draft; `dictated` + `reply_text` for the mic, where the words are turned into an email by the polish model when the game finishes; or `ask_user` when no words were caught) or `leave`. It shows the player the plan, and with their OK archives and replies with its own tools.
5. The results are deleted 10 minutes after the agent first reads them; a round nobody plays goes after 24 hours (`hours` to change). `cancel_round` deletes it at once.

| | |
| --- | --- |
| `POST /mcp` | The MCP server (`app/mcp/route.ts`): Streamable HTTP, stateless, plain JSON answers, no sign-in. Tools `create_round`, `get_results` (with `wait_seconds` up to 25), `cancel_round`. Give agents `https://<site>/mcp`. |
| `/api/rounds` | The same over REST (`app/api/rounds`), for agents without MCP. |
| `/agent.md` | The instructions for agents (`public/agent.md`): the flow, the fields, examples. |

**Storage** is Upstash Redis (`lib/store.ts`, `UPSTASH_REDIS_REST_URL` / `_TOKEN` or Vercel's `KV_REST_API_*`). Without them it is a Map in memory: fine on `npm run dev`, wrong on Vercel. Every key has an expiry; the key is stored only as a hash.

**Guessing codes.** 4 digits is 10,000 codes, so wrong codes are limited to 8 per address per 10 minutes (30 opens in all), and results need the key, not just the code. A stranger who guessed a live code could see that round's summaries until it is played; that is the trade for a code easy to type in a headset.

**Try it locally** (`npm run dev:all`): `curl -X POST localhost:5183/api/rounds -H 'Content-Type: application/json' -d @round.json` with the example from `public/agent.md`, open http://localhost:5183/?code=<code>, play, then `curl 'localhost:3000/api/rounds/<code>/results?key=<key>'`. To use it from Claude Code: `claude mcp add --transport http inboxzero http://localhost:3000/mcp`.

## The mic

Round two's mic streams to ElevenLabs Scribe with a single-use token from `GET /api/scribe-token` (`ELEVENLABS_API_KEY`). Tokens cost money, so they go to a browser that opened an agent round in the last 3 hours, or that has a judge's `?access=<code>` (`ACCESS_CODE`, traded for a cookie by `POST /api/access`), or to everyone with `SCRIBE_PUBLIC=1`, and always in development. Anyone else gets the browser's own speech recognition, then the mock.

In an agent round, what was said is written up as an email by `POLISH_MODEL` (`anthropic/claude-haiku-5.5` by default, `FALLBACK_MODEL` if it is down, zero data retention) when the game finishes (`lib/ai.ts`), and the agent gets both the words and the email. Without `AI_GATEWAY_API_KEY` the words are only given a greeting and a sign-off. Words the mock mic made up are never sent as the player's: the agent gets `ask_user` instead. In the demo, nothing said goes anywhere.

## Deploying (Vercel)

Import the `vr3` folder as the project root, set the environment variables, and deploy. `npm run build` builds the game into `public/play`.

The game's music (`play/public/audio/**/*.m4a`) and the repo's images are kept out of git, so a deploy from git lacks them. Deploy with `vercel` from this machine instead. Set `UPSTASH_REDIS_REST_URL` and `_TOKEN` there: without them agent rounds live in one instance's memory and get lost between requests.
