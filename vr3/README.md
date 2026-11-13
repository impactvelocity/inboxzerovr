# VR3: Inbox Zero, the site and the game

Since 2026-11-12 this folder is two apps:

- **`play/`**: the game (IWSDK + three.js, built with Vite). Everything about it is in [play/README.md](play/README.md).
- **the root**: a Next.js app. It has the front page at `/`, serves the game's build at `/play/`, and runs the API the game calls for real email, replies and the mic.

Everyone can play the demo inbox. Real Gmail is only for you and people you invite with an access link: the Google app stays in Testing mode, so there is no Google review or security audit.

## Run

Use Node 24 (`nvm use`). Install both apps once: `npm install`, then `npm --prefix play install`.

| | |
| --- | --- |
| `npm run dev:all` | Starts the site and API on :3000 and the game on :5183. Open the game at http://localhost:5183/. Its `/api` calls go through to Next, so the game and the API share one origin and one sign-in cookie. |
| `npm run dev` | The site and API only, on :3000. |
| `npm --prefix play run dev` | The game only. The demo works; the mic falls back to the browser's speech recognition. |
| `npm run build` | Builds the game, copies it to `public/play`, and builds the site. `npm start` serves the result on :3000 (the game is at `/play/`). |
| `npm run bake` | Bakes the demo inbox (below). Needs `AI_GATEWAY_API_KEY`. |

Settings go in `.env.local`; [.env.example](.env.example) lists them all. Every key is optional: with none set, the site still serves the game and its demo.

## The front page

`app/page.tsx` is the site at `/`: the hero, the demo video, how it works, the AI parts, why it exists, a section per level, and a footer about the competition. Its styles are `app/globals.css`.

- **Words and links** that are likely to change are in `app/_site/content.ts`: the demo video's YouTube id (`demoVideo`; empty shows "coming soon"), the competition and author links, the tools in the footer, and each level's name, weapon and blurb. A new level in the game needs a line there too.
- **In a headset** the hero is the short version with one PLAY GAME button. The page decides from the browser's user agent (Quest, Pico, Wolvic). Add `?vr=1` or `?vr=0` to see either one on a desk.
- **With `?access=<code>`** the hero says judge access is on, and every play link carries the code to the game.
- **The hands** in the controls part are the user's PNGs in `public/site/hands/`: `left-grab`, `left-read`, `left-throw` and `right-destroy` (which shows the slash and the cut together). They were made from the briefs in `design/site-hands-v1/prompts.md`. `right-slash.png` is there too but not shown: its background did not come out transparent. A tile shows a pixel icon if its file is missing. PNGs are kept out of git, so deploy with `vercel` from this machine.
- **Each level's scene** (`app/_site/LevelScene.tsx`) is the level's painting and logo with the game's own 3D view laid over them in an iframe: `/play/showcase.html?level=<id>`, built from `play/src/showcase.ts`. It shows a Quest hand, one of the level's emails, its weapon and its particles, and the weapon hits the email while the scene is pointed at. It is part of the game's build, so run `npm run build:game` after changing it. Open `play`'s dev server at `/showcase.html?level=castle&hover=1` to work on one by itself.
- **Art** is the game's own, read from its build at `/play/home` and `/play/logos`. Run `npm run build:game` after adding a level, or its picture is missing from the site.

## Real email

**What a game does to Gmail.** Only at the end of a finished game:

| In the game | In Gmail |
| --- | --- |
| Cut | Archived: out of the inbox, still unread, still in All Mail. |
| Kept | Nothing. |
| Later | Nothing. |
| Sent (a reply, or a dictation kept) | Saved as a draft on the email's thread. The email itself stays unread in the inbox. |

A game left before its end changes nothing. Nothing is ever sent or deleted.

**Nothing is stored.** The server reads Gmail, sorts the mail, answers, and forgets it all with the request. The Google tokens live only in an encrypted, http-only cookie (`lib/session.ts`). The cards and drafts live only in the running game (`play/src/mail/source.ts`). Every model call asks AI Gateway for zero data retention.

**How it flows.**

1. **Access.** An `?access=<code>` link (to `/` or `/play/`) is traded for a cookie (`POST /api/access`), then removed from the address bar. With that cookie, the game's **Inbox** card on the home screen offers **Your Gmail** and **Connect Gmail**. Codes are `ACCESS_CODE` in `.env.local`; separate several with commas.
2. **Sign-in.** `/api/auth/google` sends the browser to Google with PKCE, and `/api/auth/callback` sends it back. The one scope is `gmail.modify`, which covers reading, archiving, drafts and insert, but never sending. Do this on the 2D home screen before entering VR.
3. **Loading.** `GET /api/inbox?count=N` reads the newest N unread emails. Each one is sorted into a card by `anthropic/claude-haiku-5.5` at low effort (`lib/ai.ts`). Cards stream back one JSON line at a time, so the game can start before the last one is done. N is set under **Emails per game** on the Inbox card. A card that can't be sorted by the model is sorted by rules instead (`lib/rules.ts`), and so is everything when there is no AI key.
4. **Round one.** An email that needs an answer starts its two replies being written as soon as it arrives (`POST /api/replies`, `anthropic/claude-sonnet-5.5`). Any other email starts when it is kept. By round two they are usually ready. If not, the bubbles say WRITING A REPLY... and can't be chosen until the replies come in.
5. **Round two.** A reply sent becomes a draft. A dictation kept goes through `POST /api/polish` (Haiku), which turns the spoken words into the email. The mic itself is `play/src/dictate.ts`, which gets its ElevenLabs token from `/api/scribe-token`.
6. **The end.** `POST /api/apply` archives what was cut and saves the drafts. The home screen says what was done, e.g. "Last game: 6 archived, 2 replies saved as drafts in Gmail", and the inbox is read again for the next game. With real mail, if nothing was kept there is no round two.

**Models.** Set them with `SORT_MODEL`, `REPLY_MODEL` and `FALLBACK_MODEL` (AI Gateway names). The fallback model, `google/gemini-3.8-flash` by default, is used when the first one is down. The email's words go to the model as data inside `<email>` tags, and the prompt says not to follow instructions in them. The models have no tools.

## Setting up Gmail (once)

1. In the Google Cloud console, create a project and enable the **Gmail API**.
2. In **Google Auth Platform**, under **Branding**, give it a name and a support email.
3. Under **Audience**, set the user type to **External** and the publishing status to **Testing**. Add each Google account that may sign in as a test user: you, the demo account, and each judge. Up to 100 accounts.
4. Under **Data Access**, add the scope `https://www.googleapis.com/auth/gmail.modify`.
5. Under **Clients**, create a **Web application** client with these authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback`
   - `http://localhost:5183/api/auth/callback`
   - `https://<your domain>/api/auth/callback`
6. Put the client id and secret in `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, along with `AUTH_SECRET` and `ACCESS_CODE`.

Testing mode has two catches:
- Google shows test users a "Google hasn't verified this app" screen. They click Continue.
- A sign-in lasts 7 days, then it is sign in again.

Google only accepts `localhost` or an https domain as a redirect URI, not a LAN address. So on the Quest, use `adb reverse tcp:5183 tcp:5183` (and `tcp:3000`) with `http://localhost:5183/`, or the deployed site.

**For judges.** Send them the site's link with `?access=<code>`. Each judge's Google account must be on the test-user list first, or they can sign into the demo account instead.

## The demo inbox

`lib/demo-fixtures.ts` holds 24 made-up but real-looking emails. Every person and company in them is fictional, and the domains end in `.example`.

- **`npm run bake`** runs them through the same sorting and replies as real mail and writes `play/src/mail/demo-inbox.json`, which the public demo plays. Until it has been baked, the demo plays the game's original made-up inbox (`play/src/mail/emails.ts`).
- **`POST /api/seed`** puts the same emails into the signed-in Gmail as unread, without sending anything. This shows the live path on video without anyone's own mail. It is allowed in development, or with `ALLOW_SEED=1`. Use it only on a demo account.

## Trying the live path without Google

`MOCK_GMAIL=1 npm run dev:all` (or `MOCK_GMAIL=1 npm start` after a build) swaps Gmail for a pretend one made of the demo emails (`lib/mock-gmail.ts`). With the invite, the Inbox card shows you as signed in as you@demo.example. Everything else is real: the inbox stream, the sorting and replies (with the models if `AI_GATEWAY_API_KEY` is set), and the game's real-mail side. What would be archived or drafted is printed in the server's log instead, and archived ones leave the pretend inbox until the server restarts. Never set it where real players are.

## Deploying (Vercel)

Import the `vr3` folder as the project root, set the environment variables, and deploy. `npm run build` builds the game into `public/play`.

The game's music (`play/public/audio/**/*.m4a`) and the repo's images are kept out of git, so a deploy from git lacks them. Deploy with `vercel` from this machine instead. The mic's tokens go only to browsers with the access cookie or a Gmail session; set `SCRIBE_PUBLIC=1` to give them to everyone.
