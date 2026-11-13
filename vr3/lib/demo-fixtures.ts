/**
 * The demo inbox's raw emails: made up, but written to look like a real inbox on a real weekday.
 * Every person, company and address here is fictional (the domains are .example).
 *
 * Two uses:
 *   npm run bake     runs them through the same sorting and replies as real mail, into
 *                    play/src/mail/demo-inbox.json, which the public demo plays
 *   POST /api/seed   puts them into the signed-in Gmail as unread (for a demo account only),
 *                    so the live path can be shown without anyone's own mail
 *
 * `said` is what the mock mic "hears" for an email that needs an answer (when there is no mic).
 */
export interface Fixture {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  /** How long ago it arrived. */
  hoursAgo: number;
  text: string;
  /** A mailing: it has List-Unsubscribe. */
  list?: boolean;
  /** Gmail's category, as a hint (the inbox tab it would land in). */
  tab?: 'promotions' | 'social' | 'updates' | 'forums';
  said?: string;
}

export const Fixtures: readonly Fixture[] = [
  // ---------------------------------------------------------------- people, wanting an answer
  { id: 'demo-01', fromName: 'Maya Okonkwo', fromAddress: 'maya.okonkwo@lumen-studio.example', subject: 'Onboarding flow: permissions step', hoursAgo: 1,
    text: `Hey,

I ran through the new onboarding on my phone last night. The first two screens feel great. The permissions step still loses people though: it asks for camera, contacts and notifications all at once and the copy reads like a legal notice.

Could we split it into three asks, each shown when it's actually needed? I mocked it up in Figma (page "Onboarding v4"). Would love your take before Thursday's review.

Maya`,
    said: "Love the split, let's do it. I'll look at the Figma page tonight and we can walk through it before Thursday." },
  { id: 'demo-02', fromName: 'Rosa Delgado', fromAddress: 'rosa.delgado@mailbox.example', subject: 'Lake weekend, last weekend of July!', hoursAgo: 3,
    text: `Hi sweetheart,

We finally booked the cabins at Pine Hollow for the last weekend of July. Everyone's coming, even Uncle Teo is flying in from Lisbon. There's a room for you and whoever you'd like to bring.

Barbecue Saturday night, the canoe race Sunday morning (your cousins are already trash talking). Can you let me know by the end of the month so I can sort out the beds?

Love,
Aunt Rosa`,
    said: "We'd love to come for the whole weekend. Count us in, and I'll bring the lemon cake." },
  { id: 'demo-03', fromName: 'Chris Albright', fromAddress: 'c.albright@lumen-studio.example', subject: 'Q3 budget needs your sign-off by Friday', hoursAgo: 5,
    text: `Hi,

Attached is the Q3 budget for your team. Travel is up about 12% on last quarter, mostly the two conference trips in September. Software is down $1,400 a month now that the old analytics tool is cancelled.

If the numbers look right, just reply to approve. If anything looks off, let's go through it line by line before Friday.

Thanks,
Chris
Finance`,
    said: 'The numbers look right to me, approved. Thanks for pulling it together so fast.' },
  { id: 'demo-04', fromName: 'Sam Reyes', fromAddress: 'samreyes@mailbox.example', subject: 'Still on for Saturday?', hoursAgo: 7,
    text: `Booked court 3 for 10am Saturday. Bring the good racket, not the one with the snapped string. Coffee at Marlowe's after?`,
    said: "Still on! Ten o'clock, good racket, and coffee's on me after." },
  { id: 'demo-05', fromName: 'Priya Natarajan', fromAddress: 'priya.n@lumen-studio.example', subject: 'Can you look at my board deck before 9am?', hoursAgo: 9,
    text: `Hi! It's only 12 slides, promise. Mostly I need a second pair of eyes on the numbers in section 3 (retention and the cohort chart) before the board sees it tomorrow. Link is in the team drive under Board / November.

Thank you!!
Priya`,
    said: "On it. I'll go through section three tonight and send you notes before nine." },
  { id: 'demo-06', fromName: 'Dr. Lena Hart', fromAddress: 'frontdesk@willowcreek-vet.example', subject: "Biscuit's yearly vaccines are due", hoursAgo: 20,
    text: `Hello,

Our records show Biscuit is due for her yearly vaccines this month. We have openings Tuesday and Thursday mornings next week. Just reply with a time that works and we'll book her in.

Willow Creek Veterinary`,
    said: 'Tuesday morning works great for Biscuit. Thanks!' },
  { id: 'demo-07', fromName: 'Jordan Pike', fromAddress: 'jordan.pike@harborline.example', subject: 'Kickoff next week?', hoursAgo: 26,
    text: `Thrilled to get started with you all. The contract is signed on our side. Our team is free Monday or Tuesday afternoon for a kickoff. Which works better for you? Happy to come to your office.

Best,
Jordan Pike
Harborline Logistics`,
    said: "We're excited too. Monday afternoon works for us, and we'd love to have you at the office." },
  { id: 'demo-08', fromName: 'Dad', fromAddress: 'tom.walsh@mailbox.example', subject: 'Sunday dinner', hoursAgo: 30,
    text: `Making the lasagna again on Sunday. Can you bring a salad? Your sister says she'll be late, as usual. 6 o'clock.

Dad`,
    said: "I'll be there at six with a big salad. Save me a corner piece." },
  { id: 'demo-09', fromName: 'Alex Kim', fromAddress: 'alex.kim@lumen-studio.example', subject: 'Checkout errors since the 2pm deploy', hoursAgo: 0.5,
    text: `Checkout has been throwing 500s for about 3% of requests since the 2pm deploy. Looks like the new tax service times out under load. I'm rolling back now. Can you look at the logs when you get a sec?`,
    said: "Thanks for catching it. Go ahead with the rollback and I'll dig into the tax service logs now." },

  // ---------------------------------------------------------------- things that matter, not from a person
  { id: 'demo-10', fromName: 'Northwind Bank', fromAddress: 'alerts@northwind-bank.example', subject: 'New sign-in to your account', hoursAgo: 2,
    text: `We noticed a new sign-in to your Northwind account.

Device: Chrome on Windows
Location: Lisbon, Portugal
Time: 2:14 AM

If this was you, you can ignore this email. If not, lock your account from the app right away.`, tab: 'updates' },
  { id: 'demo-11', fromName: 'Cascade Power', fromAddress: 'billing@cascade-power.example', subject: 'Your November bill is ready: $84.10', hoursAgo: 14,
    text: `Your bill for October 12 to November 11 is ready.

Amount due: $84.10
Due date: Friday, November 21

Autopay is off for this account. Pay online or in the app.`, tab: 'updates' },
  { id: 'demo-12', fromName: 'Parcelly', fromAddress: 'noreply@parcelly.example', subject: 'Delivery attempt failed: signature needed', hoursAgo: 4,
    text: `We tried to deliver your package today but a signature is required.

Package: 1 box from Fennel & Co.
Next step: choose a new delivery day, or pick it up at the Elm Street depot after 2pm tomorrow.`, tab: 'updates' },
  { id: 'demo-13', fromName: 'Bluebird Air', fromAddress: 'trips@bluebird-air.example', subject: 'Schedule change: BB 418 now departs 6:10 AM', hoursAgo: 11,
    text: `Your flight BB 418 to Denver on Dec 3 has a schedule change.

New departure: 6:10 AM (was 9:45 AM)
Check-in opens 24 hours before departure.

Not working for you? You can change to another flight at no cost in Manage Trip.`, tab: 'updates' },

  // ---------------------------------------------------------------- junk
  { id: 'demo-14', fromName: 'Fennel & Co.', fromAddress: 'hello@fennelco.example', subject: 'Your cart misses you (and so do we)', hoursAgo: 6, list: true, tab: 'promotions',
    text: `STILL THINKING IT OVER?
The linen throw you looked at is back in stock.
Take 20% off with code COZY20, today only.
Free shipping on orders over $60.
Unsubscribe | View in browser` },
  { id: 'demo-15', fromName: 'The Morning Ledger', fromAddress: 'newsletter@morningledger.example', subject: 'The Ledger: rates hold, robots fold laundry', hoursAgo: 8, list: true, tab: 'updates',
    text: `TODAY IN 5 MINUTES
The central bank holds rates for a third month
A laundry-folding robot finally ships (it is slow)
Why every city wants a night mayor
Weekend read: the return of the long lunch
Unsubscribe` },
  { id: 'demo-16', fromName: 'Brightline Fitness', fromAddress: 'team@brightline-fit.example', subject: "It's been 412 days. Come back for $1", hoursAgo: 12, list: true, tab: 'promotions',
    text: `WE MISS YOU
Rejoin this week for just $1 for your first month.
New: 5:30am spin classes.
Your old locker is still here (probably).
Unsubscribe` },
  { id: 'demo-17', fromName: 'LinkLoop', fromAddress: 'notifications@linkloop.example', subject: '14 people viewed your profile this week', hoursAgo: 15, list: true, tab: 'social',
    text: `You appeared in 31 searches this week.
14 people viewed your profile, including a recruiter at Harborline Logistics.
See who's looking. Upgrade to LinkLoop Premium.` },
  { id: 'demo-18', fromName: 'Marlowe Coffee', fromAddress: 'receipts@marlowe-coffee.example', subject: 'Your receipt from Marlowe Coffee', hoursAgo: 18, tab: 'updates',
    text: `Thanks for stopping by!
1 oat latte, extra hot: $5.75
Total: $5.75
Paid with card ending 4417.` },
  { id: 'demo-19', fromName: 'Tunebox', fromAddress: 'billing@tunebox.example', subject: 'Your Tunebox receipt', hoursAgo: 40, tab: 'updates',
    text: `Receipt for your annual Tunebox Family plan.
Amount: $119.00
Renews: November 10 next year.` },
  { id: 'demo-20', fromName: 'Parcelly', fromAddress: 'noreply@parcelly.example', subject: 'Your package is out for delivery', hoursAgo: 22, tab: 'updates',
    text: `Good news! Your package from Fennel & Co. is out for delivery and will arrive today by 8pm.` },
  { id: 'demo-21', fromName: 'Ryan @ GrowthPilot', fromAddress: 'ryan@growthpilot-ai.example', subject: 'Quick question', hoursAgo: 19,
    text: `Hi there,

I noticed Lumen Studio is growing fast. We help teams like yours 10x outbound pipeline with AI SDRs. Do you have 15 minutes this week for a quick chat?

Ryan
GrowthPilot` },
  { id: 'demo-22', fromName: 'Prize Desk', fromAddress: 'winner@prize-desk.example', subject: 'You have been selected for a FREE cruise', hoursAgo: 23, tab: 'promotions',
    text: `CONGRATULATIONS! You have been selected for a 7-night Caribbean cruise. Claim within 4 hours by confirming your card details. Limited cabins remain!` },
  { id: 'demo-23', fromName: 'Lumen Studio (All Staff)', fromAddress: 'all-staff@lumen-studio.example', subject: 'RE: RE: Whose lunch is in the fridge?', hoursAgo: 10,
    text: `Not mine. Replying all so everyone knows it's not mine. Has anyone checked the freezer?` },
  { id: 'demo-24', fromName: 'Cobalt Cloud', fromAddress: 'no-reply@cobalt-cloud.example', subject: "You're using 2% of your storage", hoursAgo: 28, list: true, tab: 'promotions',
    text: `UPGRADE TO COBALT PRO
2 TB of space for all your files
Now with smart folders
Just $9.99 a month, cancel anytime
Unsubscribe` },
];

const ROBOT = /^(no-?reply|notifications?|alerts?|billing|receipts|trips|newsletter|hello|team|winner|all-staff)/i;
const TAB_LABEL = { promotions: 'CATEGORY_PROMOTIONS', social: 'CATEGORY_SOCIAL', updates: 'CATEGORY_UPDATES', forums: 'CATEGORY_FORUMS' } as const;

/** A fixture as if it had been read from Gmail (for the bake). */
export function asParsed(f: Fixture, now = Date.now()) {
  return {
    id: f.id, threadId: f.id, fromName: f.fromName, fromAddress: f.fromAddress, to: '', subject: f.subject,
    date: new Date(now - f.hoursAgo * 3_600_000), messageId: `<${f.id}@demo.inboxzero.example>`, references: '',
    labels: ['INBOX', 'UNREAD', ...(f.tab ? [TAB_LABEL[f.tab]] : [])], unsubscribe: !!f.list,
    robot: ROBOT.test(f.fromAddress.split('@')[0]), text: f.text.trim(), snippet: f.text.trim().slice(0, 160),
  };
}

/** A fixture as a raw RFC 2822 email to put into a demo Gmail account (POST /api/seed). */
export function asRaw(f: Fixture, to: string, now = Date.now()): string {
  const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
  return [
    `From: ${word(f.fromName)} <${f.fromAddress}>`,
    `To: ${to}`,
    `Subject: ${word(f.subject)}`,
    `Date: ${new Date(now - f.hoursAgo * 3_600_000).toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${f.id}.${now}@demo.inboxzero.example>`,
    ...(f.list ? [`List-Unsubscribe: <mailto:unsubscribe@${f.fromAddress.split('@')[1]}>`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    f.text.trim().replace(/\r?\n/g, '\r\n'),
  ].join('\r\n');
}
