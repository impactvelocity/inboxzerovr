/**
 * Everything an agent is told about Inbox Zero VR (2026-11-15: "all documentation in mcp server of how it works").
 * One source for all of it:
 *   - INSTRUCTIONS: the short version, sent when an MCP client connects (app/mcp/route.ts, `initialize`)
 *   - guide(site): the full guide, an MCP resource (inboxzero://guide) and the page /agent.md (app/agent.md/route.ts)
 *   - playPrompt(): the MCP prompt play_inbox_zero, which shows up as a slash command in Claude and other clients
 * Keep them true to the game (play/src/letters.ts: round one and two), lib/rounds.ts (the fields, what is kept) and
 * lib/agent.ts (the limits).
 */


export function instructions(site: string) {
  return `Inbox Zero VR is a VR game (Meta Quest, or any browser) where the user clears their unread email: they slash what can be archived, keep what matters, and pick or speak replies. You do the reading and the acting with your own email tools; this server never sees their mailbox, only short summaries you send, and it writes nothing: it is data in to make the game, and data out so you can act.

1. Read the user's newest unread emails (5 to 20 plays best, 30 at most). For each, send create_round an opaque ref of your own (1, 2, 3...: never the real message id), who it is from, the subject, a short summary (never the full body), a category, and exactly two short replies (required on every email: the two bubbles round two shows; for automated mail, two things you could do instead, like "Unsubscribe me"). Mark one or two that matter most today special.
2. Give the user the 4-digit code and the play_instructions (the play_url fills the code in; quest_url opens it on their Quest). Keep the key: you need it for the results.
3. When they say they're done, call get_results (wait_seconds waits for a game still being played). Every ref comes back once: archive (they slashed it), reply (a draft they picked as reply_text, or what they said into the mic as dictated, word for word: you write the email; ask_user means ask them what to say), or leave (kept it or let it go: leave it unread). If they play it again from the results screen, the last finished game replaces the results and plays goes up: read them again before acting.
4. Show the plan in plain words ("archive these 6, reply to Sam with 'Thursday works', leave 3") and act only after they agree: archive, send or draft the replies (whichever they prefer), leave the rest.
5. Then call delete_round: the round and its results are deleted at once. Call it too if they decide not to go ahead.

If you never call delete_round, the round and its results are deleted 4 hours after it was made. The full guide (how the game plays, every field, what each result means, limits): the resource inboxzero://guide, or ${site}/agent.md.`;
}

export function guide(site: string) {
  return `# Inbox Zero VR, for AI agents

Inbox Zero VR is a VR game where people clear their unread email. Emails fly at them one at a time: they slash what can be archived, keep what matters, and then answer what they kept by picking a reply or saying one into the mic. It plays on a Meta Quest, and in any browser with a mouse and keyboard.

You, the user's agent, do the reading and the acting. The game never connects to their mailbox, has no accounts and never sees a real message id. You send it a round of short summaries, the user plays, and you get back what they chose for each one. Then you show them the plan and do it with your own email tools.

## Connect

- **MCP:** \`${site}/mcp\`. Streamable HTTP, stateless, no sign-in. Tools: \`create_round\`, \`get_results\`, \`delete_round\`. Prompt: \`play_inbox_zero\`. Resource: \`inboxzero://guide\` (this page).
  - Claude (claude.ai or the desktop app): Settings, Connectors, Add custom connector, and paste the URL.
  - Claude Code: \`claude mcp add --transport http inbox-zero-vr ${site}/mcp\`
  - ChatGPT, Cursor and other clients: add it as a remote MCP server with no authentication.
- **REST:** the same three calls (see REST, below), for agents that can only make HTTP requests.

You also need your own access to the user's email (a Gmail or Outlook connector, for example). The game has none.

## How a game plays

Knowing this tells you what each result means.

1. **Round one, sort.** The emails come in your order, one at a time. The user **slashes** an email to archive it, or **grabs and throws** it to keep it for round two. One they miss flies past and is left as it is.
2. **Round two, reply.** Every email they kept comes back, with two reply bubbles: your two \`replies\` (the first on the left, the second on the right). Nothing else is ever offered: every reply in the results is one you wrote, or their own words. The user picks a bubble, or holds the mic and says their own reply, or sends it away for later (or runs out of time), which leaves it as it is.
3. **The end.** The game sends what they chose to this server, word for word. The user sees a results screen that tells them to tell you they're done.

If nothing was kept in round one, there is no round two.

**Playing again.** The results screen has Play Again (for a first game they didn't quite get). The results you can read stay the old ones while they play; when the new game is finished, its choices replace them and \`plays\` goes up by one. So if \`plays\` is more than it was when you last read, read the actions again and use the new ones. Only the device that opened the round can play it again.

## The flow

1. **The user asks to play.** Read their newest unread emails in their inbox with your own tools: 5 to 20 plays best, 30 at most. Leave out what they've already dealt with.
2. **Create a round** with \`create_round\` (fields below). You get back a 4-digit \`code\`, a \`key\`, a \`play_url\`, a \`quest_url\` and \`play_instructions\`.
3. **Give the user the code.** Pass on the \`play_instructions\`. Opened on a phone or computer signed in to their Meta account, \`quest_url\` opens the game in their Quest's browser. \`play_url\` opens it in any browser with the code filled in: they press **Clear Your Inbox**. Or they open \`${site}/play/\`, press **Enter Code** and type the code. Keep the key, and keep your own list of which ref is which email.
4. **Wait for them to say they're done**, then call \`get_results\`. If the game is still going, \`status\` is \`playing\`; \`wait_seconds\` (up to 25) waits for the end before answering.
5. **Show them the plan and ask before acting.** Use plain words, by sender and subject (map each ref back yourself), for example: "Archive these 6 (Daily Brew, two promos...), reply to Sam: 'Thursday works, see you at 12:30!', leave 3 unread. Shall I go ahead? Send the replies, or save them as drafts?"
6. **Do it** with their OK. What each action means is under Results, below.
7. **Call \`delete_round\`** with the code and key once you've acted, or once they've said no. The round and its results are deleted then. Read the results again first if \`plays\` may have gone up.

## Writing a round

\`create_round\` takes \`emails\` (1 to 30, in the order they should come; newest first is usual), a \`title\` (always give one: a short name the user will recognise as their own game, like "Tuesday inbox" or "Launch week catch-up"; it is shown big when they enter their code. 2 to 4 words, 24 characters or fewer; 40 at most) and optional \`hours\` (0.25 to 4: the most the round and its results are kept if you don't call \`delete_round\`; default 4).

Each email:

| Field | | What to send |
|---|---|---|
| \`ref\` | required, up to 64 | Your own reference: \`1\`, \`2\`, \`3\` or a short random id. **Never** the real message id or anything that identifies the message. Each ref in a round must be different. |
| \`from\` | required, up to 80 | The sender as the user knows them: "Sam Lee", "City Power". No email address needed (one in \`<...>\` is dropped). The card shows about 24 characters. |
| \`subject\` | up to 140 | The subject line. "Re:" and "Fwd:" are dropped. The card shows about 60 characters. |
| \`summary\` | up to 400 | What it says and wants, in about 180 characters, in the sender's own voice. Keep names, dates, times and amounts. **Never** the full body. |
| \`category\` | optional | Which card it is drawn on (below). Any case. Left out: Personal. |
| \`important\` | optional | True for real mail the user would want to keep or act on; false for junk. Left out, it is guessed: people, bills, failed deliveries and security alerts are important. |
| \`special\` | optional | True for the one or two that matter most right now: a deadline today, a failed payment, someone waiting on them. The game gives them the level's own effect so they stand out. One or two a round at most. |
| \`replies\` | **required**, exactly 2, 220 each | The two bubbles in round two, left then right, shown if they keep it. A sentence or two each, written as the user, no greeting or sign-off, and different from each other (a yes and a not-now, say). From a person: replies you would send. From automated mail nobody reads a reply to (receipts, deliveries, newsletters, promos, alerts): two things they might want you to do instead, like "Unsubscribe me" or "Remind me Friday to pay this". |
| \`amount\` | optional, up to 20 | Receipt and Bill: the amount as written, like \`$84.10\`. |
| \`due\` | optional, up to 24 | Bill: when it is due, like \`Fri 14 Nov\`, or \`payment failed\`. |

Categories, and how the summary is shown on each:

| Category | For | The card shows |
|---|---|---|
| \`Work\`, \`Personal\`, \`Calendar\` | People writing to them, invites | The summary as the letter's body (about 200 characters) |
| \`Newsletter\`, \`Promo\` | Newsletters, offers, sales | The subject as a headline, then up to four lines: write the summary as short sentences, each a line |
| \`Receipt\`, \`Bill\` | Orders, invoices, bills | The summary as one line (about 80 characters), with \`amount\` and, for a bill, \`due\` |
| \`Tracking\` | Deliveries | The summary as one line, with a progress bar from its words (shipped, out for delivery, delivered, failed) |
| \`Social\`, \`Alert\`, \`Spam\` | Notifications, security and account alerts, junk | The summary as one line (about 80 characters) |

## Results

\`get_results\` returns \`status\` (\`waiting\`: nobody has entered the code yet; \`playing\`: the game is open; \`done\`), \`plays\` (how many games were finished: past 1, they played it again and these are the last game's choices), a one-line \`summary\` and \`actions\`: every ref of the round exactly once, in your order. Each action is one of:

| Action | Meaning | What to do (after the user agrees) |
|---|---|---|
| \`{ action: "archive" }\` | They slashed it. | Archive it: out of the inbox, not deleted. |
| \`{ action: "reply", reply_index, reply_text }\` | They picked a reply bubble: \`reply_index\` 0 is your first, 1 your second. \`reply_text\` is its words, as you sent them. | A reply: send it in the thread, written up as a proper short email in the user's style. One of the things-to-do you wrote for automated mail ("Unsubscribe me"): do that instead of sending anything. |
| \`{ action: "reply", dictated }\` | They said their own reply into the mic. \`dictated\` is what they said, word for word, as speech-to-text heard it: nothing is added or rewritten. | Write the reply from it, in their voice, and show it to them before sending. Speech-to-text can mishear names: check them. |
| \`{ action: "reply", ask_user: true }\` | They chose to answer by voice, but no words were caught. | Ask them what to say. |
| \`{ action: "leave" }\` | They kept it but didn't answer it, or let it fly past. | Nothing. Leave it unread. |

Ask before sending anything, and ask whether replies should be sent or saved as drafts.

## What is kept, and for how long

- The round you send and its results are kept together until you call \`delete_round\`, which deletes both at once. Call it as soon as you've acted (or the user has said no).
- If you don't, both are deleted 4 hours after the round was made (or sooner, with \`hours\`).
- Once a round has been played, nobody can open it again with its code. Only the device that played it can play it again.
- Your key is stored only as a hash. Nobody can read the results without it.
- No AI model on this server sees the round or the results. What is said into the mic goes through speech-to-text (ElevenLabs Scribe, via the Vercel AI Gateway) on its way to the game, and is kept as heard.

## Errors and limits

- A call with a wrong field comes back as an error that names the field and what is wrong. Fix it and call again.
- "No round with that code and key": it was deleted, or is more than 4 hours old. Make a new round.
- Each address can make 60 rounds in 10 minutes. The game allows a few wrong codes per player before asking them to wait.
- Codes are 4 digits and reused after a round is gone, so always pass the key with the code.

## REST

\`\`\`
POST   ${site}/api/rounds                          { emails: [...], title?, hours? }
       → 201 { code, key, expires_at, emails, play_url, quest_url, play_instructions }
GET    ${site}/api/rounds/{code}/results?wait=20   Authorization: Bearer <key>
       → { code, status, plays, summary, actions: [...], expires_at }
DELETE ${site}/api/rounds/{code}                   Authorization: Bearer <key>
       → { code, deleted: true }
\`\`\`

If you can only fetch URLs, \`?key=<key>\` works in place of the header. Errors come back as \`{ error }\` with status 400, 404, 409 or 429.

## Example

\`\`\`json
POST ${site}/api/rounds
{
  "title": "Tuesday inbox",
  "emails": [
    { "ref": "1", "from": "Sam Lee", "subject": "Lunch Thursday?", "summary": "Free for lunch Thursday at 12:30 near the office? I'll book somewhere.", "category": "Personal", "replies": ["Thursday works, see you at 12:30!", "Can't do Thursday. How about Friday?"] },
    { "ref": "2", "from": "Daily Brew", "subject": "This week in coffee", "summary": "New single-origin beans are in. A guide to cold brew. 20% off grinders until Sunday.", "category": "Newsletter", "replies": ["Unsubscribe me", "Save the cold brew guide"] },
    { "ref": "3", "from": "City Power", "subject": "Your bill is ready", "summary": "Your November bill is ready. Autopay is off.", "category": "Bill", "amount": "$84.10", "due": "Fri 14 Nov", "special": true, "replies": ["Remind me Thursday to pay it", "Turn autopay back on"] }
  ]
}
\`\`\`

\`\`\`json
GET ${site}/api/rounds/4821/results
{
  "code": "4821",
  "status": "done",
  "plays": 1,
  "summary": "Archive 1, reply to 1, leave 1 as they are.",
  "actions": [
    { "ref": "1", "action": "reply", "reply_index": 0, "reply_text": "Thursday works, see you at 12:30!" },
    { "ref": "2", "action": "archive" },
    { "ref": "3", "action": "leave" }
  ],
  "expires_at": "2026-11-15T19:40:00.000Z"
}
\`\`\`

Then, to the user: "You archived Daily Brew, said yes to Sam's lunch, and left the City Power bill for later. Shall I archive it and send Sam 'Thursday works, see you at 12:30!'?" Once that's done, \`DELETE ${site}/api/rounds/4821\` (or \`delete_round\`).
`;
}

/** The MCP prompt play_inbox_zero: what the user would say to start a game. */
export function playPrompt(count?: string) {
  const n = count && /^\d+$/.test(count.trim()) ? Math.min(30, Math.max(1, Number(count))) : 0;
  return `Let's play Inbox Zero VR with my email. Read my newest ${n || '10 to 15'} unread emails in my inbox with your email tools and make a round of them with create_round, following the Inbox Zero VR server's instructions: short summaries only, your own refs, never real message ids, and two short replies as me on every email (for automated mail, two things you could do instead). Then give me the code and the link. When I tell you I'm done, get the results, show me the plan by sender and subject, and only act after I say yes. Write any reply I said into the mic as a proper email from my words. When it's all done, delete the round.`;
}
