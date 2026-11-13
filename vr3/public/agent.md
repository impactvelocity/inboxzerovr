# Inbox Zero VR, for AI agents

Inbox Zero VR is a VR game where people clear their unread email: they slash what can be archived, keep what matters, and pick replies. You, the user's agent, do the reading and the acting. The game only collects their decisions. The game never connects to their mailbox and has no accounts.

- **MCP:** add `https://<this site>/mcp` as a remote MCP server (Streamable HTTP, no sign-in). Tools: `create_round`, `get_results`, `cancel_round`.
- **REST:** the same three calls, below.

## The flow

1. **The user asks to play.** Read their newest unread emails with your own email tools. 5 to 20 plays best, 30 at most.
2. **Create a round.** For each email, send:
   - `ref`: your own reference, such as `1`, `2`, `3`, or a short random id. Never the real message id. Keep the mapping on your side.
   - `from`: the sender's name or company.
   - `subject`.
   - `summary`: what it says and wants, in about 180 characters. Never the full body.
   - `category` (optional): one of `Work`, `Personal`, `Calendar`, `Newsletter`, `Promo`, `Spam`, `Receipt`, `Bill`, `Tracking`, `Social`, `Alert`. It picks the card the email is drawn on.
   - `important` (optional): true if they would want to keep it or act on it.
   - `replies` (optional): one or two short reply drafts, a sentence or two each, for mail from a person who expects an answer.
   - `amount` and `due` (optional): for receipts and bills.
3. **Give the user the code.** You get back a 4-digit `code` and a `key`. Tell the user the code and the `play_instructions`: open the game, tap **Inbox**, type the code, and press Start. Keep the key.
4. **Read the results.** When the user says they're done, call `get_results` with the code and key. Each email's ref comes back with one of these actions:
   - `archive`: they slashed it.
   - `reply`: they picked a draft (`reply_index` and `reply_text`), or said their own reply into the mic. A spoken reply comes as `dictated` (the words as heard) and `reply_text` (the email our model wrote from them, `written_by: "ai"`, or a plain wrap without a model, `"rules"`). `ask_user: true` means they chose to answer by voice but their browser caught no words: ask them what to say.
   - `leave`: they kept it, or left it for later. Leave it unread.
5. **Check before acting.** Show the plan in plain words, for example "Archive these 6, reply to Sam with 'Thursday works', leave 3", and do it only after they agree. Archive, send or draft the replies (ask which they prefer), and leave the rest as it is.

## What is kept

- The emails you send are kept until the game is finished, then deleted. If nobody plays, they are deleted after 24 hours (or the `hours` you set).
- The results are deleted 10 minutes after you first read them.
- `cancel_round` deletes both at once.
- Your key is stored only as a hash.

## REST

```
POST   /api/rounds                      { emails: [...], title?, hours? }  →  201 { code, key, expires_at, play_url, play_instructions }
GET    /api/rounds/{code}/results?wait=20   Authorization: Bearer <key>  →  { status: waiting | playing | done, summary, actions: [...] }
DELETE /api/rounds/{code}                   Authorization: Bearer <key>  →  { deleted: true }
```

If you can only fetch URLs, `?key=<key>` works in place of the header.

### Example

```json
POST /api/rounds
{
  "title": "Tuesday inbox",
  "emails": [
    { "ref": "1", "from": "Sam Lee", "subject": "Lunch Thursday?", "summary": "Free for lunch Thursday at 12:30 near the office? I'll book somewhere.", "category": "Personal", "replies": ["Thursday works, see you at 12:30!", "Can't do Thursday, how about Friday?"] },
    { "ref": "2", "from": "Daily Brew", "subject": "This week in coffee", "summary": "New single-origin beans. A guide to cold brew. 20% off grinders.", "category": "Newsletter" },
    { "ref": "3", "from": "City Power", "subject": "Your bill is ready", "summary": "Your November bill is ready.", "category": "Bill", "amount": "$84.10", "due": "Fri 14 Nov" }
  ]
}
```

```json
GET /api/rounds/4821/results
{
  "code": "4821",
  "status": "done",
  "summary": "Archive 1, reply to 1, leave 1 as they are.",
  "actions": [
    { "ref": "1", "action": "reply", "reply_index": 0, "reply_text": "Thursday works, see you at 12:30!" },
    { "ref": "2", "action": "archive" },
    { "ref": "3", "action": "leave" }
  ]
}
```
