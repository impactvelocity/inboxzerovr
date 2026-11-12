import { hex, type Rgba } from './color';

export type EmailKind = 'Junk' | 'Real';

/**
 * What sort of email it is. The letter is laid out for its type and wears it as a tag, the way
 * a mail app sorts an inbox into tabs. It is a hint, not the answer: most types hold both junk
 * and things that need a reply.
 */
export type Category =
  | 'Work'
  | 'Personal'
  | 'Newsletter'
  | 'Spam'
  | 'Promo'
  | 'Receipt'
  | 'Bill'
  | 'Tracking'
  | 'Social'
  | 'Calendar'
  | 'Alert';

export const Categories = {
  label: (category: Category): string => category.toUpperCase(),
  tint(category: Category): Rgba {
    switch (category) {
      case 'Work': return hex(0x4aa8ff);
      case 'Personal': return hex(0xff6ec7);
      case 'Newsletter': return hex(0xb388ff);
      case 'Spam': return hex(0xff4d6d);
      case 'Promo': return hex(0xffa24a);
      case 'Receipt': return hex(0x5eead4);
      case 'Bill': return hex(0xffd24a);
      case 'Tracking': return hex(0xa3e635);
      case 'Social': return hex(0xc084fc);
      case 'Calendar': return hex(0x7dd3fc);
      default: return hex(0xff8a4a);
    }
  },
};

export interface Email {
  from: string;
  subject: string;
  /** One line: the gist (spam, alerts, social), or the detail under an amount. */
  snippet?: string;
  /** People's emails: the start of the message, shown cut to three lines. */
  body?: string;
  /** Newsletters and offers: the sections of the mock email that scrolls by. */
  items?: string[];
  /** Receipts and bills. */
  amount?: string;
  due?: string;
  /** Deliveries: 0 ordered, 1 shipped, 2 on its way, 3 delivered. */
  step: number;
  /** A bill or a delivery that went wrong. */
  failed: boolean;
  kind: EmailKind;
  category: Category;
  /** Two ready-made replies offered in round 2. */
  replies: [string, string];
}

const NoThanks: [string, string] = ['Please take me off this list. Thank you!', 'Not interested, but good luck with it'];

function make(kind: EmailKind, category: Category, from: string, subject: string, a?: string, b?: string): Email {
  return { kind, category, from, subject, step: 0, failed: false, replies: a !== undefined && b !== undefined ? [a, b] : NoThanks };
}

/** From a person: subject, who, and the first lines of the message. */
function person(kind: EmailKind, category: Category, from: string, subject: string, body: string, a?: string, b?: string): Email {
  const email = make(kind, category, from, subject, a, b);
  email.body = body;
  return email;
}

/** A newsletter or an offer: a mock email that scrolls by. The first item is its headline. */
function letter(category: Category, from: string, subject: string, ...items: string[]): Email {
  const email = make('Junk', category, from, subject);
  email.items = items;
  return email;
}

function receipt(from: string, subject: string, amount: string, detail: string): Email {
  const email = make('Junk', 'Receipt', from, subject);
  email.amount = amount;
  email.snippet = detail;
  return email;
}

function bill(from: string, subject: string, amount: string, due: string, detail: string, failed: boolean, a: string, b: string): Email {
  const email = make('Real', 'Bill', from, subject, a, b);
  email.amount = amount;
  email.due = due;
  email.snippet = detail;
  email.failed = failed;
  return email;
}

function parcel(kind: EmailKind, from: string, subject: string, step: number, failed: boolean, detail: string, a?: string, b?: string): Email {
  const email = make(kind, 'Tracking', from, subject, a, b);
  email.step = step;
  email.failed = failed;
  email.snippet = detail;
  return email;
}

/** One line of gist: spam, alerts, social. */
function note(kind: EmailKind, category: Category, from: string, subject: string, gist: string, a?: string, b?: string): Email {
  const email = make(kind, category, from, subject, a, b);
  email.snippet = gist;
  return email;
}

const J: EmailKind = 'Junk';
const R: EmailKind = 'Real';

/**
 * The fictional inbox (Unity: Emails.All, word for word). Every sender and company is made up.
 *
 * Junk should be destroyed. Real should be kept. Each one has to be readable at a glance, so
 * the sender and the subject carry the decision.
 */
export const Emails: readonly Email[] = [
  // ---------------------------------------------------------------- junk
  letter('Promo', 'SockDrawer Deals', '70% OFF ends at MIDNIGHT!!!',
    'THE SOCK EVENT OF THE YEAR', 'Wool crew socks, now $4 a pair', 'Mystery bundle: 12 surprise pairs',
    'Free shipping on orders over $80', 'Your cart misses you. Come back.'),
  letter('Promo', 'Webinar Wizard', 'Last chance: 10x your synergy',
    'LIVE THIS THURSDAY AT NOON', 'Synergy secrets of the pros', 'Only 3 seats left (of 4,000)',
    'Bonus: a free PDF about PDFs'),
  letter('Promo', 'Fitness Barn', 'We miss you! Come back',
    'IT HAS BEEN 412 DAYS', 'Rejoin today for just $1', 'Spin class now starts at 5:30am',
    'Your locker misses you too'),
  letter('Promo', 'Survey Team', 'Rate your recent survey',
    'HOW DID WE DO?', 'Question 1 of 87', 'It only takes about 25 minutes', 'Win a $5 voucher (maybe)'),
  letter('Promo', 'CloudBox', 'You are using 2% of your storage',
    'UPGRADE TO CLOUDBOX PRO', '2 TB of space for your 3 photos', 'Now with AI-powered folders',
    'Just $119 a year, billed today'),
  letter('Promo', 'Mattress Planet', 'Dylan, still thinking it over?',
    'STILL THINKING IT OVER?', 'You looked at a mattress once', 'Sleep on it: 100 nights free',
    'Matching pillows from $29'),
  letter('Promo', 'Pizza Palace', 'Buy 9 pizzas, get 1 free',
    'THIS WEEKEND ONLY', 'Buy 9 pizzas, get the 10th free', 'New: stuffed pineapple crust',
    'Order now in the app'),
  letter('Promo', 'AppStore Reviews', 'Enjoying Flashlight Pro?',
    'LEAVE US 5 STARS', 'Rate Flashlight Pro today', 'It lights up your life', 'Tap a star below'),
  letter('Newsletter', 'The Daily Digest', 'Your digest of digests',
    'TODAY IN DIGESTS', '47 newsletters, summarised for you', 'Why summaries are the future',
    "This week's top 10 top-10 lists", 'Reader mail: please, more lists'),
  letter('Newsletter', 'Growth Hacks Weekly', '7 morning habits of CEOs',
    '7 MORNING HABITS OF CEOS', '1. Wake up before the sun', '2. Think about synergy',
    'Number 4 will shock you', 'Sponsored: the ice bath of the week'),
  letter('Newsletter', 'Horoscope Hub', 'Mercury is in your inbox',
    'YOUR WEEK AHEAD', 'Mercury is in your inbox', 'Avoid email today', 'Your lucky number is 0'),
  letter('Newsletter', 'Vendor Newsletter', 'Our Q3 thought leadership',
    'Q3 THOUGHT LEADERSHIP', 'A 40 page PDF is attached', 'Leading thoughts since 2009',
    'Watch the webinar replay'),

  note(J, 'Spam', 'Prince Adewale', 'URGENT business proposal', 'I wish to transfer $9,000,000 to you.'),
  note(J, 'Spam', 'Crypto Kevin', 'This coin is going to the MOON', 'Do not tell anyone else about this.'),
  note(J, 'Spam', 'Sales Bot 3000', 'Quick question', 'Do you have 15 minutes this week?'),
  note(J, 'Spam', 'Sales Bot 3000', 'Bumping this to the top', 'Just following up on my follow up.'),
  note(J, 'Spam', 'Free Cruise Center', 'You WON a free cruise', 'Claim it in the next 4 minutes.'),
  note(J, 'Spam', 'Conference Spam', 'Call for papers: Blockchain Yoga', 'Submit your abstract by Friday.'),
  note(J, 'Social', 'LinkUp', '14 people viewed your profile', 'See who is looking at you.'),
  note(J, 'Alert', 'noreply', 'Your password will NOT expire', 'No action is needed. Nothing is happening.'),

  person(J, 'Work', 'All Staff', 'RE: RE: RE: Please stop replying all',
    'Please remove me from this list. Also, everyone, please stop replying all. Thank you. Sent from my phone.'),
  person(J, 'Work', 'All Staff', 'RE: Whose lunch is in the fridge?',
    'Not mine. Replying to all so everyone knows it is not mine. Has anyone checked the freezer?'),
  person(J, 'Work', 'Printer', 'Low cyan',
    'The office printer is low on cyan again. Everything will print slightly orange until somebody notices.'),
  person(J, 'Work', 'Team Fun Committee', 'Mandatory fun this Friday',
    'Trust falls at 4pm. Attendance will be taken. Please bring a positive attitude and a dish to share.'),
  person(J, 'Calendar', 'Calendar Robot', 'Reminder: reminder about reminders',
    'Starts in 5 minutes. This is a reminder that your reminder about reminders is coming up soon.'),
  person(J, 'Personal', 'Old Gym Buddy', 'FWD: FWD: funny cat video',
    'You have to see this one. Trust me. Skip to the cat at 0:42. Forward to 10 friends for good luck.'),

  receipt('CoffeeCart', 'Your receipt', '$5.75', '1 oat latte, extra hot'),
  receipt('RideNow', 'Your Tuesday trip', '$14.20', 'Downtown to Home, 18 minutes'),
  receipt('TuneBox', 'Your TuneBox receipt', '$59.00', 'Annual music plan'),
  parcel(J, 'ParcelPost', 'Your package is out for delivery', 2, false, 'Arriving today by 8pm'),
  parcel(J, 'ParcelPost', 'Your package was delivered', 3, false, 'Left at the front door'),

  // ---------------------------------------------------------------- real
  // Three with a whole paragraph, and replies as long as the round-two cards take (four lines), to see how
  // long mail and long answers look (asked for on 2026-11-11).
  person(R, 'Work', 'Maya (design lead)', 'Feedback on the new onboarding flow',
    "I went through the whole flow on my phone last night. The first two screens feel great, but the permissions step still loses people: it asks for three things at once and the copy reads like a legal notice. Could we split it up and soften the wording before Thursday's review? I sketched a version, it's in the shared folder.",
    'Love the sketch! Splitting it up makes total sense. Let us pair on the copy tomorrow morning', 'Thanks for testing it. Thursday is tight, can we ship the split now and fix the copy next week?'),
  person(R, 'Personal', 'Aunt Rosa', 'Family reunion at the lake this July',
    "We finally booked the cabins by the lake for the last weekend of July! Everyone is coming, even Uncle Teo from Lisbon. There's room for you and anyone you'd like to bring. We'll do the big barbecue on Saturday and the boat race on Sunday morning. Let me know by the end of the month so I can sort out the beds.",
    'We would love to come! Count us in for the whole weekend, and I will bring the lemon cake', 'Sounds wonderful, but July is packed for us. Could we join just for the Saturday barbecue?'),
  person(R, 'Work', 'Chris from Finance', 'Q3 budget needs your sign-off by Friday',
    "Attached is the Q3 budget for your team. Travel is up about 12% on last quarter, mostly the two conference trips, and software is down now that we cancelled the old analytics tool. If the numbers look right, just reply to approve. If anything looks off, let me know and we can go through it line by line before Friday.",
    'Looks right to me, approved. Thanks for pulling it together so quickly, Chris', 'Travel looks high. Can we go through the conference costs together on Thursday?'),
  person(R, 'Personal', 'Mom', 'Dinner on Sunday?',
    "Dad is making the lasagna again. Can you bring a salad? Your sister says she'll be late, as usual. Love you!",
    'Yes! I will bring the salad, and something for dessert', "Can't make it this week, sorry. Save me some lasagna?"),
  person(R, 'Personal', 'Dr. Okafor', 'Your test results are ready',
    'Good news: everything came back normal. The details are in your patient portal. Happy to talk it through.',
    'Thank you, that is such a relief!', 'Thanks! Could we go through the details on a quick call?'),
  person(R, 'Personal', 'Sam', 'Are we still on for Saturday?',
    'I booked the court for 10. Bring the good racket, not the one with the broken string. Coffee after?',
    'Yes! See you at 10, good racket and all. Coffee is on me', 'Can we move it? Saturday got busy. Sunday instead?'),
  person(R, 'Personal', 'Landlord', 'Water off Thursday 9 to 11',
    'The plumber is fixing the main line. Please fill a jug the night before. Sorry for the hassle!',
    'Thanks for the heads up, I will fill a jug the night before', 'Thursday is tricky for me. Could it be Friday instead?'),
  person(R, 'Personal', 'School Office', 'Pickup change tomorrow',
    'Early release at 1:30 for teacher training. Please let us know if someone else will be picking up.',
    'Got it, I will be there at 1:30', 'Thanks! My partner will pick up this time'),
  person(R, 'Personal', 'Vet Clinic', 'Biscuit is due for her shots',
    "Biscuit's yearly vaccines are due this month. Reply with a time that works and we'll book her in.",
    'Tuesday morning works. Biscuit says woof', 'Could we do next week? Any morning is fine'),
  person(R, 'Personal', 'Grandpa', 'How do I unmute myself',
    'I am on the video call and everyone is waving at me. Please call when you can. Is it the little red button?',
    'Calling you now, Grandpa! Hang tight', 'Click the little microphone at the bottom. The red one means you are muted!'),
  person(R, 'Work', 'Priya (your manager)', 'Can you review my deck by 9am?',
    "It's only 12 slides, I promise. Mostly I need a second pair of eyes on the numbers in section 3 before the board sees it.",
    'On it! Notes on section 3 by 9am', 'Swamped this morning. Can I get it back to you by noon?'),
  person(R, 'Work', 'Lena from Payroll', 'Action needed: confirm your details',
    'Please confirm your bank details before payday on the 28th. It takes about two minutes in the HR portal.',
    'Done, confirmed in the portal. Thanks Lena', 'My details changed recently. Can you give me a call?'),
  person(R, 'Work', 'Biggest Client', 'Contract signed!',
    'Thrilled to get started with you. Our team is free Monday or Tuesday for a kickoff. Which works better?',
    'Thrilled to be working together! Monday works for a kickoff', 'Thank you so much! I will send a few times shortly'),
  person(R, 'Work', 'Jordan', 'Offer letter attached',
    'We would love to have you on the team. The offer letter is attached; let me know if you have any questions at all.',
    'I accept! Thank you, I cannot wait to start', 'Thank you! Before I sign, could we talk about the numbers?'),
  person(R, 'Work', 'Alex (teammate)', 'Prod is down, can you look?',
    "Checkout has been throwing errors since the last deploy. Paging you as well. I'm rolling back now.",
    'Looking now. Hold the rollback for two minutes', 'I am out today, sorry! Sam is on call and knows checkout'),
  note(R, 'Alert', 'Bank of Maple', 'Unusual sign in on your account',
    'New device in Lisbon at 2:14am. Was this you?', 'Yes, that was me. On holiday in Lisbon!', 'That was NOT me. Please lock the account now'),
  note(R, 'Alert', 'Airline', 'Your flight was moved to 6:10am',
    'Check in opens tonight at 6pm.', 'OK, 6:10 it is. Checking in tonight', 'That is way too early. Please rebook me on a later flight'),
  parcel(R, 'ParcelPost', 'Delivery failed: signature needed', 2, true, 'Choose a new delivery time.',
    'Please try again tomorrow, I will be home all day', "No worries, I'll pick it up from the depot"),
  bill('City Power', 'Your electric bill is ready', '$84.10', 'DUE FRI 14 NOV', 'Autopay is off for this account.',
    false, 'Paying it now, and turning autopay back on', 'Remind me on Thursday please'),
  bill('Mobile Plus', 'Payment failed for your phone bill', '$45.00', 'PAYMENT FAILED', 'Your card was declined.',
    true, "Sorry about that! I'll update my card today", 'Please try the card again, it should go through now'),
];

/**
 * What the player "says" into the mic in round two: a mock dictation for now, typed out on screen
 * word by word as if it were being heard. One per real email, and a polite no for the rest.
 */
const Dictated: Record<string, string> = {
  'Feedback on the new onboarding flow': 'Thanks Maya, this is really useful. Splitting the permissions step is a great call. Let us go through your sketch first thing tomorrow.',
  'Family reunion at the lake this July': 'Aunt Rosa, we would not miss it! Put us down for the whole weekend. I will bring the lemon cake and the kids want in on the boat race.',
  'Q3 budget needs your sign-off by Friday': 'Thanks Chris, the numbers look right to me. The travel bump is the two conferences, so I am happy to approve it as it is.',
  'Dinner on Sunday?': 'Sounds perfect, I will bring a big salad and the good bread. Tell Dad no burnt edges this time!',
  'Your test results are ready': 'That is great news, thank you so much for letting me know so quickly.',
  'Are we still on for Saturday?': 'Still on! Ten o clock, good racket, and the coffee after is my treat.',
  'Water off Thursday 9 to 11': 'No problem at all, thanks for the warning. I will fill up a few jugs on Wednesday night.',
  'Pickup change tomorrow': 'Thanks for letting me know. I will be at the gate at one thirty.',
  'Biscuit is due for her shots': 'Could we book her in for Tuesday morning? She will be very brave, probably.',
  'How do I unmute myself': 'Hi Grandpa, it is the little microphone button at the bottom. I am calling you right now!',
  'Can you review my deck by 9am?': 'On it. I will go through section three tonight and send notes before nine.',
  'Action needed: confirm your details': 'All done, I have confirmed everything in the portal. Thanks for the reminder.',
  'Contract signed!': 'We are so excited to get started! Monday works great for the kickoff.',
  'Offer letter attached': 'Thank you so much, I am delighted to accept. When can I start?',
  'Prod is down, can you look?': 'Looking at it now. Go ahead with the rollback and I will check the logs.',
  'Unusual sign in on your account': 'That was not me. Please lock the account and send me a reset link.',
  'Your flight was moved to 6:10am': 'Six ten is very early. Is there anything later in the morning?',
  'Delivery failed: signature needed': 'Please redeliver tomorrow, someone will be home all day to sign.',
  'Your electric bill is ready': 'Paying it now. Please switch autopay back on for this account.',
  'Payment failed for your phone bill': 'Sorry about that, I have updated my card. Please try it again.',
};
export function dictation(email: Email): string {
  return Dictated[email.subject] ?? 'Please take me off this list. Thank you, and have a lovely day.';
}
