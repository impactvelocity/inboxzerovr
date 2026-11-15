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

The no-sign-in way to play your own mail (2026-11-13). The player's own AI agent, which already reads their email, does the reading and the acting; the game only collects decisions. No sign-in and no OAuth. It is data in to make the game and data out so the agent can act: no model on our side touches either (2026-11-15: "the replies should just be whatever they say, and stored as that, let their own agent figure out the end"). The mic's speech-to-text is the only AI ("The mic" below).

1. The player tells their agent "let's play Inbox Zero". The agent reads their newest unread emails and calls **`create_round`** with, per email: its own opaque `ref` (never the real message id), `from`, `subject`, a short `summary` (never the body), a `category`, and exactly two short `replies` on every email (required since 2026-11-15: an agent got back a stock reply it never wrote and couldn't tell it from its own; round two shows two bubbles on every kept email, so the agent writes both, and for automated mail they are things it could do, like "Unsubscribe me").
2. The server keeps the round (`lib/rounds.ts`) under a free **4-digit code** and gives the agent the code and a **key**.
3. The player presses **Enter Code** on the home screen and types it on the keypad, or opens the agent's link (`/play/?code=1234`), which fills it in, hides Just Play and shows the code top right. The tab remembers it until played. `1234` is a mock round of the demo inbox (`MOCK_CODE` in `play/src/mail/source.ts`); any other number that is not a live round says NO GAME FOUND. The next game is that round, whatever inbox is chosen. Round two offers the agent's drafts and the mic (ElevenLabs Scribe; a round opened in this browser unlocks its tokens for 3 hours).
4. At the end the game posts what was done (`POST /api/rounds/{code}/results`). The agent calls **`get_results`** and gets, per ref, `archive`, `reply` (`reply_index` + `reply_text` for a picked draft; `dictated` for the mic, the words as heard and nothing more, which the agent writes up itself; or `ask_user` when no words were caught) or `leave`. It shows the player the plan, and with their OK archives and replies with its own tools.
5. **Play Again** on the results screen plays the round again from the cards the tab kept. The agent keeps reading the old results until that game is finished; then the new ones replace them, `plays` goes up (2026-11-15, the user: "a replay should keep the old results until the game is completed again, and then overwritten previous results"). Only the tab that opened the round can post results: the first open gets a `play` token, and posts without it are refused (403), so someone who guesses a code can't overwrite a finished round; and a round that has been played can't be opened by its code again.
6. **What is kept** (2026-11-15: "once the agent acknowledges it - game setup and results are deleted", "maybe 4 hrs for time limit instead of 24"): the round as sent and its results stay together until the agent calls **`delete_round`** (REST: `DELETE /api/rounds/{code}`) once it has acted or the user has said no, or 4 hours after the round was made (`MAX_HOURS` in `lib/rounds.ts`; `hours` can only make it shorter), whichever comes first. Reading the results changes nothing.

| | |
| --- | --- |
| `POST /mcp` | The MCP server (`app/mcp/route.ts`): Streamable HTTP, stateless, plain JSON answers, no sign-in. Tools `create_round`, `get_results` (with `wait_seconds` up to 25), `delete_round`, each with an input and output schema; the resource `inboxzero://guide`; the prompt `play_inbox_zero`. Give agents `https://<site>/mcp`. |
| `/api/rounds` | The same over REST (`app/api/rounds`), for agents without MCP. |
| `/agent.md` | The full guide for agents (`app/agent.md/route.ts`), with the site's own address in it. |

**What agents are told** all comes from `lib/guide.ts` (2026-11-15), so keep it true to the game when the game changes: `instructions()` is sent when a client connects; `guide()` is the resource and `/agent.md` (how a game plays, the flow, every field and how each category's card shows it, what each result means and what to do, what is kept, limits, REST, an example); `playPrompt()` is the `play_inbox_zero` prompt, which Claude shows as a slash command. Field descriptions live on the Zod schemas in `lib/rounds.ts` (input) and `lib/agent.ts` (output).

**Connect an agent.** Claude (claude.ai or desktop): Settings, Connectors, Add custom connector, paste `https://<site>/mcp`. Claude Code: `claude mcp add --transport http inbox-zero-vr https://<site>/mcp`. ChatGPT, Cursor and others: a remote MCP server with no authentication. The agent also needs its own email access (a Gmail or Outlook connector). claude.ai and ChatGPT reach only a public https address, so they need the deployed site; Claude Code works with localhost.

**Storage** is Upstash Redis (`lib/store.ts`, `UPSTASH_REDIS_REST_URL` / `_TOKEN` or Vercel's `KV_REST_API_*`). Without them it is a Map in memory: fine on `npm run dev`, wrong on Vercel. Every key has an expiry; the key is stored only as a hash.

**Guessing codes.** 4 digits is 10,000 codes, so wrong codes are limited to 8 per address per 10 minutes (30 opens in all), and results need the key, not just the code. A stranger who guessed a live code could see that round's summaries until it is played; that is the trade for a code easy to type in a headset.

**Try it locally** (`npm run dev:all`; the game's dev server on 5183 passes `/api`, `/mcp` and `/agent.md` through to Next on 3000): `claude mcp add --transport http inbox-zero-vr http://localhost:5183/mcp`, then in Claude Code type `/` and pick the server's `play_inbox_zero` prompt, open the link it gives, play, and tell it you're done. Or by hand: `curl -X POST localhost:5183/api/rounds -H 'Content-Type: application/json' -d @round.json` with the example from `/agent.md`, open http://localhost:5183/play/?code=<code>, play, then `curl 'localhost:5183/api/rounds/<code>/results?key=<key>'`.

**Tested 2026-11-15** on 5183 with Upstash: the official MCP client (`@modelcontextprotocol/sdk` 1.32) for every method and the output schemas; then a headless Claude Code agent (Sonnet) given only this server and a made-up 12-email inbox. From the prompt alone it made a good round (refs 1 to 12, no message ids, short summaries, the right categories, two specials, drafts for the four people), the game was played to the end, and on "I'm done" it showed the plan by sender and subject, asked about the one `ask_user`, and waited for a yes. Not yet tried: a hosted client (claude.ai, ChatGPT) against the deployed site, a real mailbox, a real mic in a round.

## The mic

Round two's mic streams to ElevenLabs Scribe v2 realtime through the Vercel AI Gateway (since 2026-11-14), with a short-lived gateway client secret from `GET /api/scribe-token`. Minting one needs a real `AI_GATEWAY_API_KEY` (the OIDC token is refused), so the key must be in the Vercel project's env as well as `.env.local`; `MIC_MODEL` changes the model. Tokens cost money, so they go to a browser that opened an agent round in the last 3 hours, or that has a judge's `?access=<code>` (`ACCESS_CODE`, traded for a cookie by `POST /api/access`), or to everyone with `SCRIBE_PUBLIC=1` (set on the site since 2026-11-15), and in development unless `SCRIBE_PUBLIC=0`. Anyone else sees no mic button, and round two is the demo recording.

In an agent round, what was said goes to the agent as it was heard (`dictated`), and the agent writes the email. Until 2026-11-15 a model on our side (`POLISH_MODEL`, `lib/ai.ts`) wrote it up; that was removed. Words the mock mic made up are never sent as the player's: the agent gets `ask_user` and asks them.

## Deploying (Vercel)

Import the `vr3` folder as the project root, set the environment variables, and deploy. `npm run build` builds the game into `public/play`.

The game's music (`play/public/audio/**/*.m4a`) and the repo's images are kept out of git, so a deploy from git lacks them. Deploy with `vercel` from this machine instead. Set `UPSTASH_REDIS_REST_URL` and `_TOKEN` there: without them agent rounds live in one instance's memory and get lost between requests.
