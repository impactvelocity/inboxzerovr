/**
 * The fictional inbox. Every sender and company here is made up.
 *
 * `junk` should be destroyed. `real` should be sorted (kept or saved for
 * tomorrow). Each one has to be readable at a glance, so the sender and the
 * subject carry the decision and the snippet is only flavour.
 */
export type EmailKind = 'junk' | 'real';

export interface Email {
  from: string;
  subject: string;
  snippet: string;
  kind: EmailKind;
  /** Two ready-made replies offered in round 2. */
  replies: [string, string];
}

const junk = (from: string, subject: string, snippet: string): Email => ({
  from,
  subject,
  snippet,
  kind: 'junk',
  replies: ['Unsubscribe me', 'Not interested'],
});
const real = (
  from: string,
  subject: string,
  snippet: string,
  replies: [string, string],
): Email => ({ from, subject, snippet, kind: 'real', replies });

export const EMAILS: Email[] = [
  junk('SockDrawer Deals', '70% OFF ends at MIDNIGHT!!!', 'Your cart misses you.'),
  junk('Webinar Wizard', 'Last chance: 10x your synergy', 'Seats are filling up fast.'),
  junk('LinkUp', '14 people viewed your profile', 'See who is looking at you.'),
  junk('Prince Adewale', 'URGENT business proposal', 'I wish to transfer $9,000,000.'),
  junk('Fitness Barn', 'We miss you! Come back', 'It has been 412 days.'),
  junk('Crypto Kevin', 'This coin is going to the MOON', 'Do not tell anyone else.'),
  junk('The Daily Digest', 'Your digest of digests', '47 newsletters, summarised.'),
  junk('Survey Team', 'Rate your recent survey', 'It only takes 25 minutes.'),
  junk('All Staff', 'RE: RE: RE: Please stop replying all', 'Please remove me from this list.'),
  junk('All Staff', 'RE: Whose lunch is in the fridge?', 'Not mine. Replying to all.'),
  junk('CloudBox', 'You are using 2% of your storage', 'Upgrade to Pro today.'),
  junk('Mattress Planet', 'Dylan, still thinking it over?', 'You looked at a mattress once.'),
  junk('Growth Hacks Weekly', '7 morning habits of CEOs', 'Number 4 will shock you.'),
  junk('noreply', 'Your password will NOT expire', 'No action is needed.'),
  junk('Sales Bot 3000', 'Quick question', 'Do you have 15 minutes this week?'),
  junk('Sales Bot 3000', 'Bumping this to the top', 'Just following up on my follow up.'),
  junk('Free Cruise Center', 'You WON a free cruise', 'Claim it in the next 4 minutes.'),
  junk('Pizza Palace', 'Buy 9 pizzas, get 1 free', 'This weekend only.'),
  junk('AppStore Reviews', 'Enjoying Flashlight Pro?', 'Leave us five stars.'),
  junk('Horoscope Hub', 'Mercury is in your inbox', 'Avoid email today.'),
  junk('Conference Spam', 'Call for papers: Blockchain Yoga', 'Submit by Friday.'),
  junk('Printer', 'Low cyan', 'The office printer is low on cyan again.'),
  junk('Calendar Robot', 'Reminder: reminder about reminders', 'Starts in 5 minutes.'),
  junk('Team Fun Committee', 'Mandatory fun this Friday', 'Trust falls at 4pm.'),
  junk('Vendor Newsletter', 'Our Q3 thought leadership', 'A 40 page PDF is attached.'),
  junk('Old Gym Buddy', 'FWD: FWD: funny cat video', 'You have to see this one.'),

  real('Mom', 'Dinner on Sunday?', 'Dad is making the lasagna.', ['Yes! See you Sunday', 'Can\'t make it, sorry']),
  real('Priya (your manager)', 'Can you review my deck by 9am?', 'It is short, I promise.', ['On it, done by 9', 'Can it wait till noon?']),
  real('Bank of Maple', 'Unusual sign in on your account', 'Was this you?', ['Yes, that was me', 'Not me. Lock it!']),
  real('Dr. Okafor', 'Your test results are ready', 'All good. Details inside.', ['Thank you!', 'Can we talk it through?']),
  real('Sam', 'Are we still on for Saturday?', 'I booked the court for 10.', ['Yes, see you at 10', 'Need to reschedule']),
  real('Lena from Payroll', 'Action needed: confirm your details', 'Due before payday.', ['Confirmed, thanks', 'Details changed, call me']),
  real('Landlord', 'Water off Thursday 9 to 11', 'Plumber is fixing the main.', ['Thanks for the heads up', 'Could it be Friday?']),
  real('Biggest Client', 'Contract signed!', 'Excited to get started with you.', ['Thrilled! Kickoff Monday?', 'Thank you, more soon']),
  real('School Office', 'Pickup change tomorrow', 'Early release at 1:30.', ['Got it, I will be there', 'Someone else will pick up']),
  real('Jordan', 'Offer letter attached', 'We would love to have you.', ['I accept!', 'Can we talk numbers?']),
  real('Airline', 'Your flight was moved to 6:10am', 'Check in opens tonight.', ['OK, checking in', 'Please rebook me']),
  real('Alex (teammate)', 'Prod is down, can you look?', 'Paging you as well.', ['Looking now', 'I am out, try Sam']),
  real('Vet Clinic', 'Biscuit is due for her shots', 'Reply to book a time.', ['Book Tuesday morning', 'Next week, please']),
  real('Grandpa', 'How do I unmute myself', 'Please call when you can.', ['Calling you now', 'Click the mic icon!']),
];
