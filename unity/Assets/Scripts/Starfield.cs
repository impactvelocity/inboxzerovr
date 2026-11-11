using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    /// The level's backdrop: open space, and the feeling of flying through it.
    ///
    ///   Far away, a dome of little square stars, a denser band of them across
    ///   the sky like a galaxy seen edge on, a few bright four-pointed ones,
    ///   and faint clouds of purple and red.
    ///   Closer, stars that drift toward the seat and past it: this is the
    ///   "tunnel". They speed up and streak for a moment after a hit.
    ///   Now and then a shooting star crosses the sky, its tail cooling from
    ///   yellow through red to purple.
    ///
    /// Everything is sized in screen pixels (see Pixel), so through RetroFx a
    /// star is a pixel or two, as in pixel art. It breathes with the music.
    public class Starfield : IWorld
    {
        /// About one of RetroFx's big pixels, as an angle in radians (a 70
        /// degree view over 320 rows). Far stars are sized in these.
        public const float Pixel = 0.004f;
        const float Dome = 80, FlowLength = 60, Behind = -8;
        const int Streaks = 22;

        /// Collects little squares of light into one mesh for the Neon shader.
        public class Quads
        {
            readonly List<Vector3> points = new List<Vector3>();
            readonly List<Color> colors = new List<Color>();
            readonly List<Vector4> winks = new List<Vector4>(); // x: where in its twinkle, y: how fast
            readonly List<int> triangles = new List<int>();

            public void Add(Vector3 at, Vector3 right, Vector3 up, float halfW, float halfH, Color color,
                float phase = 0, float pace = 0)
            {
                int k = points.Count;
                points.Add(at - right * halfW - up * halfH);
                points.Add(at + right * halfW - up * halfH);
                points.Add(at - right * halfW + up * halfH);
                points.Add(at + right * halfW + up * halfH);
                for (int i = 0; i < 4; i++)
                {
                    colors.Add(color);
                    winks.Add(new Vector4(phase, pace, 0, 0));
                }
                triangles.AddRange(new[] { k, k + 2, k + 1, k + 1, k + 2, k + 3 });
            }

            public void Clear()
            {
                points.Clear(); colors.Clear(); winks.Clear(); triangles.Clear();
            }

            public void Fill(Mesh mesh)
            {
                mesh.Clear();
                if (points.Count == 0) return;
                if (points.Count > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                mesh.SetVertices(points);
                mesh.SetColors(colors);
                mesh.SetUVs(1, winks);
                mesh.SetTriangles(triangles, 0);
            }

            public Mesh Build(string name)
            {
                var mesh = new Mesh { name = name };
                Fill(mesh);
                mesh.RecalculateBounds();
                return mesh;
            }
        }

        /// The sideways and upward directions of something at `dir` that faces the seat.
        public static void Facing(Vector3 dir, out Vector3 right, out Vector3 up)
        {
            right = Vector3.Cross(Vector3.up, dir);
            if (right.sqrMagnitude < 1e-4f) right = Vector3.right;
            right.Normalize();
            up = Vector3.Cross(dir, right);
        }

        readonly Transform[] nearFlow = new Transform[2], farFlow = new Transform[2];
        readonly Transform[] streaks = new Transform[Streaks];
        readonly float[] streakPace = new float[Streaks];
        readonly Material starGlow, brightGlow, flowGlow, streakGlow;
        readonly List<Material> cloudGlow = new List<Material>();
        readonly List<Color> cloudTint = new List<Color>();
        readonly ShootingStars shooting;
        readonly System.Random random = new System.Random(11);
        float speed, boost, flash, travelled, wishWait;
        int wishes;
        Color flashTint = Color.white;

        float R() => (float)random.NextDouble();
        float Range(float a, float b) => a + (b - a) * R();

        public Starfield(Transform parent, float eyeHeight, Level level)
        {
            var root = new GameObject("Space").transform;
            space = root.gameObject;
            root.SetParent(parent, false);
            root.localPosition = new Vector3(0, eyeHeight, 0);

            // All of it is drawn before the cards and labels.
            starGlow = Look.Neon(Color.white, 0, 0, -58);
            starGlow.SetFloat("_Twinkle", 0.45f);
            brightGlow = Look.Neon(Color.white, 0, 0, -57);
            brightGlow.SetFloat("_Twinkle", 0.6f);
            flowGlow = Look.Neon(Color.white, 3, FlowLength - 8, -52);
            flowGlow.SetFloat("_Twinkle", 0.2f);
            streakGlow = Look.Neon(Color.white, 2, 40, -51);

            Color[] tints =
            {
                Color.white, new Color(0.82f, 0.8f, 1f), new Color(1f, 0.8f, 0.9f),
                new Color(0.8f, 0.86f, 1f), new Color(1f, 0.93f, 0.78f),
            };

            // ---- the far sky
            var far = new Quads();
            float px = Dome * Pixel / 2; // half a pixel, out at the dome
            for (int i = 0; i < 1500; i++)
            {
                float y = 2 * R() - 1, a = R() * Mathf.PI * 2, r = Mathf.Sqrt(1 - y * y);
                var dir = new Vector3(r * Mathf.Cos(a), y, r * Mathf.Sin(a));
                Facing(dir, out var right, out var up);
                float big = R();
                float size = px * (1.05f + 1.25f * big * big * big);
                var c = tints[random.Next(tints.Length)];
                c.a = Range(0.4f, 1);
                far.Add(dir * Dome, right, up, size, size, c, R(), R());
            }
            // The band: a strip of small dim stars across the sky, passing a
            // little above straight ahead and climbing to the right.
            var through = Quaternion.Euler(-14, 0, 0) * Vector3.forward;
            var along = new Vector3(Mathf.Cos(28 * Mathf.Deg2Rad), Mathf.Sin(28 * Mathf.Deg2Rad), 0);
            var normal = Vector3.Cross(through, along).normalized;
            var second = Vector3.Cross(normal, through);
            for (int i = 0; i < 1300; i++)
            {
                float a = R() * Mathf.PI * 2, spread = (R() + R() + R() - 1.5f) * 0.11f;
                var dir = (through * Mathf.Cos(a) + second * Mathf.Sin(a) + normal * spread).normalized;
                Facing(dir, out var right, out var up);
                var c = Color.Lerp(new Color(0.62f, 0.55f, 0.95f), new Color(0.9f, 0.6f, 0.85f), R());
                c.a = Range(0.25f, 0.75f);
                float size = px * Range(0.9f, 1.3f);
                far.Add(dir * Dome, right, up, size, size, c, R(), R());
            }
            Make(root, "Stars", far.Build("Stars"), starGlow);

            // A few bright stars: a plus of light, two or three pixels to each arm.
            var bright = new Quads();
            for (int i = 0; i < 90; i++)
            {
                float y = 2 * R() - 1, a = R() * Mathf.PI * 2, r = Mathf.Sqrt(1 - y * y);
                var dir = new Vector3(r * Mathf.Cos(a), y, r * Mathf.Sin(a));
                Facing(dir, out var right, out var up);
                float arm = px * 2 * Range(1.8f, 3.6f);
                var c = Color.Lerp(Color.white, tints[random.Next(tints.Length)], 0.5f);
                float phase = R(), pace = R();
                bright.Add(dir * Dome, right, up, arm, px, c, phase, pace);
                bright.Add(dir * Dome, right, up, px, arm, c, phase, pace);
            }
            Make(root, "BrightStars", bright.Build("BrightStars"), brightGlow);

            // Faint clouds of colour, mostly along the band. Through RetroFx's
            // limited palette they break up into a dither, like dust.
            Color purple = Color.Lerp(level.second, new Color(0.35f, 0.15f, 0.8f), 0.5f);
            Color red = Color.Lerp(level.accent, new Color(0.8f, 0.1f, 0.2f), 0.5f);
            Color plum = Color.Lerp(purple, red, 0.5f);
            var cloud = Look.SoftDisc(1, 28, Color.white);
            (float yaw, float pitch, float w, float h, float roll, Color tint, float strength)[] clouds =
            {
                (20, 16, 44, 15, 28, purple, 0.11f), (-24, 4, 40, 14, 28, plum, 0.09f), (58, 34, 36, 14, 28, purple, 0.08f),
                (40, -8, 30, 17, -10, red, 0.09f), (-50, 14, 30, 20, 15, plum, 0.08f), (-75, -10, 34, 16, 0, purple, 0.07f),
                (150, 20, 50, 20, 20, purple, 0.09f), (-140, 10, 44, 18, -15, red, 0.07f), (0, 72, 40, 24, 0, plum, 0.07f),
            };
            foreach (var c in clouds)
            {
                var glow = Look.Neon(Color.white, 0, 0, -60);
                var dir = Quaternion.Euler(-c.pitch, c.yaw, 0) * Vector3.forward;
                var t = Make(root, "Cloud", cloud, glow);
                t.localPosition = dir * (Dome - 6);
                t.localRotation = Quaternion.LookRotation(dir) * Quaternion.Euler(0, 0, c.roll);
                t.localScale = new Vector3(c.w, c.h, 1);
                cloudGlow.Add(glow);
                cloudTint.Add(new Color(c.tint.r, c.tint.g, c.tint.b, c.strength));
            }

            // ---- the stars that drift past: two layers, the nearer one faster
            Mesh Flow(int count, float innerRadius, float outerRadius, float minSize, float maxSize, float minAlpha)
            {
                var quads = new Quads();
                for (int i = 0; i < count; i++)
                {
                    float a = R() * Mathf.PI * 2;
                    float radius = Mathf.Sqrt(Mathf.Lerp(innerRadius * innerRadius, outerRadius * outerRadius, R()));
                    var at = new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, R() * FlowLength);
                    float size = Range(minSize, maxSize);
                    var c = tints[random.Next(tints.Length)];
                    c.a = Range(minAlpha, 1);
                    quads.Add(at, Vector3.right, Vector3.up, size, size, c, R(), R());
                }
                return quads.Build("DriftingStars");
            }
            var nearMesh = Flow(150, 1.8f, 6, 0.004f, 0.009f, 0.6f);
            var farMesh = Flow(240, 4, 14, 0.012f, 0.03f, 0.4f);
            for (int k = 0; k < 2; k++)
            {
                nearFlow[k] = Make(root, "NearStars", nearMesh, flowGlow);
                farFlow[k] = Make(root, "FarStars", farMesh, flowGlow);
            }

            // Streaks only show in the surge after a hit.
            var lines = new[]
            {
                Look.NeonLine(1, 0.006f, level.accent), Look.NeonLine(1, 0.006f, level.second), Look.NeonLine(1, 0.005f, Color.white),
            };
            for (int i = 0; i < Streaks; i++)
            {
                streaks[i] = Make(root, "Streak", lines[i % lines.Length], streakGlow);
                Scatter(i, R() * 40);
            }

            shooting = new ShootingStars(root, level);
            Step(0, 0, 0, 0);
        }

        static Transform Make(Transform parent, string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return go.transform;
        }

        /// Give a streak a new place around the flight path, a length and a pace.
        void Scatter(int i, float z)
        {
            float a = R() * Mathf.PI * 2, radius = Range(1.8f, 5);
            streaks[i].localPosition = new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, z);
            streaks[i].localScale = new Vector3(1, 1, Range(2, 7));
            streakPace[i] = Range(1.6f, 3);
        }

        readonly GameObject space;
        public void Show(bool on) { space.SetActive(on); }
        public void Round(bool underway) { }

        /// A surge of speed and light, for a hit.
        public void Kick(float strength) { boost = Mathf.Max(boost, strength); }

        /// Wash the sky in a colour for a moment (a mistake turns it red).
        public void Flash(Color tint)
        {
            flashTint = tint;
            flash = 1;
        }

        /// Send `count` shooting stars across the sky ahead, one after another.
        public void Wish(int count = 1) { wishes += count; }

        /// `beat` is the music's pulse and `energy` the player's streak, both 0..1.
        public void Step(float dt, float targetSpeed, float beat, float energy)
        {
            speed = Mathf.Lerp(speed, targetSpeed * (1 + 0.3f * energy), 1 - Mathf.Exp(-2 * dt));
            boost = Mathf.Max(0, boost - dt * 2.4f);
            flash = Mathf.Max(0, flash - dt * 2.2f);
            float move = speed * (1 + boost * 1.5f) * dt;
            travelled += move;

            // Two copies of each layer, end to end, sliding back and snapping
            // forward by one length: an endless stream.
            float near = Behind - Mathf.Repeat(travelled, FlowLength);
            float far = Behind - Mathf.Repeat(travelled * 0.45f, FlowLength);
            for (int k = 0; k < 2; k++)
            {
                nearFlow[k].localPosition = new Vector3(0, 0, near + k * FlowLength);
                farFlow[k].localPosition = new Vector3(0, 0, far + k * FlowLength);
            }
            for (int i = 0; i < Streaks; i++)
            {
                var at = streaks[i].localPosition;
                at.z -= move * streakPace[i];
                if (at.z < -10) Scatter(i, at.z + 50);
                else streaks[i].localPosition = at;
            }

            if (wishes > 0)
            {
                wishWait -= dt;
                if (wishWait <= 0)
                {
                    shooting.Launch(true);
                    wishes--;
                    wishWait = 0.16f;
                }
            }
            shooting.Step(dt);

            var tint = Color.Lerp(Color.white, flashTint, flash);
            starGlow.color = new Color(1, 1, 1, 0.85f + 0.15f * beat);
            brightGlow.color = new Color(1, 1, 1, 0.9f + 0.3f * beat);
            flowGlow.color = new Color(tint.r, tint.g, tint.b, 0.75f + 0.1f * energy + 0.2f * beat + 0.4f * boost);
            streakGlow.color = new Color(1, 1, 1, 0.6f * boost);
            for (int i = 0; i < cloudGlow.Count; i++)
            {
                var c = Color.Lerp(cloudTint[i], flashTint, flash * 0.7f);
                c.a = cloudTint[i].a * (1 + 0.35f * beat + 0.8f * flash);
                cloudGlow[i].color = c;
            }
        }
    }

    /// Shooting stars: a bright head crossing the far sky, leaving a dotted
    /// tail of pixels that cools from yellow through red to purple and goes out.
    public class ShootingStars
    {
        const float Radius = 62, TrailSeconds = 0.8f;
        const float Spacing = Radius * Starfield.Pixel * 2.3f; // a gap of a pixel or so between dots

        struct Dot { public Vector3 at; public float born, size; }

        class Star
        {
            public bool live;
            public Vector3 at, way, side;
            public float speed, left, sinceDot;
        }

        readonly Star[] stars = { new Star(), new Star(), new Star(), new Star() };
        readonly List<Dot> dots = new List<Dot>(400);
        readonly Starfield.Quads quads = new Starfield.Quads();
        readonly Mesh mesh = new Mesh { name = "ShootingStars" };
        readonly System.Random random = new System.Random(5);
        readonly Color hot = new Color(1f, 0.93f, 0.62f), warm = new Color(1f, 0.62f, 0.25f);
        readonly Color red, violet;
        float clock, wait = 1.2f;

        float Range(float a, float b) => a + (b - a) * (float)random.NextDouble();

        public ShootingStars(Transform parent, Level level)
        {
            red = Color.Lerp(level.accent, new Color(1f, 0.3f, 0.4f), 0.5f);
            violet = level.second;
            mesh.MarkDynamic();
            var go = new GameObject("ShootingStars");
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = Look.Neon(Color.white, 0, 0, -54);
        }

        /// Start one. `ahead` puts it in the part of the sky the player faces.
        public void Launch(bool ahead)
        {
            Star star = null;
            foreach (var s in stars) if (!s.live) { star = s; break; }
            if (star == null) return;
            float yaw = ahead ? Range(-50, 50) : Range(-180, 180), pitch = Range(12, 42);
            var dir = Quaternion.Euler(-pitch, yaw, 0) * Vector3.forward;
            Starfield.Facing(dir, out var right, out var up);
            // Falling, to the left or to the right.
            float heading = (random.NextDouble() < 0.5 ? Range(205, 245) : Range(295, 335)) * Mathf.Deg2Rad;
            star.way = right * Mathf.Cos(heading) + up * Mathf.Sin(heading);
            star.side = Vector3.Cross(dir, star.way).normalized;
            star.at = dir * Radius;
            star.speed = Range(50, 78);
            star.left = Range(0.5f, 0.9f);
            star.sinceDot = 0;
            star.live = true;
        }

        Color Shade(float age)
        {
            Color c = age < 0.1f ? Color.Lerp(hot, warm, age / 0.1f)
                : age < 0.3f ? Color.Lerp(warm, red, (age - 0.1f) / 0.2f)
                : age < 0.65f ? Color.Lerp(red, violet, (age - 0.3f) / 0.35f)
                : Color.Lerp(violet, violet * 0.6f, (age - 0.65f) / 0.35f);
            c.a = age < 0.5f ? 1 : 1 - (age - 0.5f) / 0.5f;
            return c;
        }

        public void Step(float dt)
        {
            clock += dt;
            wait -= dt;
            if (wait <= 0)
            {
                Launch(random.NextDouble() < 0.8);
                wait = Range(2.2f, 5);
            }

            foreach (var star in stars)
            {
                if (!star.live) continue;
                float travelled = star.speed * dt;
                star.sinceDot += travelled;
                while (star.sinceDot >= Spacing)
                {
                    star.sinceDot -= Spacing;
                    if (random.NextDouble() < 0.12) continue; // a gap in the tail
                    var at = star.at + star.way * (travelled - star.sinceDot) + star.side * Range(-0.2f, 0.2f);
                    dots.Add(new Dot { at = at, born = clock, size = Range(0.9f, 1.3f) });
                }
                star.at += star.way * travelled;
                star.left -= dt;
                if (star.left <= 0) star.live = false;
            }
            dots.RemoveAll(dot => clock - dot.born > TrailSeconds);

            quads.Clear();
            float px = Radius * Starfield.Pixel / 2;
            foreach (var dot in dots)
            {
                Starfield.Facing(dot.at.normalized, out var right, out var up);
                float age = (clock - dot.born) / TrailSeconds;
                float size = px * dot.size * (age < 0.6f ? 1 : 0.75f);
                quads.Add(dot.at, right, up, size, size, Shade(age));
            }
            foreach (var star in stars)
            {
                if (!star.live) continue;
                // The head: a small bright plus.
                Starfield.Facing(star.at.normalized, out var right, out var up);
                quads.Add(star.at, right, up, px * 3.2f, px * 1.1f, hot);
                quads.Add(star.at, right, up, px * 1.1f, px * 3.2f, hot);
            }
            quads.Fill(mesh);
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 400); // all around the seat; never cull
        }
    }
}
