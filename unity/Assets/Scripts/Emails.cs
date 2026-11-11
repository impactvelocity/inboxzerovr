using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    public enum EmailKind { Junk, Real }

    /// What sort of email it is. The card is laid out for its type and wears it
    /// as a coloured tag, the way a mail app sorts an inbox into tabs. It is a
    /// hint, not the answer: most types hold both junk and things that need a reply.
    public enum Category { Work, Personal, Newsletter, Spam, Promo, Receipt, Bill, Tracking, Social, Calendar, Alert }

    public static class Categories
    {
        public static string Label(Category category) => category.ToString().ToUpper();

        public static Color Tint(Category category)
        {
            switch (category)
            {
                case Category.Work: return Look.Hex(0x4aa8ff);
                case Category.Personal: return Look.Hex(0xff6ec7);
                case Category.Newsletter: return Look.Hex(0xb388ff);
                case Category.Spam: return Look.Hex(0xff4d6d);
                case Category.Promo: return Look.Hex(0xffa24a);
                case Category.Receipt: return Look.Hex(0x5eead4);
                case Category.Bill: return Look.Hex(0xffd24a);
                case Category.Tracking: return Look.Hex(0xa3e635);
                case Category.Social: return Look.Hex(0xc084fc);
                case Category.Calendar: return Look.Hex(0x7dd3fc);
                default: return Look.Hex(0xff8a4a);
            }
        }
    }

    public class Email
    {
        public string from, subject;
        /// One line: the gist (spam, alerts, social), or the detail under an amount.
        public string snippet;
        /// People's emails: the start of the message, shown cut to three lines.
        public string body;
        /// Newsletters and offers: the sections of the mock email that scrolls by.
        public string[] items;
        /// Receipts and bills.
        public string amount, due;
        /// Deliveries: 0 ordered, 1 shipped, 2 on its way, 3 delivered.
        public int step;
        /// A bill or a delivery that went wrong.
        public bool failed;
        public EmailKind kind;
        public Category category;
        /// Two ready-made replies offered in round 2.
        public string[] replies;
    }

    /// The fictional inbox. Every sender and company here is made up.
    ///
    /// Junk should be destroyed. Real should be kept. Each one has to be
    /// readable at a glance, so the sender and the subject carry the decision.
    public static class Emails
    {
        static readonly string[] NoThanks = { "Unsubscribe me", "Not interested" };

        static Email Make(EmailKind kind, Category category, string from, string subject, string[] replies) =>
            new Email { kind = kind, category = category, from = from, subject = subject, replies = replies ?? NoThanks };

        /// From a person: subject, who, and the first lines of the message.
        static Email Person(EmailKind kind, Category category, string from, string subject, string body,
            string a = null, string b = null)
        {
            var email = Make(kind, category, from, subject, a == null ? null : new[] { a, b });
            email.body = body;
            return email;
        }

        /// A newsletter or an offer: a mock email that scrolls by. The first
        /// item is its headline.
        static Email Letter(Category category, string from, string subject, params string[] items)
        {
            var email = Make(EmailKind.Junk, category, from, subject, null);
            email.items = items;
            return email;
        }

        static Email Receipt(string from, string subject, string amount, string detail)
        {
            var email = Make(EmailKind.Junk, Category.Receipt, from, subject, null);
            email.amount = amount;
            email.snippet = detail;
            return email;
        }

        static Email Bill(string from, string subject, string amount, string due, string detail, bool failed,
            string a, string b)
        {
            var email = Make(EmailKind.Real, Category.Bill, from, subject, new[] { a, b });
            email.amount = amount;
            email.due = due;
            email.snippet = detail;
            email.failed = failed;
            return email;
        }

        static Email Parcel(EmailKind kind, string from, string subject, int step, bool failed, string detail,
            string a = null, string b = null)
        {
            var email = Make(kind, Category.Tracking, from, subject, a == null ? null : new[] { a, b });
            email.step = step;
            email.failed = failed;
            email.snippet = detail;
            return email;
        }

        /// One line of gist: spam, alerts, social.
        static Email Note(EmailKind kind, Category category, string from, string subject, string gist,
            string a = null, string b = null)
        {
            var email = Make(kind, category, from, subject, a == null ? null : new[] { a, b });
            email.snippet = gist;
            return email;
        }

        const EmailKind J = EmailKind.Junk, R = EmailKind.Real;

        public static readonly List<Email> All = new List<Email>
        {
            // ------------------------------------------------------------ junk
            Letter(Category.Promo, "SockDrawer Deals", "70% OFF ends at MIDNIGHT!!!",
                "THE SOCK EVENT OF THE YEAR", "Wool crew socks, now $4 a pair", "Mystery bundle: 12 surprise pairs",
                "Free shipping on orders over $80", "Your cart misses you. Come back."),
            Letter(Category.Promo, "Webinar Wizard", "Last chance: 10x your synergy",
                "LIVE THIS THURSDAY AT NOON", "Synergy secrets of the pros", "Only 3 seats left (of 4,000)",
                "Bonus: a free PDF about PDFs"),
            Letter(Category.Promo, "Fitness Barn", "We miss you! Come back",
                "IT HAS BEEN 412 DAYS", "Rejoin today for just $1", "Spin class now starts at 5:30am",
                "Your locker misses you too"),
            Letter(Category.Promo, "Survey Team", "Rate your recent survey",
                "HOW DID WE DO?", "Question 1 of 87", "It only takes about 25 minutes", "Win a $5 voucher (maybe)"),
            Letter(Category.Promo, "CloudBox", "You are using 2% of your storage",
                "UPGRADE TO CLOUDBOX PRO", "2 TB of space for your 3 photos", "Now with AI-powered folders",
                "Just $119 a year, billed today"),
            Letter(Category.Promo, "Mattress Planet", "Dylan, still thinking it over?",
                "STILL THINKING IT OVER?", "You looked at a mattress once", "Sleep on it: 100 nights free",
                "Matching pillows from $29"),
            Letter(Category.Promo, "Pizza Palace", "Buy 9 pizzas, get 1 free",
                "THIS WEEKEND ONLY", "Buy 9 pizzas, get the 10th free", "New: stuffed pineapple crust",
                "Order now in the app"),
            Letter(Category.Promo, "AppStore Reviews", "Enjoying Flashlight Pro?",
                "LEAVE US 5 STARS", "Rate Flashlight Pro today", "It lights up your life", "Tap a star below"),
            Letter(Category.Newsletter, "The Daily Digest", "Your digest of digests",
                "TODAY IN DIGESTS", "47 newsletters, summarised for you", "Why summaries are the future",
                "This week's top 10 top-10 lists", "Reader mail: please, more lists"),
            Letter(Category.Newsletter, "Growth Hacks Weekly", "7 morning habits of CEOs",
                "7 MORNING HABITS OF CEOS", "1. Wake up before the sun", "2. Think about synergy",
                "Number 4 will shock you", "Sponsored: the ice bath of the week"),
            Letter(Category.Newsletter, "Horoscope Hub", "Mercury is in your inbox",
                "YOUR WEEK AHEAD", "Mercury is in your inbox", "Avoid email today", "Your lucky number is 0"),
            Letter(Category.Newsletter, "Vendor Newsletter", "Our Q3 thought leadership",
                "Q3 THOUGHT LEADERSHIP", "A 40 page PDF is attached", "Leading thoughts since 2009",
                "Watch the webinar replay"),

            Note(J, Category.Spam, "Prince Adewale", "URGENT business proposal", "I wish to transfer $9,000,000 to you."),
            Note(J, Category.Spam, "Crypto Kevin", "This coin is going to the MOON", "Do not tell anyone else about this."),
            Note(J, Category.Spam, "Sales Bot 3000", "Quick question", "Do you have 15 minutes this week?"),
            Note(J, Category.Spam, "Sales Bot 3000", "Bumping this to the top", "Just following up on my follow up."),
            Note(J, Category.Spam, "Free Cruise Center", "You WON a free cruise", "Claim it in the next 4 minutes."),
            Note(J, Category.Spam, "Conference Spam", "Call for papers: Blockchain Yoga", "Submit your abstract by Friday."),
            Note(J, Category.Social, "LinkUp", "14 people viewed your profile", "See who is looking at you."),
            Note(J, Category.Alert, "noreply", "Your password will NOT expire", "No action is needed. Nothing is happening."),

            Person(J, Category.Work, "All Staff", "RE: RE: RE: Please stop replying all",
                "Please remove me from this list. Also, everyone, please stop replying all. Thank you. Sent from my phone."),
            Person(J, Category.Work, "All Staff", "RE: Whose lunch is in the fridge?",
                "Not mine. Replying to all so everyone knows it is not mine. Has anyone checked the freezer?"),
            Person(J, Category.Work, "Printer", "Low cyan",
                "The office printer is low on cyan again. Everything will print slightly orange until somebody notices."),
            Person(J, Category.Work, "Team Fun Committee", "Mandatory fun this Friday",
                "Trust falls at 4pm. Attendance will be taken. Please bring a positive attitude and a dish to share."),
            Person(J, Category.Calendar, "Calendar Robot", "Reminder: reminder about reminders",
                "Starts in 5 minutes. This is a reminder that your reminder about reminders is coming up soon."),
            Person(J, Category.Personal, "Old Gym Buddy", "FWD: FWD: funny cat video",
                "You have to see this one. Trust me. Skip to the cat at 0:42. Forward to 10 friends for good luck."),

            Receipt("CoffeeCart", "Your receipt", "$5.75", "1 oat latte, extra hot"),
            Receipt("RideNow", "Your Tuesday trip", "$14.20", "Downtown to Home, 18 minutes"),
            Receipt("TuneBox", "Your TuneBox receipt", "$59.00", "Annual music plan"),
            Parcel(J, "ParcelPost", "Your package is out for delivery", 2, false, "Arriving today by 8pm"),
            Parcel(J, "ParcelPost", "Your package was delivered", 3, false, "Left at the front door"),

            // ------------------------------------------------------------ real
            Person(R, Category.Personal, "Mom", "Dinner on Sunday?",
                "Dad is making the lasagna again. Can you bring a salad? Your sister says she'll be late, as usual. Love you!",
                "Yes! See you Sunday", "Can't make it, sorry"),
            Person(R, Category.Personal, "Dr. Okafor", "Your test results are ready",
                "Good news: everything came back normal. The details are in your patient portal. Happy to talk it through.",
                "Thank you!", "Can we talk it through?"),
            Person(R, Category.Personal, "Sam", "Are we still on for Saturday?",
                "I booked the court for 10. Bring the good racket, not the one with the broken string. Coffee after?",
                "Yes, see you at 10", "Need to reschedule"),
            Person(R, Category.Personal, "Landlord", "Water off Thursday 9 to 11",
                "The plumber is fixing the main line. Please fill a jug the night before. Sorry for the hassle!",
                "Thanks for the heads up", "Could it be Friday?"),
            Person(R, Category.Personal, "School Office", "Pickup change tomorrow",
                "Early release at 1:30 for teacher training. Please let us know if someone else will be picking up.",
                "Got it, I will be there", "Someone else will pick up"),
            Person(R, Category.Personal, "Vet Clinic", "Biscuit is due for her shots",
                "Biscuit's yearly vaccines are due this month. Reply with a time that works and we'll book her in.",
                "Book Tuesday morning", "Next week, please"),
            Person(R, Category.Personal, "Grandpa", "How do I unmute myself",
                "I am on the video call and everyone is waving at me. Please call when you can. Is it the little red button?",
                "Calling you now", "Click the mic icon!"),
            Person(R, Category.Work, "Priya (your manager)", "Can you review my deck by 9am?",
                "It's only 12 slides, I promise. Mostly I need a second pair of eyes on the numbers in section 3 before the board sees it.",
                "On it, done by 9", "Can it wait till noon?"),
            Person(R, Category.Work, "Lena from Payroll", "Action needed: confirm your details",
                "Please confirm your bank details before payday on the 28th. It takes about two minutes in the HR portal.",
                "Confirmed, thanks", "Details changed, call me"),
            Person(R, Category.Work, "Biggest Client", "Contract signed!",
                "Thrilled to get started with you. Our team is free Monday or Tuesday for a kickoff. Which works better?",
                "Thrilled! Kickoff Monday?", "Thank you, more soon"),
            Person(R, Category.Work, "Jordan", "Offer letter attached",
                "We would love to have you on the team. The offer letter is attached; let me know if you have any questions at all.",
                "I accept!", "Can we talk numbers?"),
            Person(R, Category.Work, "Alex (teammate)", "Prod is down, can you look?",
                "Checkout has been throwing errors since the last deploy. Paging you as well. I'm rolling back now.",
                "Looking now", "I am out, try Sam"),
            Note(R, Category.Alert, "Bank of Maple", "Unusual sign in on your account",
                "New device in Lisbon at 2:14am. Was this you?", "Yes, that was me", "Not me. Lock it!"),
            Note(R, Category.Alert, "Airline", "Your flight was moved to 6:10am",
                "Check in opens tonight at 6pm.", "OK, checking in", "Please rebook me"),
            Parcel(R, "ParcelPost", "Delivery failed: signature needed", 2, true, "Choose a new delivery time.",
                "Redeliver tomorrow", "I'll pick it up"),
            Bill("City Power", "Your electric bill is ready", "$84.10", "DUE FRI 14 NOV", "Autopay is off for this account.",
                false, "Pay it now", "Remind me Thursday"),
            Bill("Mobile Plus", "Payment failed for your phone bill", "$45.00", "PAYMENT FAILED", "Your card was declined.",
                true, "I'll fix it today", "Try the card again"),
        };
    }
}
