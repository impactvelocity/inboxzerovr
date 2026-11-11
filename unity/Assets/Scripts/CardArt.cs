using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    /// 2D drawing for the emails, the HUD and the buttons. Every function fills
    /// the whole texture it is given.
    ///
    /// The style: dark glass panels with corners cut in pixel-art steps, display
    /// text in the chunky PixelFont, and email content in a clean sans so it
    /// reads at a glance.
    public static class CardArt
    {
        static readonly Color Edge = Look.Hex(0x4b3f7d);
        static readonly Color Ink = Look.Hex(0x16081a);     // dark text on bright fills
        static readonly Color Outline = Look.Hex(0x0a0614); // around display text
        static readonly Color Soft = Look.Hex(0xd6def5);    // second-level text
        static readonly Color Green = Look.Hex(0x5dffa1);

        /// Where the scrolling preview sits on a newsletter card, in card pixels.
        public static readonly Rect ScrollWindow = new Rect(56, 236, 912, 362);
        /// The height of the tall texture that scrolls through that window.
        public const int ScrollHeight = 1440;

        public static bool Scrolls(Email email) =>
            email.category == Category.Newsletter || email.category == Category.Promo;

        static int HueOf(string name)
        {
            uint hash = 0;
            foreach (char c in name) hash = unchecked(hash * 31 + c);
            return (int)(hash % 360);
        }

        static string Initials(string name)
        {
            var letters = "";
            foreach (char c in name) if (char.IsUpper(c) && letters.Length < 2) letters += c;
            return letters.Length > 0 ? letters : name.Substring(0, 1).ToUpper();
        }

        /// A made-up time of day, the same for the same email.
        static string TimeOf(Email email)
        {
            int hash = HueOf(email.subject + email.from);
            int hour = 7 + hash % 11, minute = (hash * 7) % 60;
            return $"{(hour > 12 ? hour - 12 : hour)}:{minute:00} {(hour >= 12 ? "PM" : "AM")}";
        }

        static Color Alpha(Color c, float a) => new Color(c.r, c.g, c.b, a);

        static void Panel(Painter p, float x, float y, float w, float h, float step, Color fill, Color edge, float line)
        {
            p.FillNotched(x, y, w, h, step, fill);
            if (line > 0) p.StrokeNotched(x, y, w, h, step, edge, line);
        }

        // ------------------------------------------------------------- icons

        /// A small line icon for an email type, about `s` pixels from centre to edge.
        static void Icon(Painter p, Category category, float cx, float cy, float s, Color c)
        {
            const float line = 4;
            switch (category)
            {
                case Category.Work: // briefcase
                    p.StrokeRoundRect(cx - s, cy - s * 0.5f, s * 2, s * 1.4f, 3, c, line);
                    p.StrokeRoundRect(cx - s * 0.45f, cy - s * 0.95f, s * 0.9f, s * 0.5f, 2, c, line);
                    break;
                case Category.Personal: // a person
                    p.FillCircle(cx, cy - s * 0.45f, s * 0.42f, c);
                    p.FillRoundRect(cx - s * 0.8f, cy + s * 0.15f, s * 1.6f, s * 0.8f, s * 0.4f, c);
                    break;
                case Category.Newsletter: // a page of text
                    p.StrokeRoundRect(cx - s * 0.8f, cy - s, s * 1.6f, s * 2, 2, c, line);
                    for (int i = -1; i <= 1; i++) p.Line(cx - s * 0.4f, cy + i * s * 0.45f, cx + s * 0.4f, cy + i * s * 0.45f, c, line);
                    break;
                case Category.Spam: // no entry
                    p.StrokeCircle(cx, cy, s * 0.95f, c, line);
                    p.Line(cx - s * 0.65f, cy - s * 0.65f, cx + s * 0.65f, cy + s * 0.65f, c, line);
                    break;
                case Category.Receipt: // a ticked slip
                    p.StrokeRoundRect(cx - s * 0.75f, cy - s, s * 1.5f, s * 2, 2, c, line);
                    p.Line(cx - s * 0.38f, cy, cx - s * 0.08f, cy + s * 0.32f, c, line);
                    p.Line(cx - s * 0.08f, cy + s * 0.32f, cx + s * 0.42f, cy - s * 0.32f, c, line);
                    break;
                case Category.Tracking: // a parcel
                    p.StrokeRoundRect(cx - s, cy - s * 0.8f, s * 2, s * 1.6f, 2, c, line);
                    p.Line(cx - s, cy - s * 0.25f, cx + s, cy - s * 0.25f, c, line);
                    p.Line(cx, cy - s * 0.8f, cx, cy - s * 0.25f, c, line);
                    break;
                case Category.Social: // two people
                    p.FillCircle(cx - s * 0.42f, cy - s * 0.3f, s * 0.38f, c);
                    p.FillCircle(cx + s * 0.42f, cy - s * 0.3f, s * 0.38f, c);
                    p.FillRoundRect(cx - s, cy + s * 0.25f, s * 2, s * 0.65f, s * 0.3f, c);
                    break;
                case Category.Calendar:
                    p.StrokeRoundRect(cx - s, cy - s * 0.75f, s * 2, s * 1.7f, 2, c, line);
                    p.Line(cx - s, cy - s * 0.25f, cx + s, cy - s * 0.25f, c, line);
                    p.Line(cx - s * 0.5f, cy - s * 1.05f, cx - s * 0.5f, cy - s * 0.55f, c, line);
                    p.Line(cx + s * 0.5f, cy - s * 1.05f, cx + s * 0.5f, cy - s * 0.55f, c, line);
                    break;
                default: // a sign in a circle: % for offers, $ for bills, ! for alerts
                    p.StrokeCircle(cx, cy, s * 0.95f, c, line);
                    string sign = category == Category.Promo ? "%" : category == Category.Bill ? "$" : "!";
                    p.PixelText(sign, cx + 1, cy, Mathf.Max(2, Mathf.Round(s * 0.18f)), c, Align.Center);
                    break;
            }
        }

        /// The email's type as a tag: icon and name in a notched pill. Returns its width.
        static float Tag(Painter p, Category category, float x, float yMid, bool alignRight)
        {
            Color tint = Categories.Tint(category);
            string label = Categories.Label(category);
            const float cell = 5;
            float w = PixelFont.Width(label, cell) + 92, h = 62;
            float left = alignRight ? x - w : x;
            Panel(p, left, yMid - h / 2, w, h, 5, Alpha(tint, 0.14f), tint, 3);
            Icon(p, category, left + 32, yMid, 14, tint);
            p.PixelText(label, left + 60, yMid, cell, tint);
            return w;
        }

        // ------------------------------------------------------------ emails

        /// An email, laid out for its type.
        public static void EmailCard(Painter p, RenderTexture rt, Email email)
        {
            p.Begin(rt);
            Color tint = Categories.Tint(email.category);
            float w = p.Width, h = p.Height;
            Panel(p, 6, 6, w - 12, h - 12, 12, Look.Glass, tint, 5);
            p.FillRects(new List<Rect> { new Rect(30, 14, w - 60, 4) }, Alpha(Color.white, 0.07f)); // a glint along the top
            switch (email.category)
            {
                case Category.Work:
                case Category.Personal:
                case Category.Calendar: PersonCard(p, email); break;
                case Category.Newsletter:
                case Category.Promo: LetterCard(p, email); break;
                case Category.Receipt: ReceiptCard(p, email, tint); break;
                case Category.Bill: BillCard(p, email, tint); break;
                case Category.Tracking: ParcelCard(p, email, tint); break;
                case Category.Spam: SpamCard(p, email); break;
                default: NoteCard(p, email, tint); break;
            }
            p.End();
        }

        const float M = 56; // margin

        /// From a person: the subject first, then who it is from, then the
        /// first three lines of the message.
        static void PersonCard(Painter p, Email e)
        {
            float w = p.Width;
            Tag(p, e.category, M, 66, false);
            p.Text(TimeOf(e), w - M, 68, 34, false, Look.Dim, Align.Right, Baseline.Middle);
            float y = 184;
            foreach (var line in p.Wrap(e.subject, 72, true, w - 2 * M, 2))
            {
                p.Text(line, M, y, 72, true, Look.Text);
                y += 82;
            }
            float cy = y - 82 + 70;
            p.FillCircle(M + 26, cy, 26, Look.Hsl(HueOf(e.from), 0.7f, 0.62f));
            p.Text(e.from.Substring(0, 1).ToUpper(), M + 26, cy + 2, 30, true, Ink, Align.Center, Baseline.Middle);
            p.Text(e.from, M + 68, cy + 1, 38, true, Soft, Align.Left, Baseline.Middle);
            float by = cy + 76;
            foreach (var line in p.Wrap(e.body ?? e.snippet ?? "", 36, false, w - 2 * M, 3))
            {
                p.Text(line, M, by, 36, false, Look.Dim);
                by += 48;
            }
        }

        /// A company's header: its mark, its name and the type tag.
        static void Brand(Painter p, Email e, Color tint)
        {
            float w = p.Width;
            p.FillNotched(M, 38, 70, 70, 6, tint);
            p.Text(Initials(e.from), M + 35, 75, 30, true, Ink, Align.Center, Baseline.Middle);
            float tagW = Tag(p, e.category, w - M, 73, true);
            p.Text(p.Wrap(e.from, 40, true, w - 2 * M - 110 - tagW, 1)[0], M + 90, 75, 40, true, Look.Text,
                Align.Left, Baseline.Middle);
        }

        /// A newsletter or an offer: who, the subject, and a window onto the
        /// email itself, which scrolls by (see ScrollContent).
        static void LetterCard(Painter p, Email e)
        {
            float w = p.Width;
            Brand(p, e, Categories.Tint(e.category));
            p.Text(p.Wrap(e.subject, 46, true, w - 2 * M, 1)[0], M, 190, 46, true, Soft);
            var win = ScrollWindow;
            Panel(p, win.x - 10, win.y - 8, win.width + 20, win.height + 16, 6, Alpha(Color.white, 0.035f),
                Alpha(Color.white, 0.08f), 2);
        }

        /// The tall mock email that scrolls through a newsletter's window.
        public static void ScrollContent(Painter p, RenderTexture rt, Email e)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            Color tint = Categories.Tint(e.category);
            var items = e.items != null && e.items.Length > 1 ? e.items : new[] { e.subject, e.subject };

            // The hero: a block of colour, the headline in big pixel type, a button.
            float y = 20;
            Panel(p, 0, y, w, 270, 8, Alpha(tint, 0.26f), Alpha(tint, 0.6f), 3);
            p.PixelText(items[0], w / 2, y + 100, 8, Color.white, Align.Center, Outline, Alpha(tint, 0.9f), w - 70);
            string action = e.category == Category.Promo ? "SHOP NOW" : "READ MORE";
            float bw = PixelFont.Width(action, 5) + 64;
            p.FillNotched(w / 2 - bw / 2, y + 176, bw, 58, 5, tint);
            p.PixelText(action, w / 2, y + 205, 5, Ink, Align.Center);
            y += 310;

            int k = 1;
            while (y < h - 230)
            {
                string item = items[k];
                k = k % (items.Length - 1) + 1;
                // A picture, then the section's title and a couple of lines of filler.
                Panel(p, 0, y, 180, 160, 6, Alpha(tint, 0.16f), Alpha(tint, 0.35f), 2);
                Picture(p, 90, y + 80, tint, k);
                float ty = y + 48;
                foreach (var line in p.Wrap(item, 40, true, w - 220, 2))
                {
                    p.Text(line, 212, ty, 40, true, Look.Text);
                    ty += 48;
                }
                p.FillRoundRect(212, ty + 2, w - 240, 14, 7, Alpha(Look.Dim, 0.22f));
                p.FillRoundRect(212, ty + 30, (w - 240) * 0.62f, 14, 7, Alpha(Look.Dim, 0.22f));
                y += 210;
            }
            p.Line(0, y + 10, w, y + 10, Alpha(Look.Dim, 0.25f), 2);
            p.Text("Unsubscribe  ·  View in browser", w / 2, y + 70, 30, false, Alpha(Look.Dim, 0.7f), Align.Center);
            p.End();
        }

        /// A simple shape standing in for a picture in a newsletter.
        static void Picture(Painter p, float cx, float cy, Color tint, int which)
        {
            var c = Alpha(tint, 0.85f);
            switch (which % 3)
            {
                case 0:
                    p.FillCircle(cx, cy, 38, c);
                    break;
                case 1: // hills and a sun
                    p.FillCircle(cx + 34, cy - 30, 16, c);
                    p.Line(cx - 70, cy + 50, cx - 20, cy - 10, c, 10);
                    p.Line(cx - 20, cy - 10, cx + 20, cy + 30, c, 10);
                    p.Line(cx + 20, cy + 30, cx + 70, cy - 20, c, 10);
                    break;
                default:
                    p.FillNotched(cx - 50, cy - 50, 44, 44, 4, c);
                    p.FillNotched(cx + 6, cy - 50, 44, 44, 4, Alpha(tint, 0.5f));
                    p.FillNotched(cx - 50, cy + 6, 44, 44, 4, Alpha(tint, 0.5f));
                    p.FillNotched(cx + 6, cy + 6, 44, 44, 4, c);
                    break;
            }
        }

        static void Dashes(Painter p, float x, float y, float width, Color c)
        {
            var dashes = new List<Rect>();
            for (float d = 0; d < width; d += 28) dashes.Add(new Rect(x + d, y, 16, 3));
            p.FillRects(dashes, c);
        }

        /// A receipt: who, the subject, and the amount, big, with what it was for.
        static void ReceiptCard(Painter p, Email e, Color tint)
        {
            float w = p.Width;
            Brand(p, e, tint);
            p.Text(p.Wrap(e.subject, 48, true, w - 2 * M, 1)[0], M, 196, 48, true, Soft);
            Dashes(p, M, 236, w - 2 * M, Alpha(Look.Dim, 0.35f));
            p.Text(e.amount, M, 388, 124, true, Look.Text);
            p.Text(p.Wrap(e.snippet, 38, false, w - 2 * M, 1)[0], M, 456, 38, false, Look.Dim);
            Panel(p, w - M - 190, 512, 190, 66, 5, Alpha(Green, 0.1f), Green, 4);
            p.PixelText("PAID", w - M - 95, 545, 6, Green, Align.Center);
            p.Text("VISA  ••••  4242", M, 560, 32, false, Alpha(Look.Dim, 0.8f));
        }

        /// A bill: the amount and when it is due.
        static void BillCard(Painter p, Email e, Color tint)
        {
            float w = p.Width;
            Brand(p, e, tint);
            p.Text(p.Wrap(e.subject, 48, true, w - 2 * M, 1)[0], M, 196, 48, true, Soft);
            Dashes(p, M, 236, w - 2 * M, Alpha(Look.Dim, 0.35f));
            p.Text(e.amount, M, 380, 120, true, Look.Text);
            Color due = e.failed ? Look.Coral : tint;
            float dw = PixelFont.Width(e.due, 5) + 60;
            Panel(p, M, 422, dw, 64, 5, Alpha(due, 0.14f), due, 3);
            p.PixelText(e.due, M + 30, 454, 5, due);
            p.Text(p.Wrap(e.snippet, 36, false, w - 2 * M, 1)[0], M, 560, 36, false, Look.Dim);
        }

        /// A delivery: the subject and how far the parcel has got.
        static void ParcelCard(Painter p, Email e, Color tint)
        {
            float w = p.Width;
            Brand(p, e, tint);
            float y = 198;
            foreach (var line in p.Wrap(e.subject, 52, true, w - 2 * M, 2))
            {
                p.Text(line, M, y, 52, true, Look.Text);
                y += 60;
            }
            string[] stages = { "ORDERED", "SHIPPED", "ON ITS WAY", "DELIVERED" };
            float left = M + 70, right = w - M - 70, row = 404;
            float gap = (right - left) / 3;
            Color now = e.failed ? Look.Coral : tint;
            p.Line(left, row, right, row, Alpha(Look.Dim, 0.3f), 6);
            p.Line(left, row, left + gap * e.step, row, tint, 6);
            for (int i = 0; i < 4; i++)
            {
                float x = left + gap * i;
                if (i < e.step) p.FillNotched(x - 14, row - 14, 28, 28, 4, tint);
                else if (i == e.step)
                {
                    p.FillNotched(x - 22, row - 22, 44, 44, 5, Alpha(now, 0.25f));
                    p.StrokeNotched(x - 22, row - 22, 44, 44, 5, now, 5);
                    if (e.failed) p.PixelText("X", x, row, 3, now, Align.Center);
                }
                else p.StrokeNotched(x - 12, row - 12, 24, 24, 3, Alpha(Look.Dim, 0.6f), 3);
                p.PixelText(stages[i], x, row + 58, 4, i == e.step ? now : Alpha(Look.Dim, 0.8f), Align.Center);
            }
            p.Text(p.Wrap(e.snippet, 38, false, w - 2 * M, 1)[0], M, 566, 38, false, e.failed ? Look.Coral : Look.Dim);
        }

        /// An alert or a social ping: the subject and one line in a box.
        static void NoteCard(Painter p, Email e, Color tint)
        {
            float w = p.Width;
            Brand(p, e, tint);
            float y = 214;
            foreach (var line in p.Wrap(e.subject, 62, true, w - 2 * M, 2))
            {
                p.Text(line, M, y, 62, true, Look.Text);
                y += 72;
            }
            float boxY = Mathf.Max(y - 20, 330);
            Panel(p, M, boxY, w - 2 * M, 110, 8, Alpha(tint, 0.1f), Alpha(tint, 0.7f), 3);
            p.FillNotched(M + 24, boxY + 25, 60, 60, 5, tint);
            p.PixelText(e.category == Category.Social ? "+" : "!", M + 54, boxY + 55, 6, Ink, Align.Center);
            foreach (var line in p.Wrap(e.snippet, 36, false, w - 2 * M - 130, 1))
                p.Text(line, M + 108, boxY + 57, 36, false, Soft, Align.Left, Baseline.Middle);
        }

        /// Spam: everything a little smaller and quieter.
        static void SpamCard(Painter p, Email e)
        {
            float w = p.Width, h = p.Height;
            Tag(p, e.category, w - M, 70, true);
            p.FillCircle(M + 20, 70, 20, Look.Hsl(HueOf(e.from), 0.5f, 0.55f));
            p.Text(e.from, M + 54, 72, 32, true, Look.Dim, Align.Left, Baseline.Middle);
            var lines = p.Wrap(e.subject, 56, true, w - 2 * M - 120, 2);
            float y = lines.Count == 1 ? 290 : 250;
            foreach (var line in lines)
            {
                p.Text(line, M, y, 56, true, Look.Text);
                y += 66;
            }
            p.Text(p.Wrap(e.snippet, 32, false, w - 2 * M - 120, 1)[0], M, y + 16, 32, false, Look.Dim);
            Icon(p, Category.Spam, w - M - 70, h - M - 70, 64, Alpha(Categories.Tint(Category.Spam), 0.14f));
        }

        // --------------------------------------------------------- the round

        /// The round's name and a square per email: done ones in the colour of
        /// what happened to them, the current one outlined in white.
        public static void Hud(Painter p, RenderTexture rt, string title, int total, List<Color> marks)
        {
            p.Begin(rt);
            float w = p.Width;
            p.PixelText(title, w / 2, 52, 8, Color.white, Align.Center, Outline);
            float gap = 12, size = Mathf.Min(44, (w - 40) / Mathf.Max(1, total) - gap);
            float row = total * (size + gap) - gap, x = (w - row) / 2, y = 142 - size / 2;
            for (int i = 0; i < total; i++)
            {
                float left = x + i * (size + gap);
                if (i < marks.Count) p.FillNotched(left, y, size, size, 4, marks[i]);
                else if (i == marks.Count)
                {
                    p.FillNotched(left, y, size, size, 4, Alpha(Color.white, 0.3f));
                    p.StrokeNotched(left, y, size, size, 4, Color.white, 5);
                }
                else p.StrokeNotched(left, y, size, size, 4, new Color(0.55f, 0.65f, 0.95f, 0.55f), 4);
            }
            p.End();
        }

        /// "ROUND 1" and a big number, or "GO!".
        public static void Countdown(Painter p, RenderTexture rt, string eyebrow, string big, Level level)
        {
            p.Begin(rt);
            float w = p.Width;
            p.PixelText(eyebrow, w / 2, 70, 8, level.accent, Align.Center, Outline);
            // A soft block of the level's colour behind the number, then the number.
            p.FillNotched(w / 2 - 150, 300 - 150, 300, 300, 24, Alpha(level.second, 0.16f));
            p.PixelText(big, w / 2, 300, 36, Color.white, Align.Center, Outline, null, w - 40);
            p.End();
        }

        /// The end of the day.
        public static void Summary(Painter p, RenderTexture rt, string rank, string[] lines, Level level)
        {
            p.Begin(rt);
            float w = p.Width;
            p.PixelText("INBOX ZERO!", w / 2, 64, 11, Color.white, Align.Center, Outline, level.second, w - 60);
            Color gold = Look.Gold;
            Panel(p, w / 2 - 74, 132, 148, 148, 10, Alpha(gold, 0.12f), gold, 6);
            p.PixelText(rank, w / 2, 206, 14, gold, Align.Center, Outline);
            p.PixelText("RANK", w / 2, 312, 5, Alpha(gold, 0.85f), Align.Center);
            float y = 392;
            foreach (var line in lines)
            {
                p.Text(line, w / 2, y, 38, true, Soft, Align.Center);
                y += 50;
            }
            p.End();
        }

        /// A word or two in the pixel font, for pop-ups.
        public static void PixelLabel(Painter p, RenderTexture rt, string text, Color color, Color shadow)
        {
            p.Begin(rt);
            p.PixelText(text, p.Width / 2, p.Height / 2 - 6, 14, color, Align.Center, Outline, shadow, p.Width - 40);
            p.End();
        }

        // -------------------------------------------------------------- home

        /// The big button: a slab of the level's colour with a darker lip under
        /// it, like an arcade button.
        public static void Button(Painter p, RenderTexture rt, string text, Color accent)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            var deep = new Color(accent.r * 0.45f, accent.g * 0.45f, accent.b * 0.55f, 1);
            p.FillNotched(4, 12, w - 8, h - 16, 10, deep);
            p.FillNotched(4, 4, w - 8, h - 22, 10, accent);
            p.FillRects(new List<Rect> { new Rect(30, 14, w - 60, 6) }, Alpha(Color.white, 0.4f));
            p.PixelText(text, w / 2, (h - 22) / 2 + 6, 8, Ink, Align.Center, null, null, w - 70);
            p.End();
        }

        /// A level on the home screen's picker.
        public static void LevelChip(Painter p, RenderTexture rt, Level level, bool selected)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            if (level.ready)
            {
                Panel(p, 4, 4, w - 8, h - 8, 8, selected ? Alpha(level.accent, 0.16f) : Look.Glass,
                    selected ? level.accent : Edge, selected ? 5 : 3);
                p.Text(level.name, w / 2, h / 2 + 1, 44, true, selected ? Look.Text : Look.Dim, Align.Center, Baseline.Middle);
            }
            else
            {
                Panel(p, 4, 4, w - 8, h - 8, 8, Alpha(Look.Glass, 0.55f), Alpha(Edge, 0.7f), 3);
                var c = Look.Hex(0x655a8c);
                float cx = w / 2 - 90, cy = h / 2;
                p.StrokeArc(cx, cy - 6, 14, Mathf.PI, Mathf.PI * 2, c, 6);
                p.FillNotched(cx - 21, cy - 6, 42, 32, 4, c);
                p.PixelText("LOCKED", cx + 40, cy, 5, c);
            }
            p.End();
        }

        /// The settings button: a gear.
        public static void SettingsIcon(Painter p, RenderTexture rt)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height, cx = w / 2, cy = h / 2;
            Panel(p, 6, 6, w - 12, h - 12, 8, Look.Glass, Edge, 3);
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI / 4;
                p.Line(cx + Mathf.Cos(a) * 26, cy + Mathf.Sin(a) * 26, cx + Mathf.Cos(a) * 46, cy + Mathf.Sin(a) * 46, Look.Dim, 15);
            }
            p.FillCircle(cx, cy, 34, Look.Dim);
            p.FillCircle(cx, cy, 14, Look.Hex(0x120b22));
            p.End();
        }

        // ------------------------------------------------------------ round 2

        /// One of the two ready-made replies above the email.
        public static void ReplyChip(Painter p, RenderTexture rt, string text)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            Panel(p, 6, 6, w - 12, h - 12, 8, Look.Hex(0x110a20, 0.95f), Green, 5);
            p.PixelText("REPLY", w / 2, 42, 4, Green, Align.Center);
            var lines = p.Wrap(text, 46, true, w - 60, 2);
            float y = lines.Count == 1 ? 132 : 108;
            foreach (var line in lines)
            {
                p.Text(line, w / 2, y, 46, true, Look.Text, Align.Center);
                y += 54;
            }
            p.End();
        }

        /// The dictation target: a microphone in a circle.
        public static void Mic(Painter p, RenderTexture rt, bool listening)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            Color color = listening ? Look.Coral : Look.Magenta;
            float cx = w / 2, cy = h / 2 - 22;
            p.FillCircle(cx, cy, 84, listening ? Look.Hex(0x3a1020) : Look.Hex(0x110a20, 0.95f));
            p.StrokeCircle(cx, cy, 84, color, 7);
            p.FillRoundRect(cx - 17, cy - 50, 34, 62, 17, color);
            p.StrokeArc(cx, cy - 4, 31, 0.1f * Mathf.PI, 0.9f * Mathf.PI, color, 7);
            p.Line(cx, cy + 27, cx, cy + 46, color, 7);
            p.Line(cx - 18, cy + 46, cx + 18, cy + 46, color, 7);
            p.PixelText(listening ? "LISTENING" : "DICTATE", cx, h - 16, 3, listening ? Look.Coral : Look.Dim, Align.Center);
            p.End();
        }

        // ------------------------------------------------------------- other

        /// A short line of text with a dark outline (used when there is no logo).
        public static void Label(Painter p, RenderTexture rt, string text, Color color)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            p.OutlinedText(text, w / 2, h / 2, Mathf.RoundToInt(h * 0.62f), color, new Color(4 / 255f, 8 / 255f, 20 / 255f, 0.8f), 3);
            p.End();
        }

        /// A line of keyboard hints: each key in a small cap, then what it does.
        public static void Hints(Painter p, RenderTexture rt, (string key, string does)[] hints)
        {
            p.Begin(rt);
            float w = p.Width, h = p.Height;
            const int size = 30;
            const float pad = 14, gap = 12, between = 44;
            float total = -between;
            foreach (var hint in hints)
                total += between + p.Measure(hint.key, size, true) + pad * 2 + gap + p.Measure(hint.does, size, false);
            float x = (w - total) / 2, mid = h / 2;
            foreach (var hint in hints)
            {
                float cap = p.Measure(hint.key, size, true) + pad * 2;
                Panel(p, x, mid - 24, cap, 48, 4, Look.Glass, Edge, 3);
                p.Text(hint.key, x + pad, mid + 1, size, true, Look.Text, Align.Left, Baseline.Middle);
                x += cap + gap;
                p.Text(hint.does, x, mid + 1, size, false, Look.Dim, Align.Left, Baseline.Middle);
                x += p.Measure(hint.does, size, false) + between;
            }
            p.End();
        }
    }
}
