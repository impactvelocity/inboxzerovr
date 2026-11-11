using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Unity.Collections;
using Unity.Jobs;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace InboxZero.EditorTools
{
    /// Writes the Kyoto v2 courtyard out for the web build (web/public/kyoto):
    /// every mesh merged by material into Unity-space vertex arrays, with what the
    /// pack's shaders work out per vertex (colour gradients, moss) and the scene's
    /// still light (sky visibility, sun visibility, the lamps) baked in, so the
    /// browser only has to multiply a texture by a vertex colour.
    ///
    /// Menu: Inbox Zero > Kyoto v2 > Export For Web. Batch mode: set WEB_OUT to the
    /// folder to write and run -executeMethod InboxZero.EditorTools.WebExport.Run.
    public static class WebExport
    {
        const int Solid = 0, Leafy = 1;            // collider layers used only while baking
        const int AoRays = 20, SunRays = 5;
        const float AoReach = 4.5f;
        /// The sun's light as it stands early in a round (see KyotoCourtyard.Apply): pitch, yaw.
        static readonly Vector2 SunAt = new Vector2(14, 188);

        class Group
        {
            public string name, kind;
            public Material material;
            public List<Vector3> pos = new List<Vector3>(), nrm = new List<Vector3>();
            public List<Vector2> uv = new List<Vector2>();
            public List<Color> mul = new List<Color>(), add = new List<Color>();
            public List<float> objY = new List<float>(), meshAo = new List<float>(), wrap = new List<float>();
            public List<int> idx = new List<int>();
            public float[] ao, sun; public Color[] lamp;
            public bool collide = true, leafy, bake = true;
            public float maxEdge;
            public Dictionary<string, string> info = new Dictionary<string, string>();
        }

        static string outDir;
        static readonly Dictionary<Texture, string> textures = new Dictionary<Texture, string>();
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        static string F(float v) => v.ToString("0.#####", Inv);
        static string V(Vector3 v) => $"[{F(v.x)},{F(v.y)},{F(v.z)}]";
        static string C(Color c) => $"[{F(c.r)},{F(c.g)},{F(c.b)}]";
        static string Q(Quaternion q) => $"[{F(q.x)},{F(q.y)},{F(q.z)},{F(q.w)}]";
        static string S(string s) => "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        static Color Lin(Material m, string p) => m.HasProperty(p) ? m.GetColor(p).linear : Color.white;
        static float Fl(Material m, string p, float fallback = 0) => m.HasProperty(p) ? m.GetFloat(p) : fallback;

        [MenuItem("Inbox Zero/Kyoto v2/Export For Web")]
        public static void Menu()
        {
            outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "../../web/public/kyoto"));
            Export();
        }

        public static void Run()
        {
            outDir = Environment.GetEnvironmentVariable("WEB_OUT");
            if (string.IsNullOrEmpty(outDir)) throw new InvalidOperationException("Set WEB_OUT");
            Export();
        }

        // ------------------------------------------------------------ textures

        /// Save a texture as PNG at no more than `max` on a side, and return its file name (no extension).
        static string Tex(Texture texture, int max, bool colour = true, bool bleed = false, string rename = null)
        {
            if (texture == null) return null;
            if (textures.TryGetValue(texture, out var known)) return known;
            string name = rename ?? texture.name.Replace(' ', '_');
            int w = texture.width, h = texture.height;
            while (w > max || h > max) { w /= 2; h /= 2; }
            var pixels = Read(texture, w, h, colour);
            if (bleed) Bleed(pixels, w, h);
            Save(pixels, w, h, name, colour);
            textures[texture] = name;
            return name;
        }

        static Color32[] Read(Texture texture, int w, int h, bool colour)
        {
            var rt = RenderTexture.GetTemporary(w, h, 0, RenderTextureFormat.ARGB32, colour ? RenderTextureReadWrite.sRGB : RenderTextureReadWrite.Linear);
            var before = RenderTexture.active;
            Graphics.Blit(texture, rt);
            RenderTexture.active = rt;
            var copy = new Texture2D(w, h, TextureFormat.RGBA32, false, !colour);
            copy.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            copy.Apply();
            RenderTexture.active = before;
            RenderTexture.ReleaseTemporary(rt);
            var pixels = copy.GetPixels32();
            Object.DestroyImmediate(copy);
            return pixels;
        }

        static void Save(Color32[] pixels, int w, int h, string name, bool colour)
        {
            var copy = new Texture2D(w, h, TextureFormat.RGBA32, false, !colour);
            copy.SetPixels32(pixels);
            copy.Apply();
            File.WriteAllBytes(Path.Combine(outDir, "png", name + ".png"), copy.EncodeToPNG());
            Object.DestroyImmediate(copy);
        }

        /// Spread the colour of the cut-out's edge into the see-through pixels round it, so
        /// smaller copies of the picture do not pick up a dark fringe.
        static void Bleed(Color32[] p, int w, int h)
        {
            var solid = new bool[p.Length];
            for (int i = 0; i < p.Length; i++) solid[i] = p[i].a > 24;
            for (int pass = 0; pass < 24; pass++)
            {
                var next = (bool[])solid.Clone();
                bool any = false;
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        int i = y * w + x;
                        if (solid[i]) continue;
                        int r = 0, g = 0, b = 0, n = 0;
                        for (int dy = -1; dy <= 1; dy++)
                            for (int dx = -1; dx <= 1; dx++)
                            {
                                int xx = x + dx, yy = y + dy;
                                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                                int j = yy * w + xx;
                                if (!solid[j]) continue;
                                r += p[j].r; g += p[j].g; b += p[j].b; n++;
                            }
                        if (n == 0) continue;
                        p[i] = new Color32((byte)(r / n), (byte)(g / n), (byte)(b / n), p[i].a);
                        next[i] = true; any = true;
                    }
                solid = next;
                if (!any) break;
            }
        }

        // ------------------------------------------------------------ gathering

        static string Kind(Material m)
        {
            string s = m.shader.name;
            if (s.EndsWith("Tree_Foliage")) return "leaf";
            if (s.EndsWith("Tree_Trunk")) return "trunk";
            if (s.EndsWith("Shader Graphs/Grass")) return "grass";
            if (s.EndsWith("Cliffs")) return "rock";
            if (s.StartsWith("ANGRYMESH") && s.EndsWith("Grass")) return "flower";
            if (s.StartsWith("ANGRYMESH") && s.EndsWith("Props")) return "mountain";
            if (s == "Universal Render Pipeline/Lit") return "lit";
            return null;
        }

        static float Mix(float a, float b, float t) => a + (b - a) * t;

        static void Add(Dictionary<string, Group> groups, Renderer renderer, Mesh mesh, int sub, Material material, Transform root, Vector3 seat)
        {
            string kind = Kind(material);
            if (kind == null) return;
            // Stones of one kind share a picture whatever their level of detail; name the group for the picture.
            string key = material.name;
            if (!groups.TryGetValue(key, out var g))
            {
                g = new Group { name = key, kind = kind, material = material };
                g.leafy = kind == "leaf";
                g.collide = kind == "lit" || kind == "trunk" || kind == "rock" || kind == "leaf";
                g.bake = kind != "mountain";
                g.maxEdge = kind == "lit" && AssetDatabase.GetAssetPath(mesh).Contains("KyotoV2") ? 0.42f : 0;
                groups[key] = g;
            }
            var toRoot = root.worldToLocalMatrix * renderer.transform.localToWorldMatrix;
            var normalToRoot = toRoot.inverse.transpose;
            var verts = mesh.vertices; var normals = mesh.normals; var uvs = mesh.uv; var colours = mesh.colors;
            var tris = mesh.GetTriangles(sub);
            bool flip = toRoot.determinant < 0;
            var map = new Dictionary<int, int>();
            var m = material;

            // What the pack's shaders work out for each vertex (see the shader graphs in Raygeas/Shared Assets).
            Color main = Color.white, hCol = Color.black, uCol = Color.black, grad = Color.white;
            float hOff = 0, hFade = 0, uOff = 0, uFade = 0, gOff = 0, gFade = 0, meshAoAmount = 0;
            bool hOn = false, uOn = false, gOn = false;
            float e1 = 0, e2 = 1; Color over = Color.black; bool overlay = false;
            switch (kind)
            {
                case "leaf":
                    main = Lin(m, "_MainColor"); hCol = Lin(m, "_Height_Gradient_Color"); uCol = Lin(m, "_UV_Gradient_Color");
                    hOn = Fl(m, "_Enable_Height_Gradient") > 0.5f; uOn = Fl(m, "_Enable_UV_Gradient") > 0.5f;
                    hOff = Fl(m, "_Height_Gradient_Offset"); hFade = Fl(m, "_Height_Gradient_Fade");
                    uOff = Fl(m, "_UV_Gradient_Offset"); uFade = Fl(m, "_UV_Gradient_Fade");
                    meshAoAmount = Fl(m, "_Ambient_Occlusion");
                    break;
                case "trunk":
                    main = Lin(m, "_BaseColor"); meshAoAmount = Fl(m, "_Ambient_Occlusion");
                    break;
                case "grass":
                    main = Lin(m, "_Base_Color"); grad = Lin(m, "_Gradient_Color");
                    gOn = Fl(m, "_Enable_Color_Gradient") > 0.5f; gOff = Fl(m, "_Gradient_Offset"); gFade = Fl(m, "_Gradient_Fade");
                    break;
                case "rock":
                    main = Lin(m, "_Base_Color");
                    overlay = Fl(m, "_ENABLE_OVERLAY") > 0.5f && m.name.IndexOf("NoGrass", StringComparison.Ordinal) < 0;
                    over = Lin(m, "_Overlay_Color"); e1 = Fl(m, "_Overlay_Edge_1"); e2 = Fl(m, "_Overlay_Edge_2");
                    break;
                case "lit":
                    main = Lin(m, "_BaseColor");
                    break;
            }

            foreach (int source in tris)
            {
                if (!map.TryGetValue(source, out int index))
                {
                    index = g.pos.Count; map[source] = index;
                    var p = toRoot.MultiplyPoint3x4(verts[source]);
                    var n = source < normals.Length ? normalToRoot.MultiplyVector(normals[source]).normalized : Vector3.up;
                    var t = source < uvs.Length ? uvs[source] : Vector2.zero;
                    float y = verts[source].y;
                    Color mul = main, add = Color.black; float wrap = 0;
                    if (kind == "leaf")
                    {
                        float t1 = 0, t2 = 0;
                        if (hOn) { float hh = y + (1 - hOff); t1 = Mathf.Clamp01(Mix(hh, 1 - hh, (1 - hFade) - 0.5f)); }
                        if (uOn) { float uu = (1 - t.y) + uOff; t2 = Mathf.Clamp01(Mix(uu, 1 - uu, uFade + 0.5f)); }
                        mul = main * ((1 - t1) * (1 - t2));
                        add = hCol * (t1 * (1 - t2)) + uCol * t2;
                        wrap = 1;
                    }
                    else if (kind == "grass" || kind == "flower")
                    {
                        if (gOn) { float s = t.y - gOff; mul = Color.Lerp(main, grad, Mathf.Clamp01(Mix(1 - s, s, gFade + 0.5f))); }
                        wrap = 1;
                    }
                    else if (kind == "rock" && overlay)
                    {
                        // moss on whatever faces up; the pack blends in its grass picture, here its colour
                        float moss = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(e1, e2 + 0.25f, n.y));
                        mul = main * (1 - moss);
                        add = over * 0.42f * moss;
                        wrap = moss * 0.6f;
                    }
                    g.pos.Add(p); g.nrm.Add(n); g.uv.Add(t); g.mul.Add(mul); g.add.Add(add); g.objY.Add(y); g.wrap.Add(wrap);
                    g.meshAo.Add(meshAoAmount > 0 && source < colours.Length ? Mix(1, colours[source].r, meshAoAmount) : 1);
                }
                g.idx.Add(index);
            }
            if (flip)
                for (int i = g.idx.Count - tris.Length; i < g.idx.Count; i += 3) { int a = g.idx[i]; g.idx[i] = g.idx[i + 1]; g.idx[i + 1] = a; }
        }

        /// Split every edge longer than `max`, the same way from both sides of it, so the
        /// light worked out at the corners has enough corners to be worked out at.
        static void Refine(Group g, float max, KyotoCourtyard yard, Transform root)
        {
            // Fine where a lamp's pool of light falls (and all over the deck, for the sun's shadows); coarse elsewhere.
            var lampAt = new List<Vector3>(); var lampPower = new List<float>(); var lampRange = new List<float>();
            foreach (var lamp in yard.lamps)
                if (lamp != null && lamp.light != null) { lampAt.Add(root.InverseTransformPoint(lamp.light.transform.position)); lampPower.Add(lamp.dusk); lampRange.Add(lamp.light.range); }
            bool everywhere = g.name == "Deck";
            float Limit(Vector3 p)
            {
                if (everywhere) return max;
                float light = 0;
                for (int i = 0; i < lampAt.Count; i++)
                {
                    float d2 = (lampAt[i] - p).sqrMagnitude, r2 = lampRange[i] * lampRange[i];
                    if (d2 < r2) { float fade = 1 - (d2 / r2) * (d2 / r2); light += lampPower[i] * fade * fade / Mathf.Max(d2, 0.05f); }
                }
                return light > 0.5f ? max : light > 0.12f ? max * 1.6f : max * 3.2f;
            }
            for (int pass = 0; pass < 6; pass++)
            {
                var mids = new Dictionary<long, int>();
                var next = new List<int>(g.idx.Count * 2);
                bool any = false;
                int Mid(int a, int b)
                {
                    float limit = Limit((g.pos[a] + g.pos[b]) * 0.5f);
                    if ((g.pos[a] - g.pos[b]).sqrMagnitude <= limit * limit) return -1;
                    long key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
                    if (mids.TryGetValue(key, out int m)) return m;
                    m = g.pos.Count;
                    g.pos.Add((g.pos[a] + g.pos[b]) * 0.5f); g.nrm.Add((g.nrm[a] + g.nrm[b]).normalized);
                    g.uv.Add((g.uv[a] + g.uv[b]) * 0.5f); g.mul.Add((g.mul[a] + g.mul[b]) * 0.5f); g.add.Add((g.add[a] + g.add[b]) * 0.5f);
                    g.objY.Add((g.objY[a] + g.objY[b]) * 0.5f); g.meshAo.Add((g.meshAo[a] + g.meshAo[b]) * 0.5f); g.wrap.Add((g.wrap[a] + g.wrap[b]) * 0.5f);
                    mids[key] = m; any = true;
                    return m;
                }
                void T(int a, int b, int c) { next.Add(a); next.Add(b); next.Add(c); }
                for (int i = 0; i < g.idx.Count; i += 3)
                {
                    int a = g.idx[i], b = g.idx[i + 1], c = g.idx[i + 2];
                    int ab = Mid(a, b), bc = Mid(b, c), ca = Mid(c, a);
                    int n = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0);
                    if (n == 0) T(a, b, c);
                    else if (n == 3) { T(a, ab, ca); T(ab, b, bc); T(ca, bc, c); T(ab, bc, ca); }
                    else if (n == 1)
                    {
                        if (ab >= 0) { T(a, ab, c); T(ab, b, c); }
                        else if (bc >= 0) { T(a, b, bc); T(a, bc, c); }
                        else { T(a, b, ca); T(ca, b, c); }
                    }
                    else
                    {
                        if (ab < 0) { T(a, b, bc); T(a, bc, ca); T(ca, bc, c); }
                        else if (bc < 0) { T(a, ab, ca); T(ab, b, c); T(ab, c, ca); }
                        else { T(a, ab, c); T(ab, bc, c); T(ab, b, bc); }
                    }
                }
                g.idx = next;
                if (!any) break;
            }
        }

        // -------------------------------------------------------------- ground

        static Group Ground(Terrain terrain, Transform root)
        {
            var data = terrain.terrainData;
            var origin = root.InverseTransformPoint(terrain.transform.position);
            var size = data.size;
            // Fine where the garden is, coarse out to the hills.
            List<float> Line(float from, float to, float fineFrom, float fineTo, float fine, float coarse)
            {
                var line = new List<float>();
                float v = from;
                while (v < to - 1e-3f)
                {
                    line.Add(v);
                    bool inside = v >= fineFrom - 1e-3f && v < fineTo - 1e-3f;
                    float step = inside ? fine : coarse;
                    float limit = v < fineFrom ? fineFrom : v < fineTo ? fineTo : to;
                    v = Mathf.Min(v + step, limit);
                }
                line.Add(to);
                return line;
            }
            var xs = Line(origin.x, origin.x + size.x, -7.2f, 5.4f, 0.14f, 2.4f);
            var zs = Line(origin.z, origin.z + size.z, 2.0f, 15.4f, 0.14f, 2.4f);
            var g = new Group { name = "Ground", kind = "terrain", collide = true };
            foreach (float z in zs)
                foreach (float x in xs)
                {
                    float u = (x - origin.x) / size.x, v = (z - origin.z) / size.z;
                    g.pos.Add(new Vector3(x, origin.y + data.GetInterpolatedHeight(u, v), z));
                    g.nrm.Add(data.GetInterpolatedNormal(u, v));
                    g.uv.Add(new Vector2(u, v));
                    g.mul.Add(Color.white); g.add.Add(Color.black); g.objY.Add(0); g.meshAo.Add(1); g.wrap.Add(0.25f);
                }
            int w = xs.Count;
            for (int j = 0; j < zs.Count - 1; j++)
                for (int i = 0; i < w - 1; i++)
                {
                    int a = j * w + i, b = a + 1, c = a + w, d = c + 1;
                    g.idx.Add(a); g.idx.Add(c); g.idx.Add(b);
                    g.idx.Add(b); g.idx.Add(c); g.idx.Add(d);
                }
            var layers = new List<string>();
            foreach (var layer in data.terrainLayers)
            {
                // the layer's own multiplier, used as it is (the builder writes it that way)
                var tint = new Color(layer.diffuseRemapMax.x, layer.diffuseRemapMax.y, layer.diffuseRemapMax.z);
                layers.Add($"{{\"texture\":{S(Tex(layer.diffuseTexture, 1024))},\"tile\":{F(layer.tileSize.x)},\"tint\":{C(tint)}}}");
            }
            g.info["layers"] = "[" + string.Join(",", layers) + "]";
            g.info["origin"] = V(origin); g.info["size"] = V(size);
            // which layer lies where: red moss, green earth, blue gravel
            int res = data.alphamapResolution;
            var maps = data.GetAlphamaps(0, 0, res, res);
            var pixels = new Color32[res * res];
            for (int z = 0; z < res; z++)
                for (int x = 0; x < res; x++)
                    pixels[z * res + x] = new Color32((byte)(maps[z, x, 0] * 255), (byte)(maps[z, x, 1] * 255), (byte)(maps[z, x, 2] * 255), 255);
            Save(pixels, res, res, "Ground_Splat", false);
            g.info["splat"] = S("Ground_Splat");
            return g;
        }

        /// The pond as a sheet of its own: only where the ground lies under the water, with how
        /// deep it is there at each corner (the pack's water reads that from the camera's depth).
        static Group Pond(Renderer water, Terrain terrain, Transform root)
        {
            var bounds = water.bounds;
            float level = root.InverseTransformPoint(bounds.center).y;
            var data = terrain.terrainData;
            var origin = root.InverseTransformPoint(terrain.transform.position);
            var g = new Group { name = "Pond", kind = "water", collide = false, material = water.sharedMaterial };
            const float cell = 0.09f;
            var min = root.InverseTransformPoint(bounds.min); var max = root.InverseTransformPoint(bounds.max);
            int nx = Mathf.CeilToInt((max.x - min.x) / cell), nz = Mathf.CeilToInt((max.z - min.z) / cell);
            var depth = new float[nx + 1, nz + 1];
            var at = new int[nx + 1, nz + 1];
            for (int i = 0; i <= nx; i++)
                for (int j = 0; j <= nz; j++)
                {
                    float x = min.x + i * cell, z = min.z + j * cell;
                    float ground = origin.y + data.GetInterpolatedHeight((x - origin.x) / data.size.x, (z - origin.z) / data.size.z);
                    depth[i, j] = level - ground; at[i, j] = -1;
                }
            int Corner(int i, int j)
            {
                if (at[i, j] >= 0) return at[i, j];
                at[i, j] = g.pos.Count;
                g.pos.Add(new Vector3(min.x + i * cell, level, min.z + j * cell)); g.nrm.Add(Vector3.up);
                g.uv.Add(new Vector2(min.x + i * cell, min.z + j * cell));
                g.mul.Add(Color.white); g.add.Add(Color.black); g.objY.Add(depth[i, j]); g.meshAo.Add(1); g.wrap.Add(0);
                return at[i, j];
            }
            for (int i = 0; i < nx; i++)
                for (int j = 0; j < nz; j++)
                {
                    if (Mathf.Max(Mathf.Max(depth[i, j], depth[i + 1, j]), Mathf.Max(depth[i, j + 1], depth[i + 1, j + 1])) < -0.02f) continue;
                    int a = Corner(i, j), b = Corner(i + 1, j), c = Corner(i, j + 1), d = Corner(i + 1, j + 1);
                    g.idx.Add(a); g.idx.Add(c); g.idx.Add(b);
                    g.idx.Add(b); g.idx.Add(c); g.idx.Add(d);
                }
            var m = water.sharedMaterial;
            g.info["shallow"] = C(Lin(m, "_Shallow_Color")); g.info["deep"] = C(Lin(m, "_Deep_Color"));
            g.info["normalMap"] = S(Tex(m.GetTexture("_Water_Normal"), 512, false));
            g.info["tiling"] = F(Fl(m, "_Tiling")); g.info["normalStrength"] = F(Fl(m, "_Normal_Strength"));
            g.info["wavesSpeed"] = F(Fl(m, "_Waves_Speed")); g.info["depthFade"] = F(Fl(m, "_Depth_Fade_Distance"));
            g.info["coastFade"] = F(Fl(m, "_Coast_Fade")); g.info["foamDistance"] = F(Fl(m, "_Foam_Distance"));
            g.info["level"] = F(level);
            return g;
        }

        // ---------------------------------------------------------------- bake

        static Vector3 Perpendicular(Vector3 n) => Vector3.Cross(n, Mathf.Abs(n.y) < 0.9f ? Vector3.up : Vector3.right).normalized;

        static void Bake(List<Group> groups, Transform root, KyotoCourtyard yard)
        {
            // Stand-ins to cast rays at; the packs' own colliders step aside.
            foreach (var collider in root.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            var holder = new GameObject("Bake colliders");
            foreach (var g in groups)
            {
                if (!g.collide) continue;
                var mesh = new Mesh { indexFormat = IndexFormat.UInt32 };
                mesh.SetVertices(g.pos); mesh.SetTriangles(g.idx, 0); mesh.RecalculateBounds();
                var go = new GameObject("c " + g.name) { layer = g.leafy ? Leafy : Solid };
                go.transform.SetParent(holder.transform, false);
                go.AddComponent<MeshCollider>().sharedMesh = mesh;
            }
            Physics.SyncTransforms();
            var random = new System.Random(11);
            var hemi = new Vector3[AoRays];
            for (int i = 0; i < AoRays; i++)
            {
                // cosine-weighted, stratified round the pole
                float u = (i + (float)random.NextDouble()) / AoRays, v = (float)random.NextDouble();
                float r = Mathf.Sqrt(u), phi = 6.2831853f * (v + i * 0.618034f);
                hemi[i] = new Vector3(r * Mathf.Cos(phi), Mathf.Sqrt(1 - u), r * Mathf.Sin(phi));
            }
            var toSun = -(Quaternion.Euler(SunAt.x, SunAt.y, 0) * Vector3.forward);
            var sunA = Perpendicular(toSun); var sunB = Vector3.Cross(toSun, sunA);
            var query = new QueryParameters(1 << Solid | 1 << Leafy, false, QueryTriggerInteraction.Ignore, true);
            int per = AoRays + SunRays;

            foreach (var g in groups)
            {
                int n = g.pos.Count;
                g.ao = new float[n]; g.sun = new float[n]; g.lamp = new Color[n];
                for (int i = 0; i < n; i++) { g.ao[i] = 1; g.sun[i] = 1; g.lamp[i] = Color.black; }
                if (!g.bake) continue;
                const int chunk = 16384;
                for (int start = 0; start < n; start += chunk)
                {
                    int count = Mathf.Min(chunk, n - start);
                    var commands = new NativeArray<RaycastCommand>(count * per, Allocator.TempJob);
                    var hits = new NativeArray<RaycastHit>(count * per, Allocator.TempJob);
                    for (int i = 0; i < count; i++)
                    {
                        var nrm = g.nrm[start + i];
                        // leaves and blades are lit from both sides: count the sky above them, not behind the card
                        if (g.wrap[start + i] > 0.9f) nrm = (nrm + Vector3.up * 1.5f).normalized;
                        var from = g.pos[start + i] + nrm * 0.03f;
                        var a = Perpendicular(nrm); var b = Vector3.Cross(nrm, a);
                        for (int r = 0; r < AoRays; r++)
                            commands[i * per + r] = new RaycastCommand(from, a * hemi[r].x + nrm * hemi[r].y + b * hemi[r].z, query, AoReach);
                        var sunFrom = g.pos[start + i] + g.nrm[start + i] * 0.03f + toSun * 0.03f;
                        for (int r = 0; r < SunRays; r++)
                        {
                            float angle = r * 2.39996f, spread = 0.035f * Mathf.Sqrt((r + 0.5f) / SunRays);
                            commands[i * per + AoRays + r] = new RaycastCommand(sunFrom, (toSun + (sunA * Mathf.Cos(angle) + sunB * Mathf.Sin(angle)) * spread).normalized, query, 80);
                        }
                    }
                    RaycastCommand.ScheduleBatch(commands, hits, 256, 1).Complete();
                    for (int i = 0; i < count; i++)
                    {
                        float open = 0, lit = 0;
                        for (int r = 0; r < per; r++)
                        {
                            var hit = hits[i * per + r];
                            // a card of leaves is mostly gaps: most of the light gets through one
                            float through = hit.collider == null ? 1 : hit.collider.gameObject.layer == Leafy ? (r < AoRays ? 0.7f : 0.6f) : 0;
                            // something near blocks more of the sky than something far
                            if (r < AoRays) open += hit.collider == null ? 1 : Mathf.Lerp(through, 1, Mathf.Pow(hit.distance / AoReach, 2));
                            else lit += through;
                        }
                        g.ao[start + i] = open / AoRays * g.meshAo[start + i];
                        g.sun[start + i] = lit / SunRays;
                    }
                    commands.Dispose(); hits.Dispose();
                }
                // The lamps, as they burn at dusk. They throw no shadows in the game either.
                foreach (var lamp in yard.lamps)
                {
                    if (lamp == null || lamp.light == null || !lamp.light.gameObject.activeInHierarchy) continue;
                    var at = root.InverseTransformPoint(lamp.light.transform.position);
                    var colour = lamp.light.color.linear * lamp.dusk;
                    float range = lamp.light.range, range2 = range * range;
                    for (int i = 0; i < n; i++)
                    {
                        var to = at - g.pos[i];
                        float d2 = to.sqrMagnitude;
                        if (d2 >= range2) continue;
                        float fade = Mathf.Clamp01(1 - (d2 / range2) * (d2 / range2));
                        float atten = fade * fade / Mathf.Max(d2, 0.02f);
                        float facing = Vector3.Dot(g.nrm[i], to / Mathf.Sqrt(d2));
                        float wrap = g.wrap[i];
                        facing = Mathf.Lerp(Mathf.Max(facing, 0), facing * 0.5f + 0.5f, wrap);
                        g.lamp[i] += colour * (atten * facing);
                    }
                }
            }
            Object.DestroyImmediate(holder);
        }

        // --------------------------------------------------------------- write

        static void Align(BinaryWriter w) { while (w.BaseStream.Position % 4 != 0) w.Write((byte)0); }
        static byte B(float v) => (byte)Mathf.Clamp(Mathf.RoundToInt(v * 255), 0, 255);
        static byte Root(float v, float top) => B(Mathf.Sqrt(Mathf.Clamp01(v / top)));

        static string Write(BinaryWriter w, Group g, bool lightFields)
        {
            var sb = new StringBuilder();
            int n = g.pos.Count;
            var min = g.pos[0]; var max = g.pos[0];
            foreach (var p in g.pos) { min = Vector3.Min(min, p); max = Vector3.Max(max, p); }
            sb.Append($"{{\"name\":{S(g.name)},\"kind\":{S(g.kind)},\"vertices\":{n},\"indices\":{g.idx.Count},\"min\":{V(min)},\"max\":{V(max)}");
            foreach (var kv in g.info) sb.Append($",{S(kv.Key)}:{kv.Value}");
            Align(w); sb.Append($",\"position\":{w.BaseStream.Position}");
            foreach (var p in g.pos) { w.Write(p.x); w.Write(p.y); w.Write(p.z); }
            Align(w); sb.Append($",\"normal\":{w.BaseStream.Position}");
            foreach (var p in g.nrm) { w.Write((sbyte)Mathf.RoundToInt(p.x * 127)); w.Write((sbyte)Mathf.RoundToInt(p.y * 127)); w.Write((sbyte)Mathf.RoundToInt(p.z * 127)); w.Write((sbyte)0); }
            Align(w); sb.Append($",\"uv\":{w.BaseStream.Position}");
            foreach (var p in g.uv) { w.Write(p.x); w.Write(p.y); }
            if (lightFields)
            {
                // mul: what the picture is multiplied by, and how much sky the corner sees
                Align(w); sb.Append($",\"mul\":{w.BaseStream.Position}");
                for (int i = 0; i < n; i++) { w.Write(Root(g.mul[i].r, 1)); w.Write(Root(g.mul[i].g, 1)); w.Write(Root(g.mul[i].b, 1)); w.Write(B(g.ao[i])); }
                // add: flat colour laid over it, and how much sun the corner sees
                Align(w); sb.Append($",\"add\":{w.BaseStream.Position}");
                for (int i = 0; i < n; i++) { w.Write(Root(g.add[i].r, 1)); w.Write(Root(g.add[i].g, 1)); w.Write(Root(g.add[i].b, 1)); w.Write(B(g.sun[i])); }
                // lamp: the lamps' light there at dusk (up to 16), and how far the light wraps round
                Align(w); sb.Append($",\"lamp\":{w.BaseStream.Position}");
                for (int i = 0; i < n; i++) { w.Write(Root(g.lamp[i].r, 16)); w.Write(Root(g.lamp[i].g, 16)); w.Write(Root(g.lamp[i].b, 16)); w.Write(B(g.wrap[i])); }
                Align(w); sb.Append($",\"objY\":{w.BaseStream.Position}");
                foreach (float y in g.objY) w.Write(y);
            }
            Align(w); sb.Append($",\"index\":{w.BaseStream.Position}");
            foreach (int i in g.idx) w.Write((uint)i);
            sb.Append("}");
            return sb.ToString();
        }

        static void Export()
        {
            Directory.CreateDirectory(Path.Combine(outDir, "png"));
            textures.Clear();
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/KyotoV2/Courtyard.prefab");
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            go.transform.position = Vector3.zero; go.transform.rotation = Quaternion.identity;
            var root = go.transform;
            var yard = go.GetComponent<KyotoCourtyard>();
            var seat = new Vector3(0, 1.55f, 0);
            var json = new StringBuilder("{\n");

            var glowOf = new Dictionary<(Renderer, int), KyotoCourtyard.Glow>();
            foreach (var glow in yard.glows) if (glow != null && glow.renderer != null) glowOf[(glow.renderer, glow.slot)] = glow;

            // ---- meshes, by material
            var groups = new Dictionary<string, Group>();
            Renderer pondRenderer = null;
            var halos = new List<string>();
            foreach (var renderer in go.GetComponentsInChildren<MeshRenderer>(true))
            {
                if (!renderer.gameObject.activeInHierarchy) continue;
                var filter = renderer.GetComponent<MeshFilter>();
                var mesh = filter ? filter.sharedMesh : null;
                if (mesh == null) continue;
                var materials = renderer.sharedMaterials;
                if (materials.Length == 0 || materials[0] == null) continue;
                string shader = materials[0].shader.name;
                if (shader.EndsWith("Water")) { pondRenderer = renderer; continue; }
                if (shader.EndsWith("KyotoHalo"))
                {
                    glowOf.TryGetValue((renderer, -1), out var glow);
                    var t = renderer.transform;
                    string kind = renderer == yard.sunVeil ? "veil" : materials[0].name == "Shaft" ? "shaft" : "halo";
                    halos.Add($"{{\"name\":{S(renderer.name)},\"kind\":{S(kind)},\"position\":{V(root.InverseTransformPoint(t.position))},\"rotation\":{Q(Quaternion.Inverse(root.rotation) * t.rotation)},\"scale\":{V(t.lossyScale)},\"core\":{F(materials[0].GetFloat("_Core"))}" +
                              (glow != null ? $",\"dusk\":{C(glow.dusk)},\"night\":{C(glow.night)},\"flicker\":{F(glow.flicker)},\"sunlit\":{(glow.sunlit ? "true" : "false")}" : "") + "}");
                    continue;
                }
                // The nearest level of detail close to the seat, the next one further off.
                var lodGroup = renderer.GetComponentInParent<LODGroup>();
                if (lodGroup != null)
                {
                    var lods = lodGroup.GetLODs();
                    int mine = -1;
                    for (int i = 0; i < lods.Length; i++) if (lods[i].renderers.Contains(renderer)) mine = i;
                    float away = Vector3.Distance(root.InverseTransformPoint(renderer.bounds.ClosestPoint(seat)), seat);
                    int want = away > 17 ? Mathf.Min(1, lods.Length - 1) : 0;
                    if (mine != want) continue;
                }
                for (int sub = 0; sub < Mathf.Min(mesh.subMeshCount, materials.Length); sub++)
                {
                    var material = materials[sub];
                    if (material == null) continue;
                    int before = groups.Count;
                    Add(groups, renderer, mesh, sub, material, root, seat);
                    // which of its panes glow, and how brightly
                    if (groups.TryGetValue(material.name, out var g) && glowOf.TryGetValue((renderer, sub), out var glow) && !g.info.ContainsKey("glowDusk"))
                    {
                        g.info["glowDusk"] = C(glow.dusk); g.info["glowNight"] = C(glow.night); g.info["flicker"] = F(glow.flicker);
                    }
                }
            }
            var list = groups.Values.ToList();
            foreach (var g in list)
            {
                var m = g.material;
                Texture main = null;
                foreach (string p in new[] { "_BaseMap", "_Albedo", "_Base_Texture", "_Base_Map", "_BaseAlbedo" })
                    if (main == null && m.HasProperty(p)) main = m.GetTexture(p);
                bool cut = g.kind == "leaf" || g.kind == "grass" || g.kind == "flower";
                bool old = main != null && main.name == "Architecture_Albedo";
                if (main != null && !old) g.info["texture"] = S(Tex(main, 1024, true, cut));
                if (old) g.info["texture"] = S("Architecture");
                if (cut) g.info["cutoff"] = F(Fl(m, "_AlphaCutoff", Fl(m, "_Alpha_Cutoff", Fl(m, "_BaseOpacityCutoff", 0.35f))));
                if (m.HasProperty("_EmissionMap") && m.GetTexture("_EmissionMap") != null && m.IsKeywordEnabled("_EMISSION"))
                    g.info["emissionMap"] = S(Tex(m.GetTexture("_EmissionMap"), 512));
                if (m.HasProperty("_EmissionColor") && m.IsKeywordEnabled("_EMISSION")) g.info["emission"] = C(m.GetColor("_EmissionColor"));
                if (m.HasProperty("_Smoothness")) g.info["smoothness"] = F(m.GetFloat("_Smoothness"));
                if (g.kind == "leaf")
                {
                    g.info["sssColor"] = C(Lin(m, "_SSS_Color")); g.info["sssOffset"] = F(Fl(m, "_SSS_Offset")); g.info["sssFade"] = F(Fl(m, "_SSS_Fade"));
                    g.info["sssAgainstSun"] = F(Fl(m, "_SSS_Against_Sun"));
                    g.info["shake"] = F(Fl(m, "_Vertex_Shake")); g.info["shakeSpeed"] = F(Fl(m, "_Vertex_Shake_Speed")); g.info["shakeScale"] = F(Fl(m, "_Vertex_Shake_Noise_Scale"));
                }
                if (g.kind == "leaf" || g.kind == "trunk")
                {
                    g.info["windForce"] = F(Fl(m, "_Wind_Force_Multiplier", 1)); g.info["windScale"] = F(Fl(m, "_Noise_Scale_Multiplier", 1)); g.info["windSpeed"] = F(Fl(m, "_Noise_Speed_Multiplier", 1));
                }
                if (g.kind == "grass") g.info["windForce"] = F(Fl(m, "_Wind_Force_Multiplier", 1));
                if (g.maxEdge > 0) Refine(g, g.maxEdge, yard, root);
            }

            // The old buildings: one picture, with the shade Blender worked out for it multiplied in.
            {
                var albedo = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/KyotoV2/Architecture_Albedo.png");
                var occlusion = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/KyotoV2/Architecture_Occlusion.png");
                const int size = 2048;
                var a = Read(albedo, size, size, true); var o = Read(occlusion, size, size, false);
                for (int i = 0; i < a.Length; i++)
                {
                    // the shade in linear light, the picture stored for the eye: multiply by its square root, near enough
                    // (half strength: the sky each corner sees is baked as well, and Unity shades only the sky's light with this)
                    float shade = Mathf.Lerp(1, Mathf.Pow(o[i].r / 255f, 1 / 2.2f), 0.45f);
                    a[i] = new Color32((byte)(a[i].r * shade), (byte)(a[i].g * shade), (byte)(a[i].b * shade), 255);
                }
                Save(a, size, size, "Architecture", true);
            }

            var terrain = go.GetComponentInChildren<Terrain>();
            list.Add(Ground(terrain, root));
            if (pondRenderer != null) list.Add(Pond(pondRenderer, terrain, root));

            Bake(list, root, yard);

            using (var stream = File.Create(Path.Combine(outDir, "courtyard.bin")))
            using (var w = new BinaryWriter(stream))
            {
                json.Append("\"groups\":[\n");
                json.Append(string.Join(",\n", list.OrderBy(g => g.kind).ThenBy(g => g.name).Select(g => Write(w, g, true))));
                json.Append("\n],\n");
            }
            json.Append("\"halos\":[\n" + string.Join(",\n", halos) + "\n],\n");

            var lamps = new List<string>();
            foreach (var lamp in yard.lamps)
                if (lamp != null && lamp.light != null)
                    lamps.Add($"{{\"name\":{S(lamp.light.name)},\"position\":{V(root.InverseTransformPoint(lamp.light.transform.position))},\"color\":{C(lamp.light.color.linear)},\"range\":{F(lamp.light.range)},\"dusk\":{F(lamp.dusk)},\"night\":{F(lamp.night)},\"flicker\":{F(lamp.flicker)}}}");
            json.Append("\"lamps\":[\n" + string.Join(",\n", lamps) + "\n],\n");

            var systems = new List<string>();
            foreach (var ps in go.GetComponentsInChildren<ParticleSystem>(true))
            {
                var main = ps.main; var shape = ps.shape; var r = ps.GetComponent<ParticleSystemRenderer>();
                systems.Add($"{{\"name\":{S(ps.transform.parent == root ? ps.name : ps.transform.parent.name + "/" + ps.name)},\"position\":{V(root.InverseTransformPoint(ps.transform.position))},\"rotation\":{Q(ps.transform.rotation)},\"scale\":{V(ps.transform.lossyScale)},\"shape\":{S(shape.shapeType.ToString())},\"shapeScale\":{V(shape.scale)},\"radius\":{F(shape.radius)},\"rate\":{F(ps.emission.rateOverTime.constant)},\"max\":{main.maxParticles},\"life\":[{F(main.startLifetime.constantMin)},{F(main.startLifetime.constantMax)}],\"size\":[{F(main.startSize.constantMin)},{F(main.startSize.constantMax)}],\"speed\":[{F(main.startSpeed.constantMin)},{F(main.startSpeed.constantMax)}],\"gravity\":{F(main.gravityModifier.constant)},\"material\":{S(r.sharedMaterial ? r.sharedMaterial.name : "")},\"mesh\":{S(r.mesh ? r.mesh.name : "")},\"active\":{(ps.gameObject.activeInHierarchy ? "true" : "false")}}}");
            }
            json.Append("\"particles\":[\n" + string.Join(",\n", systems) + "\n],\n");
            json.Append($"\"startAt\":{F(yard.startAt)},\"endAt\":{F(yard.endAt)},\"fieldOfView\":{F(yard.desktopFieldOfView)},\"sunVeil\":{C(yard.sunVeilColour)},\"bakedSun\":{V(-(Quaternion.Euler(SunAt.x, SunAt.y, 0) * Vector3.forward))},\n");

            // ---- the sky: the Meadow panorama, squeezed into eight bits as c / (1 + c)
            {
                var sky = yard.skySource.GetTexture("_Sky");
                const int w = 4096, h = 2048;
                var rt = RenderTexture.GetTemporary(w, h, 0, RenderTextureFormat.ARGBFloat, RenderTextureReadWrite.Linear);
                Graphics.Blit(sky, rt);
                var before = RenderTexture.active; RenderTexture.active = rt;
                var copy = new Texture2D(w, h, TextureFormat.RGBAFloat, false, true);
                copy.ReadPixels(new Rect(0, 0, w, h), 0, 0); copy.Apply();
                RenderTexture.active = before; RenderTexture.ReleaseTemporary(rt);
                var raw = copy.GetPixels();
                var pixels = new Color32[raw.Length];
                float top = 0;
                for (int i = 0; i < raw.Length; i++)
                {
                    var c = raw[i]; top = Mathf.Max(top, Mathf.Max(c.r, Mathf.Max(c.g, c.b)));
                    pixels[i] = new Color32(B(Mathf.LinearToGammaSpace(c.r / (1 + c.r))), B(Mathf.LinearToGammaSpace(c.g / (1 + c.g))), B(Mathf.LinearToGammaSpace(c.b / (1 + c.b))), 255);
                }
                Object.DestroyImmediate(copy);
                Save(pixels, w, h, "Sky", true);
                json.Append($"\"sky\":{{\"texture\":\"Sky\",\"brightest\":{F(top)},\"source\":{S(sky.name + " " + sky.width + "x" + sky.height)}}},\n");
            }

            // ---- the petal the tree sheds
            foreach (var ps in go.GetComponentsInChildren<ParticleSystemRenderer>(true))
                if (ps.sharedMaterial != null && ps.sharedMaterial.name.StartsWith("CherryBlossom"))
                {
                    var m = ps.sharedMaterial;
                    json.Append($"\"petal\":{{\"texture\":{S(Tex(m.GetTexture("_BaseMap"), 256, true, true))},\"color\":{C(Lin(m, "_BaseColor"))},\"emission\":{C(m.GetColor("_EmissionColor"))},\"mesh\":{S(ps.mesh ? ps.mesh.name : "")}}},\n");
                    break;
                }

            // ---- what the hand holds, and the letter
            using (var stream = File.Create(Path.Combine(outDir, "props.bin")))
            using (var w = new BinaryWriter(stream))
            {
                var parts = new List<string>();
                var weapon = new GameObject("Katana").transform;
                var model = Object.Instantiate(Resources.Load<GameObject>("Kyoto/Katana"), weapon);
                model.transform.localScale *= InboxGame.SwordBladeEnd / 0.86f;
                foreach (var renderer in model.GetComponentsInChildren<MeshRenderer>())
                {
                    var mesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                    var to = weapon.worldToLocalMatrix * renderer.transform.localToWorldMatrix;
                    for (int sub = 0; sub < mesh.subMeshCount; sub++)
                    {
                        var g = new Group { name = renderer.name + "#" + sub, kind = "katana" };
                        var verts = mesh.vertices; var normals = mesh.normals; var uvs = mesh.uv;
                        var map = new Dictionary<int, int>();
                        foreach (int source in mesh.GetTriangles(sub))
                        {
                            if (!map.TryGetValue(source, out int index))
                            {
                                index = g.pos.Count; map[source] = index;
                                g.pos.Add(to.MultiplyPoint3x4(verts[source])); g.nrm.Add(to.inverse.transpose.MultiplyVector(normals[source]).normalized);
                                g.uv.Add(source < uvs.Length ? uvs[source] : Vector2.zero);
                            }
                            g.idx.Add(index);
                        }
                        // the blade's shader paints along the model's own length: say where that is
                        var first = to.MultiplyPoint3x4(Vector3.zero); var up = to.MultiplyVector(Vector3.up);
                        g.info["origin"] = V(first); g.info["up"] = V(up);
                        parts.Add(Write(w, g, false));
                    }
                }
                Object.DestroyImmediate(weapon.gameObject);
                var letter = KyotoWorld.Letter();
                if (letter == null)
                {
                    // KyotoWorld.Letter needs a readable mesh; in the editor the same steps work on any mesh
                    var prefabLetter = Resources.Load<GameObject>("Kyoto/Letter");
                    Mesh source = null; Transform node = null;
                    var skinned = prefabLetter.GetComponentInChildren<SkinnedMeshRenderer>();
                    if (skinned != null) { source = skinned.sharedMesh; node = skinned.transform; }
                    else { var f = prefabLetter.GetComponentInChildren<MeshFilter>(); source = f.sharedMesh; node = f.transform; }
                    var turn = Matrix4x4.Rotate(Quaternion.Euler(0, 180, 0)) * prefabLetter.transform.worldToLocalMatrix * node.localToWorldMatrix;
                    letter = new Mesh();
                    letter.vertices = source.vertices.Select(v => turn.MultiplyPoint3x4(v)).ToArray();
                    letter.normals = source.normals.Select(v => turn.MultiplyVector(v).normalized).ToArray();
                    letter.uv = source.uv; letter.triangles = source.triangles;
                }
                {
                    var g = new Group { name = "Letter", kind = "letter" };
                    g.pos.AddRange(letter.vertices); g.nrm.AddRange(letter.normals); g.uv.AddRange(letter.uv); g.idx.AddRange(letter.triangles);
                    parts.Add(Write(w, g, false));
                }
                json.Append("\"props\":[\n" + string.Join(",\n", parts) + "\n],\n");
            }
            json.Append($"\"exported\":{S(DateTime.Now.ToString("s"))}\n}}\n");
            File.WriteAllText(Path.Combine(outDir, "courtyard.json"), json.ToString());

            var report = new StringBuilder();
            int verts2 = 0, tris2 = 0;
            foreach (var g in list.OrderByDescending(g => g.idx.Count))
            {
                verts2 += g.pos.Count; tris2 += g.idx.Count / 3;
                report.AppendLine($"{g.kind,-9} {g.name,-36} {g.pos.Count,7} verts {g.idx.Count / 3,7} tris  ao {g.ao.Average():F2} sun {g.sun.Average():F2} lamp {g.lamp.Max(c => c.maxColorComponent):F1}");
            }
            report.AppendLine($"{list.Count} groups, {verts2} vertices, {tris2} triangles, {textures.Count} textures");
            File.WriteAllText(Path.Combine(outDir, "export-report.txt"), report.ToString());
            Debug.Log("[web export] " + report);
            Object.DestroyImmediate(go);
        }
    }
}
