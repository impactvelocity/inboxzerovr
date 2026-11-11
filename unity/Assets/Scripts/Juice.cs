using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    /// Square pixels of light. A burst is thrown along a direction; embers
    /// drift up and twinkle. Each pixel flashes white, burns to its colour,
    /// then darkens and shrinks a size at a time, the way pixel-art sparks do.
    public class Sparks
    {
        const int Count = 260;
        readonly Transform[] parts = new Transform[Count];
        readonly MeshRenderer[] looks = new MeshRenderer[Count];
        readonly Vector3[] velocity = new Vector3[Count];
        readonly float[] age = new float[Count], life = new float[Count], gravity = new float[Count],
            drag = new float[Count], size = new float[Count];
        readonly Color[] color = new Color[Count];
        readonly bool[] twinkle = new bool[Count];
        readonly MaterialPropertyBlock block = new MaterialPropertyBlock();
        int next;

        public Sparks(Transform parent)
        {
            var material = Look.Neon(Color.white, 0, 0, 70);
            var mesh = Look.Quad(1, 1);
            for (int i = 0; i < Count; i++)
            {
                var go = new GameObject("Spark");
                go.transform.SetParent(parent, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                looks[i] = go.AddComponent<MeshRenderer>();
                looks[i].sharedMaterial = material;
                go.SetActive(false);
                parts[i] = go.transform;
                age[i] = life[i] = 1;
            }
        }

        int Take(Vector3 at, Color tint)
        {
            int i = next;
            next = (next + 1) % Count;
            parts[i].position = at;
            parts[i].gameObject.SetActive(true);
            age[i] = 0;
            color[i] = tint;
            twinkle[i] = false;
            return i;
        }

        /// Pixels thrown along `direction` (zero: every way). `spread` 0 is a
        /// tight jet, 1 a wide fan.
        public void Burst(Vector3 at, Vector3 direction, float spread, Color tint, int count,
            float speedMin, float speedMax, float pixel = 0.013f, float seconds = 0.55f, float fall = 5)
        {
            var way = direction.sqrMagnitude > 1e-6f ? direction.normalized : Vector3.zero;
            for (int n = 0; n < count; n++)
            {
                int i = Take(at, tint);
                var random = Random.onUnitSphere;
                random.z *= 0.35f; // keep them mostly across the view, where they read
                var heading = way == Vector3.zero ? random.normalized : (way + random * spread).normalized;
                velocity[i] = heading * Random.Range(speedMin, speedMax);
                life[i] = seconds * Random.Range(0.6f, 1.2f);
                gravity[i] = fall;
                drag[i] = 2.2f;
                size[i] = pixel * Random.Range(0.7f, 1.5f);
            }
        }

        /// Slow embers that drift up from `at` and twinkle out.
        public void Embers(Vector3 at, Color tint, int count, float radius)
        {
            for (int n = 0; n < count; n++)
            {
                var off = Random.insideUnitCircle * radius;
                int i = Take(at + new Vector3(off.x, off.y, -0.02f), tint);
                velocity[i] = new Vector3(Random.Range(-0.2f, 0.2f), Random.Range(0.15f, 0.55f), 0);
                life[i] = Random.Range(0.8f, 1.5f);
                gravity[i] = -0.25f;
                drag[i] = 1.2f;
                size[i] = Random.Range(0.006f, 0.011f);
                twinkle[i] = true;
            }
        }

        public void Step(float dt)
        {
            for (int i = 0; i < Count; i++)
            {
                if (age[i] >= life[i]) continue;
                age[i] += dt;
                if (age[i] >= life[i]) { parts[i].gameObject.SetActive(false); continue; }
                velocity[i].y -= gravity[i] * dt;
                velocity[i] *= 1 / (1 + drag[i] * dt);
                parts[i].position += velocity[i] * dt;
                float t = age[i] / life[i];
                var c = t < 0.12f ? Color.Lerp(Color.white, color[i], t / 0.12f)
                    : Color.Lerp(color[i], color[i] * 0.3f, (t - 0.12f) / 0.88f);
                if (twinkle[i]) c *= 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(age[i] * 17 + i));
                c.a = 1;
                block.SetColor("_Color", c);
                looks[i].SetPropertyBlock(block);
                parts[i].localScale = Vector3.one * size[i] * (Mathf.Ceil((1 - t) * 3) / 3);
            }
        }
    }

    /// The flash of the blow itself: a cluster of solid blasts that pop, burn
    /// from white to the email's colour and shrink, with stars around them.
    public class Boom
    {
        const int Blobs = 9, Stars = 8;
        const float Seconds = 0.5f;
        readonly Transform[] blobs = new Transform[Blobs], stars = new Transform[Stars];
        readonly MeshRenderer[] blobLook = new MeshRenderer[Blobs], starLook = new MeshRenderer[Stars];
        readonly float[] blobDelay = new float[Blobs], blobSize = new float[Blobs], starDelay = new float[Stars], starSize = new float[Stars];
        readonly MaterialPropertyBlock block = new MaterialPropertyBlock();
        Color tint;
        float age = 1;

        public Boom(Transform parent)
        {
            var solid = Look.Sheer(Color.white);
            solid.renderQueue += 55;
            var light = Look.Neon(Color.white, 0, 0, 56);
            var disc = Look.HardDisc(12);
            var star = Look.Twinkle(0.09f);
            for (int i = 0; i < Blobs; i++) blobs[i] = Make(parent, "Blast", disc, solid, out blobLook[i]);
            for (int i = 0; i < Stars; i++) stars[i] = Make(parent, "Star", star, light, out starLook[i]);
        }

        static Transform Make(Transform parent, string name, Mesh mesh, Material material, out MeshRenderer look)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            look = go.AddComponent<MeshRenderer>();
            look.sharedMaterial = material;
            go.SetActive(false);
            return go.transform;
        }

        /// `along` stretches the cluster along the cut.
        public void Go(Vector3 at, Vector3 along, Color color, float strength = 1)
        {
            tint = color;
            age = 0;
            var side = Vector3.Cross(along, Vector3.forward).normalized;
            for (int i = 0; i < Blobs; i++)
            {
                var spot = along * Random.Range(-0.12f, 0.12f) + side * Random.Range(-0.04f, 0.04f);
                blobs[i].position = at + spot * strength + new Vector3(0, 0, -0.02f - i * 0.0015f);
                blobDelay[i] = i < 2 ? 0 : Random.Range(0, 0.16f);
                blobSize[i] = (i < 2 ? Random.Range(0.03f, 0.042f) : Random.Range(0.012f, 0.03f)) * strength;
            }
            for (int i = 0; i < Stars; i++)
            {
                var off = Random.insideUnitCircle.normalized * Random.Range(0.1f, 0.3f) * strength;
                stars[i].position = at + new Vector3(off.x, off.y, -0.03f);
                starDelay[i] = Random.Range(0, 0.22f);
                starSize[i] = Random.Range(0.04f, 0.11f);
            }
            Step(0);
        }

        public void Step(float dt)
        {
            if (age >= 1) return;
            age = Mathf.Min(1, age + dt / Seconds);
            float seconds = age * Seconds;
            for (int i = 0; i < Blobs; i++)
            {
                float life = (seconds - blobDelay[i]) / 0.24f;
                bool on = life >= 0 && life < 1;
                blobs[i].gameObject.SetActive(on);
                if (!on) continue;
                blobs[i].localScale = Vector3.one * blobSize[i] * (life < 0.25f ? 1 : 1 - (life - 0.25f) / 0.75f);
                var shade = life < 0.3f ? Color.Lerp(Color.white, tint, life / 0.3f) : Color.Lerp(tint, tint * 0.45f, (life - 0.3f) / 0.7f);
                shade.a = 1;
                block.SetColor("_Color", shade);
                blobLook[i].SetPropertyBlock(block);
            }
            for (int i = 0; i < Stars; i++)
            {
                float life = (seconds - starDelay[i]) / 0.26f;
                bool on = life >= 0 && life < 1;
                stars[i].gameObject.SetActive(on);
                if (!on) continue;
                stars[i].localScale = Vector3.one * starSize[i] * Mathf.Sin(life * Mathf.PI);
                block.SetColor("_Color", Color.Lerp(Color.white, tint, 0.3f));
                starLook[i].SetPropertyBlock(block);
            }
            if (age >= 1)
            {
                foreach (var blob in blobs) blob.gameObject.SetActive(false);
                foreach (var one in stars) one.gameObject.SetActive(false);
            }
        }
    }

    /// The mark of a cut: a white-hot line along the blade's path, right
    /// across the email and beyond, and a ring of light opening from the hit.
    public class HitFx
    {
        readonly Transform slash, ring;
        readonly Material slashGlow, ringGlow;
        Color tint;
        float age = 1;

        public HitFx(Transform parent)
        {
            slashGlow = Look.Neon(Color.white, 0, 0, 60);
            ringGlow = Look.Neon(Color.white, 0, 0, 45);
            slash = Make(parent, "SlashMark", Look.NeonSlash(0.012f), slashGlow);
            ring = Make(parent, "HitRing", Look.NeonRing(0.04f, 0.09f, 48), ringGlow);
        }

        static Transform Make(Transform parent, string name, Mesh mesh, Material material)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = material;
            go.SetActive(false);
            return go.transform;
        }

        /// `along` is the direction of the cut; `facing` the card's rotation.
        public void Strike(Vector3 at, Vector3 along, Quaternion facing, Color color)
        {
            tint = color;
            age = 0;
            var flat = Quaternion.Inverse(facing) * along;
            float angle = Mathf.Atan2(flat.y, flat.x) * Mathf.Rad2Deg;
            slash.SetPositionAndRotation(at - facing * Vector3.forward * 0.012f, facing * Quaternion.Euler(0, 0, angle));
            ring.SetPositionAndRotation(at - facing * Vector3.forward * 0.008f, facing);
            slash.gameObject.SetActive(true);
            ring.gameObject.SetActive(true);
            Step(0);
        }

        public void Step(float dt)
        {
            if (age >= 1) return;
            age = Mathf.Min(1, age + dt / 0.38f);
            // The line snaps out long and thin, and is gone first.
            float cut = Mathf.Clamp01(age / 0.45f);
            slash.localScale = new Vector3(0.3f + 0.7f * (1 - Mathf.Pow(1 - cut, 3)), 1.3f - cut, 1) * 0.85f;
            var hot = Color.Lerp(Color.white, tint, 0.25f);
            slashGlow.color = new Color(hot.r, hot.g, hot.b, 1 - cut);
            float open = 1 - Mathf.Pow(1 - age, 3);
            ring.localScale = Vector3.one * (0.02f + 0.15f * open);
            ringGlow.color = new Color(tint.r, tint.g, tint.b, 0.7f * (1 - age));
            if (age >= 1)
            {
                slash.gameObject.SetActive(false);
                ring.gameObject.SetActive(false);
            }
        }
    }

    /// An email cut in two along the blade's path. The halves fly apart from
    /// the cut, carried the way the blade was going and tumbling away from it,
    /// then burn up in square cells.
    public class CardSplit
    {
        const float Life = 0.8f;
        readonly Transform[] halves = new Transform[2];
        readonly Mesh[] meshes = new Mesh[2];
        readonly Vector3[] velocity = new Vector3[2], axis = new Vector3[2];
        readonly float[] spin = new float[2];
        readonly Material material;
        float age = 1;

        /// The halves' material, so a level can dress them like its cards.
        public Material Material { get; private set; }

        public CardSplit(Transform parent)
        {
            material = Look.Holo(null);
            material.SetVector("_Cells", new Vector4(44, 28, 0, 0));
            Material = material;
            for (int i = 0; i < 2; i++)
            {
                meshes[i] = new Mesh { name = "CardHalf" };
                meshes[i].MarkDynamic();
                var go = new GameObject("CardHalf");
                go.transform.SetParent(parent, false);
                go.AddComponent<MeshFilter>().sharedMesh = meshes[i];
                go.AddComponent<MeshRenderer>().sharedMaterial = material;
                go.SetActive(false);
                halves[i] = go.transform;
            }
        }

        /// Keep the part of `polygon` where dot(normal, p - through) >= 0.
        static List<Vector2> Clip(List<Vector2> polygon, Vector2 through, Vector2 normal)
        {
            var kept = new List<Vector2>();
            for (int i = 0; i < polygon.Count; i++)
            {
                Vector2 a = polygon[i], b = polygon[(i + 1) % polygon.Count];
                float da = Vector2.Dot(normal, a - through), db = Vector2.Dot(normal, b - through);
                if (da >= 0) kept.Add(a);
                if ((da >= 0) != (db >= 0)) kept.Add(Vector2.Lerp(a, b, da / (da - db)));
            }
            return kept;
        }

        /// Cut the card (`width` by `height`, showing `face`) through `at` along
        /// `cut`, both in the card's own space. `push` is the blade's velocity.
        public void Go(Transform card, float width, float height, Vector2 at, Vector2 cut, Vector3 push,
            Texture face, Color burn)
        {
            material.mainTexture = face;
            material.SetColor("_Burn", burn);
            material.SetFloat("_Dissolve", 0);
            age = 0;
            var normal = new Vector2(-cut.y, cut.x);
            var rect = new List<Vector2>
            {
                new Vector2(-width / 2, -height / 2), new Vector2(width / 2, -height / 2),
                new Vector2(width / 2, height / 2), new Vector2(-width / 2, height / 2),
            };
            for (int s = 0; s < 2; s++)
            {
                float side = s == 0 ? 1 : -1;
                var poly = Clip(rect, at, normal * side);
                halves[s].gameObject.SetActive(poly.Count >= 3);
                if (poly.Count < 3) continue;
                var middle = Vector2.zero;
                foreach (var v in poly) middle += v;
                middle /= poly.Count;
                var points = new List<Vector3>();
                var uvs = new List<Vector2>();
                var triangles = new List<int>();
                foreach (var v in poly)
                {
                    points.Add(v - middle);
                    uvs.Add(new Vector2(v.x / width + 0.5f, v.y / height + 0.5f));
                }
                for (int i = 1; i < poly.Count - 1; i++) triangles.AddRange(new[] { 0, i, i + 1 });
                var mesh = meshes[s];
                mesh.Clear();
                mesh.SetVertices(points);
                mesh.SetUVs(0, uvs);
                mesh.SetTriangles(triangles, 0);
                mesh.RecalculateBounds();

                halves[s].SetPositionAndRotation(card.TransformPoint(middle), card.rotation);
                halves[s].localScale = card.localScale;
                var apart = card.rotation * (Vector3)(normal * side);
                velocity[s] = apart * Random.Range(0.45f, 0.75f) + push * 0.22f + card.forward * 0.25f + Vector3.up * 0.15f;
                // Each half tumbles away from the cut, turning about it.
                axis[s] = (card.rotation * (Vector3)cut * 0.7f + card.forward * side * 0.7f).normalized;
                spin[s] = side * Random.Range(4f, 8f);
            }
        }

        public void Step(float dt)
        {
            if (age >= 1) return;
            age = Mathf.Min(1, age + dt / Life);
            for (int s = 0; s < 2; s++)
            {
                if (!halves[s].gameObject.activeSelf) continue;
                velocity[s].y -= 2.2f * dt;
                velocity[s] *= 1 / (1 + 0.8f * dt);
                halves[s].position += velocity[s] * dt;
                halves[s].rotation = Quaternion.AngleAxis(spin[s] * dt * Mathf.Rad2Deg, axis[s]) * halves[s].rotation;
            }
            float burn = Mathf.Clamp01((age * Life - 0.12f) / (Life - 0.2f));
            material.SetFloat("_Dissolve", Mathf.Pow(burn, 0.8f));
            if (age >= 1) foreach (var half in halves) half.gameObject.SetActive(false);
        }
    }

    /// The ribbon of light a swinging blade leaves behind it: brightest at the
    /// tip edge, fading toward the hilt and with age, smoothed between frames
    /// so a fast swing draws an arc, not a fan of straight lines.
    public class BladeTrail
    {
        const float Seconds = 0.09f;
        const int Steps = 4; // smoothing points between two frames
        struct Sample { public Vector3 inner, tip; public float time; }
        readonly List<Sample> samples = new List<Sample>();
        readonly Mesh mesh = new Mesh { name = "BladeTrail" };
        readonly List<Vector3> points = new List<Vector3>();
        readonly List<Color> colors = new List<Color>();
        readonly List<int> triangles = new List<int>();
        Color color;
        /// The colour a swing leaves in the air.
        public Color Tint { set { color = value; } }

        public BladeTrail(Transform parent, Color color, int layer)
        {
            this.color = color;
            mesh.MarkDynamic();
            var go = new GameObject("BladeTrail") { layer = layer };
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = Look.Neon(Color.white, 0, 0, 45); // under the blade
        }

        public void Clear()
        {
            if (samples.Count == 0) return;
            samples.Clear();
            mesh.Clear();
        }

        static Vector3 Spline(Vector3 a, Vector3 b, Vector3 c, Vector3 d, float t) =>
            0.5f * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

        /// Call every frame with where the blade is, in world space. `inner` is
        /// the point down the blade where the trail starts.
        public void Push(Vector3 inner, Vector3 tip, float now)
        {
            // A jump (the weapon was put somewhere new) starts a fresh trail.
            if (samples.Count > 0 && (samples[samples.Count - 1].tip - tip).sqrMagnitude > 0.7f * 0.7f) samples.Clear();
            samples.Add(new Sample { inner = inner, tip = tip, time = now });
            while (samples.Count > 0 && now - samples[0].time > Seconds) samples.RemoveAt(0);

            points.Clear(); colors.Clear(); triangles.Clear();
            int n = samples.Count;
            for (int i = 0; i < n - 1; i++)
            {
                var a = samples[Mathf.Max(0, i - 1)];
                var b = samples[i];
                var c = samples[i + 1];
                var d = samples[Mathf.Min(n - 1, i + 2)];
                for (int k = 0; k < Steps; k++)
                {
                    float t = k / (float)Steps;
                    float time = Mathf.Lerp(b.time, c.time, t);
                    float fresh = Mathf.Clamp01(1 - (now - time) / Seconds);
                    fresh *= fresh;
                    var tipAt = Spline(a.tip, b.tip, c.tip, d.tip, t);
                    var innerAt = Spline(a.inner, b.inner, c.inner, d.inner, t);
                    Add(innerAt, tipAt, fresh);
                }
            }
            if (n > 1) Add(samples[n - 1].inner, samples[n - 1].tip, 1);

            mesh.Clear();
            if (points.Count < 6) return;
            mesh.SetVertices(points);
            mesh.SetColors(colors);
            mesh.SetTriangles(triangles, 0);
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 100); // drawn in world space; never cull
        }

        /// One slice across the ribbon: clear at the inner end, the blade's
        /// colour most of the way out, nearly white at the tip.
        void Add(Vector3 inner, Vector3 tip, float fresh)
        {
            int k = points.Count;
            points.Add(inner);
            points.Add(Vector3.Lerp(inner, tip, 0.6f));
            points.Add(tip);
            colors.Add(new Color(color.r, color.g, color.b, 0));
            colors.Add(new Color(color.r, color.g, color.b, 0.22f * fresh));
            var hot = Color.Lerp(color, Color.white, 0.5f);
            colors.Add(new Color(hot.r, hot.g, hot.b, 0.6f * fresh));
            if (k == 0) return;
            for (int i = 0; i < 2; i++)
            {
                int a = k - 3 + i, b = k + i;
                triangles.AddRange(new[] { a, b, b + 1, a, b + 1, a + 1 });
            }
        }
    }
}
