using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace InboxZero
{
    /// Colours, materials and small mesh helpers shared by the game.
    public static class Look
    {
        public static readonly Color Cyan = Hex(0x20e7f2);
        public static readonly Color Coral = Hex(0xff5e7e);
        public static readonly Color Gold = Hex(0xffd24a);
        public static readonly Color Magenta = Hex(0xc864ff);
        public static readonly Color Navy = Hex(0x121a33);
        public static readonly Color Green = Hex(0x5dffa1);
        public static readonly Color Face = Hex(0x0b1226);
        public static readonly Color Text = Hex(0xf3f7ff);
        public static readonly Color Dim = Hex(0xb5b1d9);
        /// The dark, slightly see-through face of cards and chips.
        public static readonly Color Glass = Hex(0x110a20, 0.84f);

        public static Color Hex(int rgb, float alpha = 1) =>
            new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, alpha);

        public static Color Hsl(float hue, float s, float l)
        {
            float c = (1 - Mathf.Abs(2 * l - 1)) * s;
            float h = (hue % 360) / 60f;
            float x = c * (1 - Mathf.Abs(h % 2 - 1));
            float m = l - c / 2;
            Vector3 rgb =
                h < 1 ? new Vector3(c, x, 0) : h < 2 ? new Vector3(x, c, 0) :
                h < 3 ? new Vector3(0, c, x) : h < 4 ? new Vector3(0, x, c) :
                h < 5 ? new Vector3(x, 0, c) : new Vector3(c, 0, x);
            return new Color(rgb.x + m, rgb.y + m, rgb.z + m, 1);
        }

        public static Shader Shader(string name) => Resources.Load<Shader>("Shaders/" + name);

        /// Works in play mode and in the editor (the scene builder and checks).
        public static void Kill(Object item)
        {
            if (item == null) return;
            if (Application.isPlaying) Object.Destroy(item);
            else Object.DestroyImmediate(item);
        }

        static Material Unlit(Color color, BlendMode src, BlendMode dst, bool transparent)
        {
            var material = new Material(Shader("Unlit")) { color = color };
            material.SetFloat("_SrcBlend", (float)src);
            material.SetFloat("_DstBlend", (float)dst);
            material.SetFloat("_ZWrite", transparent ? 0 : 1);
            material.renderQueue = transparent ? (int)RenderQueue.Transparent : (int)RenderQueue.Geometry;
            return material;
        }

        /// Solid, self-lit colour.
        public static Material Glow(Color color) => Unlit(color, BlendMode.One, BlendMode.Zero, false);

        /// See-through colour; alpha comes from the colour.
        public static Material Sheer(Color color) =>
            Unlit(color, BlendMode.SrcAlpha, BlendMode.OneMinusSrcAlpha, true);

        /// Adds light to whatever is behind it; alpha is the strength.
        public static Material Additive(Color color) => Unlit(color, BlendMode.SrcAlpha, BlendMode.One, true);

        /// Shows a texture drawn by Painter (premultiplied alpha).
        public static Material Label(Texture texture)
        {
            var material = Unlit(Color.white, BlendMode.One, BlendMode.OneMinusSrcAlpha, true);
            material.mainTexture = texture;
            return material;
        }

        /// A Painter texture shown as a card of light (see the Holo shader).
        public static Material Holo(Texture texture)
        {
            var material = new Material(Shader("Holo")) { mainTexture = texture };
            material.renderQueue = (int)RenderQueue.Transparent;
            return material;
        }

        /// Fade a Label material: premultiplied, so every channel scales.
        public static void SetOpacity(Material material, float opacity) =>
            material.color = new Color(opacity, opacity, opacity, opacity);

        public static Material Lit(Color color, float metal)
        {
            var material = new Material(Shader("Lit")) { color = color };
            material.SetFloat("_Metal", metal);
            return material;
        }

        /// Additive glow (see the Neon shader). `fadeFar` > 0 fades it with distance.
        public static Material Neon(Color color, float fadeNear = 0, float fadeFar = 0, int queueOffset = 0, bool lines = false)
        {
            var material = new Material(Shader("Neon")) { color = color };
            material.SetFloat("_Lines", lines ? 1 : 0);
            material.SetFloat("_FadeNear", fadeNear);
            material.SetFloat("_FadeFar", fadeFar);
            material.renderQueue = (int)RenderQueue.Transparent + queueOffset;
            return material;
        }

        static Color Hot(Color color) => Color.Lerp(color, Color.white, 0.65f);

        /// One glowing stroke from a to b: `across` is the direction of its width,
        /// `offsets` the cross-section and `colors` the colour at each offset.
        /// `tail` scales the alpha at the b end (0 makes it taper away).
        static void Stroke(List<Vector3> points, List<Color> colors, List<int> triangles,
            Vector3 a, Vector3 b, Vector3 across, float[] offsets, Color[] shades, float tail = 1)
        {
            int first = points.Count;
            for (int i = 0; i < offsets.Length; i++)
            {
                points.Add(a + across * offsets[i]);
                colors.Add(shades[i]);
                points.Add(b + across * offsets[i]);
                var faded = shades[i];
                faded.a *= tail;
                colors.Add(faded);
            }
            for (int i = 0; i < offsets.Length - 1; i++)
            {
                int k = first + i * 2;
                triangles.AddRange(new[] { k, k + 1, k + 3, k, k + 3, k + 2 });
            }
        }

        static Mesh GlowMesh(string name, List<Vector3> points, List<Color> colors, List<int> triangles)
        {
            var mesh = new Mesh { name = name };
            mesh.SetVertices(points);
            mesh.SetColors(colors);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            return mesh;
        }

        /// A glowing rectangular outline in the XY plane: a hot core line of
        /// width `core` with a soft halo reaching `halo` either side.
        public static Mesh NeonFrame(float halfW, float halfH, float core, float halo, Color color)
        {
            var points = new List<Vector3>();
            var colors = new List<Color>();
            var triangles = new List<int>();
            var clear = new Color(color.r, color.g, color.b, 0);
            var offsets = new[] { -halo, -core / 2, core / 2, halo };
            var shades = new[] { clear, Hot(color), Hot(color), clear };
            var corners = new[]
            {
                new Vector3(-halfW, -halfH), new Vector3(halfW, -halfH), new Vector3(halfW, halfH), new Vector3(-halfW, halfH),
            };
            for (int i = 0; i < 4; i++)
            {
                Vector3 a = corners[i], b = corners[(i + 1) % 4];
                var along = (b - a).normalized;
                Stroke(points, colors, triangles, a - along * halo * 0.7f, b + along * halo * 0.7f,
                    new Vector3(-along.y, along.x), offsets, shades);
            }
            return GlowMesh("NeonFrame", points, colors, triangles);
        }

        /// A glowing line from the origin along +Z that tapers away at its far
        /// end. Two crossed ribbons, so it shows from any side.
        public static Mesh NeonLine(float length, float width, Color color)
        {
            var points = new List<Vector3>();
            var colors = new List<Color>();
            var triangles = new List<int>();
            var clear = new Color(color.r, color.g, color.b, 0);
            var offsets = new[] { -width, 0, width };
            var shades = new[] { clear, Hot(color), clear };
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0, 0, length), Vector3.right, offsets, shades, 0);
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0, 0, length), Vector3.up, offsets, shades, 0);
            return GlowMesh("NeonLine", points, colors, triangles);
        }

        /// The outline of a rounded rectangle, anticlockwise from the right
        /// edge, with the outward direction at each point.
        static void Rounded(float halfW, float halfH, float radius, int steps, List<Vector3> at, List<Vector3> outward)
        {
            float cx = halfW - radius, cy = halfH - radius;
            var centres = new[] { new Vector3(cx, cy), new Vector3(-cx, cy), new Vector3(-cx, -cy), new Vector3(cx, -cy) };
            for (int corner = 0; corner < 4; corner++)
            {
                for (int i = 0; i <= steps; i++)
                {
                    float a = (corner + i / (float)steps) * Mathf.PI / 2;
                    var n = new Vector3(Mathf.Cos(a), Mathf.Sin(a));
                    at.Add(centres[corner] + n * radius);
                    outward.Add(n);
                }
            }
        }

        /// Loops of points joined into bands. `rows[r][i]` is point i of loop r.
        static Mesh Bands(string name, List<Vector3>[] rows, Color[] shades)
        {
            var points = new List<Vector3>();
            var colors = new List<Color>();
            var triangles = new List<int>();
            int n = rows[0].Count;
            for (int r = 0; r < rows.Length; r++)
            {
                points.AddRange(rows[r]);
                for (int i = 0; i < n; i++) colors.Add(shades[r]);
            }
            for (int r = 0; r < rows.Length - 1; r++)
            {
                for (int i = 0; i < n; i++)
                {
                    int a = r * n + i, b = r * n + (i + 1) % n, c = a + n, d = b + n;
                    triangles.AddRange(new[] { a, b, d, a, d, c });
                }
            }
            return GlowMesh(name, points, colors, triangles);
        }

        /// The glow around a rounded card: brightest on its edge, fading `inner`
        /// metres inward and `halo` metres outward. White; tint it with the material.
        public static Mesh NeonRoundRect(float halfW, float halfH, float radius, float inner, float halo)
        {
            var edge = new List<Vector3>();
            var outward = new List<Vector3>();
            Rounded(halfW, halfH, radius, 8, edge, outward);
            var inside = new List<Vector3>();
            var outside = new List<Vector3>();
            for (int i = 0; i < edge.Count; i++)
            {
                inside.Add(edge[i] - outward[i] * inner);
                outside.Add(edge[i] + outward[i] * halo);
            }
            var clear = new Color(1, 1, 1, 0);
            return Bands("NeonRoundRect", new[] { inside, edge, outside }, new[] { clear, Color.white, clear });
        }

        /// A glowing circle outline of radius 1. White; scale and tint it.
        public static Mesh NeonRing(float core, float halo, int segments)
        {
            var rows = new[] { new List<Vector3>(), new List<Vector3>(), new List<Vector3>(), new List<Vector3>() };
            var radii = new[] { 1 - halo, 1 - core / 2, 1 + core / 2, 1 + halo };
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                var n = new Vector3(Mathf.Cos(a), Mathf.Sin(a));
                for (int r = 0; r < 4; r++) rows[r].Add(n * radii[r]);
            }
            var clear = new Color(1, 1, 1, 0);
            return Bands("NeonRing", rows, new[] { clear, Color.white, Color.white, clear });
        }

        /// The flash of a cut: a bright line along X, one unit long, tapering to
        /// nothing at both ends. White; scale and tint it.
        public static Mesh NeonSlash(float width)
        {
            var points = new List<Vector3>();
            var colors = new List<Color>();
            var triangles = new List<int>();
            var clear = new Color(1, 1, 1, 0);
            var offsets = new[] { -width, 0, width };
            var shades = new[] { clear, Color.white, clear };
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0.5f, 0, 0), Vector3.up, offsets, shades, 0);
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(-0.5f, 0, 0), Vector3.up, offsets, shades, 0);
            return GlowMesh("NeonSlash", points, colors, triangles);
        }

        /// A solid disc of radius 1. White; scale and tint it.
        public static Mesh HardDisc(int segments)
        {
            var points = new List<Vector3> { Vector3.zero };
            var colors = new List<Color> { Color.white };
            var triangles = new List<int>();
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                points.Add(new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0));
                colors.Add(Color.white);
                triangles.AddRange(new[] { 0, 1 + (i + 1) % segments, 1 + i });
            }
            return GlowMesh("HardDisc", points, colors, triangles);
        }

        /// A four-pointed star of light, one unit from tip to tip. White.
        public static Mesh Twinkle(float width)
        {
            var points = new List<Vector3>();
            var colors = new List<Color>();
            var triangles = new List<int>();
            var clear = new Color(1, 1, 1, 0);
            var offsets = new[] { -width, 0, width };
            var shades = new[] { clear, Color.white, clear };
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0.5f, 0, 0), Vector3.up, offsets, shades, 0);
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(-0.5f, 0, 0), Vector3.up, offsets, shades, 0);
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0, 0.5f, 0), Vector3.right, offsets, shades, 0);
            Stroke(points, colors, triangles, Vector3.zero, new Vector3(0, -0.5f, 0), Vector3.right, offsets, shades, 0);
            return GlowMesh("Twinkle", points, colors, triangles);
        }

        /// A disc that is brightest in the middle and fades to nothing at the rim.
        public static Mesh SoftDisc(float radius, int segments, Color color)
        {
            var points = new List<Vector3> { Vector3.zero };
            var colors = new List<Color> { color };
            var triangles = new List<int>();
            var clear = new Color(color.r, color.g, color.b, 0);
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                points.Add(new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, 0));
                colors.Add(clear);
                triangles.AddRange(new[] { 0, 1 + (i + 1) % segments, 1 + i });
            }
            return GlowMesh("SoftDisc", points, colors, triangles);
        }

        /// A flat rectangle facing -Z (toward a player who looks along +Z),
        /// showing the (u0,v0)-(u1,v1) part of its texture. `pivotLeft` puts
        /// the origin on the left edge, for bars that grow to the right.
        public static Mesh Quad(float width, float height, float u0 = 0, float v0 = 0, float u1 = 1, float v1 = 1,
            bool pivotLeft = false)
        {
            float x0 = pivotLeft ? 0 : -width / 2, x1 = x0 + width, y = height / 2;
            var mesh = new Mesh { name = "Quad" };
            mesh.vertices = new[]
            {
                new Vector3(x0, -y, 0), new Vector3(x1, -y, 0), new Vector3(x0, y, 0), new Vector3(x1, y, 0),
            };
            mesh.uv = new[] { new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u0, v1), new Vector2(u1, v1) };
            mesh.triangles = new[] { 0, 2, 1, 1, 2, 3 };
            mesh.RecalculateBounds();
            return mesh;
        }
    }

    /// Collects glowing lines into one mesh for the Neon shader. Each line is a
    /// ribbon: a near-white core with a soft coloured halo either side.
    public class GlowBuilder
    {
        readonly List<Vector3> points = new List<Vector3>();
        readonly List<Color> colors = new List<Color>();
        readonly List<Vector4> strokes = new List<Vector4>();
        readonly List<int> triangles = new List<int>();

        static Color Hot(Color color)
        {
            var hot = Color.Lerp(color, Color.white, 0.6f);
            hot.a = color.a;
            return hot;
        }

        void Ribbon(Vector3 a, Vector3 b, Vector3 across, float core, float halo, Color color,
            float taperA, float taperB, int pieces, bool screen)
        {
            var offsets = new[] { -halo, -core, core, halo };
            var clear = new Color(color.r, color.g, color.b, 0);
            var shades = new[] { clear, Hot(color), Hot(color), clear };
            if (pieces < 2 && (taperA < 1 || taperB < 1)) pieces = 2;
            var tangent = (b - a).normalized;
            int first = points.Count;
            for (int k = 0; k <= pieces; k++)
            {
                float t = k / (float)pieces;
                float strength = t < 0.5f ? Mathf.Lerp(taperA, 1, t * 2) : Mathf.Lerp(1, taperB, (t - 0.5f) * 2);
                var at = Vector3.Lerp(a, b, t);
                for (int i = 0; i < 4; i++)
                {
                    points.Add(screen ? at : at + across * offsets[i]);
                    strokes.Add(screen ? new Vector4(tangent.x, tangent.y, tangent.z, offsets[i]) : Vector4.zero);
                    var shade = shades[i];
                    shade.a *= strength;
                    colors.Add(shade);
                }
            }
            for (int k = 0; k < pieces; k++)
            {
                for (int i = 0; i < 3; i++)
                {
                    int n = first + k * 4 + i;
                    triangles.AddRange(new[] { n, n + 4, n + 5, n, n + 5, n + 1 });
                }
            }
        }

        /// A line from a to b, its width lying along `across`, in metres.
        /// `core` and `halo` are half-widths. `color.a` is its strength;
        /// `taperA` and `taperB` scale it at each end. Long lines need `pieces`,
        /// because fading with distance is worked out at each piece's corners.
        public void Line(Vector3 a, Vector3 b, Vector3 across, float core, float halo, Color color,
            float taperA = 1, float taperB = 1, int pieces = 1) =>
            Ribbon(a, b, across, core / 2, halo, color, taperA, taperB, pieces, false);

        /// A line that always faces the eye, with half-widths given as angles
        /// (radians), so it looks equally thin at any distance. Needs a Neon
        /// material with _Lines set.
        public void ScreenLine(Vector3 a, Vector3 b, float core, float halo, Color color,
            float taperA = 1, float taperB = 1, int pieces = 1) =>
            Ribbon(a, b, Vector3.zero, core, halo, color, taperA, taperB, pieces, true);

        public Mesh Build(string name)
        {
            var mesh = new Mesh { name = name };
            if (points.Count > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(points);
            mesh.SetColors(colors);
            mesh.SetUVs(1, strokes);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            // Screen lines are pushed sideways in the shader; leave room for that.
            var bounds = mesh.bounds;
            bounds.Expand(3);
            mesh.bounds = bounds;
            return mesh;
        }
    }
}
