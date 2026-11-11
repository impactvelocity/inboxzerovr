using System;
using System.Collections.Generic;

namespace InboxZero
{
    public enum Phase { Home, Intro1, Review, Intro2, Work, Done }
    public enum ReviewAction { Destroy, Keep }
    public enum WorkAction { Reply, Dictate, Later }

    public class Verdict
    {
        /// False only for destroying an email that needed a reply.
        public bool correct;
        public string headline; // shown at the card
        public bool finished;   // that was the last email of this round
    }

    /// One sitting of Inbox Zero. No rendering in here: just the rules.
    ///
    ///   Home    the start screen
    ///   Intro1  "get ready" text
    ///   Review  Round 1. Emails arrive one at a time: destroy it or keep it.
    ///   Intro2  "get ready" text (skipped when nothing was kept)
    ///   Work    Round 2. Each kept email again: send a ready-made reply,
    ///           dictate one, or leave it for tomorrow.
    ///   Done    summary, then back to home
    public class Session
    {
        public Phase phase = Phase.Home;
        public List<Email> deck = new List<Email>();
        public int index;
        /// Emails kept in round 1, in order: the deck of round 2.
        public List<Email> keptEmails = new List<Email>();
        public int workIndex;
        public int streak;   // decisions in a row without a mistake
        public int bestStreak;
        public int mistakes; // real emails destroyed
        public int destroyed, kept, replied, dictated, later;

        public int Remaining =>
            phase == Phase.Review ? deck.Count - index :
            phase == Phase.Work ? keptEmails.Count - workIndex : 0;

        /// S for a clean run, then A, B, C as needed emails get destroyed.
        public string Rank => mistakes == 0 ? "S" : mistakes == 1 ? "A" : mistakes == 2 ? "B" : "C";

        public Email Current
        {
            get
            {
                if (phase == Phase.Review) return index < deck.Count ? deck[index] : null;
                if (phase == Phase.Work) return workIndex < keptEmails.Count ? keptEmails[workIndex] : null;
                return null;
            }
        }

        static Func<double> Mulberry32(uint seed)
        {
            uint a = seed;
            return () =>
            {
                unchecked
                {
                    a += 0x6D2B79F5u;
                    uint t = a;
                    t = (t ^ (t >> 15)) * (t | 1u);
                    t ^= t + (t ^ (t >> 7)) * (t | 61u);
                    return (t ^ (t >> 14)) / 4294967296.0;
                }
            };
        }

        static List<T> Shuffle<T>(List<T> items, Func<double> rng)
        {
            for (int i = items.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(rng() * (i + 1));
                (items[i], items[j]) = (items[j], items[i]);
            }
            return items;
        }

        /// Home -> the round 1 intro.
        public void Start(uint seed, int roundSize, float junkShare)
        {
            var rng = Mulberry32(seed);
            int size = Math.Max(1, roundSize);
            int junkCount = Math.Min(size, (int)Math.Round(size * junkShare, MidpointRounding.AwayFromZero));
            var junk = Shuffle(Emails.All.FindAll(e => e.kind == EmailKind.Junk), rng);
            var real = Shuffle(Emails.All.FindAll(e => e.kind == EmailKind.Real), rng);
            var next = new List<Email>();
            for (int i = 0; i < junkCount; i++) next.Add(junk[i % junk.Count]);
            for (int i = 0; i < size - junkCount; i++) next.Add(real[i % real.Count]);
            deck = Shuffle(next, rng);
            index = 0;
            keptEmails = new List<Email>();
            workIndex = 0;
            streak = bestStreak = mistakes = destroyed = kept = replied = dictated = later = 0;
            phase = Phase.Intro1;
        }

        public void BeginReview() { if (phase == Phase.Intro1) phase = Phase.Review; }
        public void BeginWork() { if (phase == Phase.Intro2) phase = Phase.Work; }
        public void GoHome() { phase = Phase.Home; }

        /// Put the current email at the back of its round, undecided, to come
        /// round again. Nothing is counted and the streak is left alone.
        public bool Defer()
        {
            var pile = phase == Phase.Review ? deck : phase == Phase.Work ? keptEmails : null;
            int at = phase == Phase.Review ? index : workIndex;
            if (pile == null || at >= pile.Count) return false;
            var email = pile[at];
            pile.RemoveAt(at);
            pile.Add(email);
            return true;
        }

        /// Round 1: destroy or keep the current email.
        public Verdict Review(ReviewAction action)
        {
            if (phase != Phase.Review) return null;
            var email = Current;
            if (email == null) return null;
            bool correct = true;
            string headline;
            if (action == ReviewAction.Destroy)
            {
                destroyed++;
                correct = email.kind == EmailKind.Junk;
                headline = correct ? "DESTROYED" : "OOPS! YOU NEEDED THAT";
            }
            else
            {
                kept++;
                keptEmails.Add(email);
                headline = "KEPT";
            }
            if (correct) streak++;
            else { streak = 0; mistakes++; }
            bestStreak = Math.Max(bestStreak, streak);
            index++;
            bool finished = index >= deck.Count;
            if (finished) phase = keptEmails.Count > 0 ? Phase.Intro2 : Phase.Done;
            return new Verdict { correct = correct, headline = headline, finished = finished };
        }

        /// Round 2: deal with the current kept email.
        public Verdict Work(WorkAction action)
        {
            if (phase != Phase.Work || Current == null) return null;
            string headline = "SENT";
            if (action == WorkAction.Reply) replied++;
            else if (action == WorkAction.Dictate) dictated++;
            else { later++; headline = "TOMORROW"; }
            streak++;
            bestStreak = Math.Max(bestStreak, streak);
            workIndex++;
            bool finished = workIndex >= keptEmails.Count;
            if (finished) phase = Phase.Done;
            return new Verdict { correct = true, headline = headline, finished = finished };
        }
    }
}
