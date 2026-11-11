using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    public enum Align { Left, Center, Right }
    public enum Baseline { Alphabetic, Middle }

    /// A tiny 2D canvas: rounded rectangles, circles, lines and text, drawn
    /// into a RenderTexture. Coordinates are pixels with y down, like an HTML
    /// canvas. It works by laying temporary meshes out in front of a hidden
    /// orthographic camera on its own layer and rendering once.
    ///
    /// The textures it produces are premultiplied: show them with blend
    /// One / OneMinusSrcAlpha (see Look.Label).
    public class Painter
    {
        public const int Layer = 31;
        const int CornerSteps = 10;

        readonly Transform root;
        readonly Camera cam;
        readonly Material shapeMaterial, textMaterial;
        readonly Font font;
        readonly List<Object> trash = new List<Object>();
        RenderTexture target;
        int order;

        public Painter()
        {
            var go = new GameObject("Painter") { hideFlags = HideFlags.HideAndDontSave };
            root = go.transform;
            root.position = new Vector3(0, -500, 0);
            var camGo = new GameObject("PainterCamera") { hideFlags = HideFlags.HideAndDontSave };
            camGo.transform.SetParent(root, false);
            cam = camGo.AddComponent<Camera>();
            cam.enabled = false;
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0, 0, 0, 0);
            cam.cullingMask = 1 << Layer;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 100;
            cam.allowHDR = false;
            cam.allowMSAA = true;
            cam.stereoTargetEye = StereoTargetEyeMask.None; // never drawn to a headset
            var shader = Look.Shader("Paint");
            shapeMaterial = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            textMaterial = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        public static RenderTexture NewTarget(int width, int height)
        {
            // URP Render Graph requires depth on camera output textures, including UI canvases.
            var rt = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 4,
                useMipMap = true,
                autoGenerateMips = true,
                filterMode = FilterMode.Trilinear,
                anisoLevel = 4,
                wrapMode = TextureWrapMode.Clamp,
                hideFlags = HideFlags.HideAndDontSave,
            };
            rt.Create();
            return rt;
        }

        public int Width => target.width;
        public int Height => target.height;

        public void Begin(RenderTexture rt)
        {
            target = rt;
            order = 0;
        }

        /// Render everything drawn since Begin and throw the scratch meshes away.
        public void End()
        {
            float w = target.width, h = target.height;
            cam.orthographicSize = h / 2;
            cam.aspect = w / h;
            cam.transform.localPosition = new Vector3(w / 2, -h / 2, -10);
            textMaterial.mainTexture = font.material.mainTexture;
            cam.targetTexture = target;
            cam.Render();
            cam.targetTexture = null;
            // Remove the scratch meshes right now. A deferred Destroy would leave
            // them in front of the camera for the next drawing in the same frame.
            foreach (var item in trash) if (item != null) Object.DestroyImmediate(item);
            trash.Clear();
        }

        // ------------------------------------------------------------ shapes

        GameObject Spawn(string name)
        {
            var go = new GameObject(name) { hideFlags = HideFlags.HideAndDontSave, layer = Layer };
            go.transform.SetParent(root, false);
            // Later items sit nearer the camera, so they paint over earlier ones.
            go.transform.localPosition = new Vector3(0, 0, -order * 0.01f);
            trash.Add(go);
            return go;
        }

        void AddMesh(List<Vector3> points, List<int> triangles, Color color)
        {
            var mesh = new Mesh { hideFlags = HideFlags.HideAndDontSave };
            mesh.SetVertices(points);
            var colors = new Color[points.Count];
            for (int i = 0; i < colors.Length; i++) colors[i] = color;
            mesh.colors = colors;
            mesh.SetTriangles(triangles, 0);
            trash.Add(mesh);
            var go = Spawn("Shape");
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = shapeMaterial;
            renderer.sortingOrder = order++;
        }

        static List<Vector3> Outline(float x, float y, float w, float h, float r)
        {
            r = Mathf.Max(0.01f, Mathf.Min(r, Mathf.Min(w, h) / 2));
            var points = new List<Vector3>();
            // Corner centres, clockwise on screen from the top right.
            var centres = new[]
            {
                new Vector2(x + w - r, y + r), new Vector2(x + w - r, y + h - r),
                new Vector2(x + r, y + h - r), new Vector2(x + r, y + r),
            };
            for (int c = 0; c < 4; c++)
            {
                float start = -Mathf.PI / 2 + c * Mathf.PI / 2;
                for (int s = 0; s <= CornerSteps; s++)
                {
                    float a = start + s * (Mathf.PI / 2) / CornerSteps;
                    points.Add(new Vector3(centres[c].x + Mathf.Cos(a) * r, -(centres[c].y + Mathf.Sin(a) * r), 0));
                }
            }
            return points;
        }

        public void FillRoundRect(float x, float y, float w, float h, float r, Color color)
        {
            var points = Outline(x, y, w, h, r);
            int n = points.Count;
            points.Add(new Vector3(x + w / 2, -(y + h / 2), 0));
            var triangles = new List<int>();
            for (int i = 0; i < n; i++) { triangles.Add(n); triangles.Add(i); triangles.Add((i + 1) % n); }
            AddMesh(points, triangles, color);
        }

        public void StrokeRoundRect(float x, float y, float w, float h, float r, Color color, float lineWidth)
        {
            float half = lineWidth / 2;
            var outer = Outline(x - half, y - half, w + lineWidth, h + lineWidth, r + half);
            var inner = Outline(x + half, y + half, w - lineWidth, h - lineWidth, Mathf.Max(0.01f, r - half));
            Strip(outer, inner, true, color);
        }

        public void FillCircle(float cx, float cy, float r, Color color) =>
            FillRoundRect(cx - r, cy - r, r * 2, r * 2, r, color);

        public void StrokeCircle(float cx, float cy, float r, Color color, float lineWidth) =>
            StrokeRoundRect(cx - r, cy - r, r * 2, r * 2, r, color, lineWidth);

        /// An arc from angle a0 to a1 (radians, clockwise on screen from +x).
        public void StrokeArc(float cx, float cy, float r, float a0, float a1, Color color, float lineWidth)
        {
            var outer = new List<Vector3>();
            var inner = new List<Vector3>();
            const int steps = 24;
            for (int i = 0; i <= steps; i++)
            {
                float a = Mathf.Lerp(a0, a1, i / (float)steps);
                var dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                outer.Add(new Vector3(cx + dir.x * (r + lineWidth / 2), -(cy + dir.y * (r + lineWidth / 2)), 0));
                inner.Add(new Vector3(cx + dir.x * (r - lineWidth / 2), -(cy + dir.y * (r - lineWidth / 2)), 0));
            }
            Strip(outer, inner, false, color);
        }

        public void Line(float x0, float y0, float x1, float y1, Color color, float lineWidth)
        {
            var along = new Vector2(x1 - x0, y1 - y0).normalized;
            var side = new Vector2(-along.y, along.x) * (lineWidth / 2);
            var points = new List<Vector3>
            {
                new Vector3(x0 + side.x, -(y0 + side.y), 0), new Vector3(x1 + side.x, -(y1 + side.y), 0),
                new Vector3(x1 - side.x, -(y1 - side.y), 0), new Vector3(x0 - side.x, -(y0 - side.y), 0),
            };
            AddMesh(points, new List<int> { 0, 1, 2, 0, 2, 3 }, color);
        }

        void Strip(List<Vector3> a, List<Vector3> b, bool closed, Color color)
        {
            int n = a.Count;
            var points = new List<Vector3>(a);
            points.AddRange(b);
            var triangles = new List<int>();
            int last = closed ? n : n - 1;
            for (int i = 0; i < last; i++)
            {
                int j = (i + 1) % n;
                triangles.Add(i); triangles.Add(j); triangles.Add(n + j);
                triangles.Add(i); triangles.Add(n + j); triangles.Add(n + i);
            }
            AddMesh(points, triangles, color);
        }

        /// Many rectangles in one colour, as one mesh.
        public void FillRects(List<Rect> rects, Color color)
        {
            if (rects.Count == 0) return;
            var points = new List<Vector3>(rects.Count * 4);
            var triangles = new List<int>(rects.Count * 6);
            foreach (var r in rects)
            {
                int k = points.Count;
                points.Add(new Vector3(r.xMin, -r.yMin, 0));
                points.Add(new Vector3(r.xMax, -r.yMin, 0));
                points.Add(new Vector3(r.xMax, -r.yMax, 0));
                points.Add(new Vector3(r.xMin, -r.yMax, 0));
                triangles.AddRange(new[] { k, k + 1, k + 2, k, k + 2, k + 3 });
            }
            AddMesh(points, triangles, color);
        }

        /// A rectangle whose corners are cut in two pixel-art steps of `step`.
        static List<Vector3> NotchedOutline(float x, float y, float w, float h, float step)
        {
            float s = Mathf.Max(0, Mathf.Min(step, Mathf.Min(w, h) / 4));
            float r = x + w, b = y + h;
            var corners = new[]
            {
                new Vector2(x + 2 * s, y), new Vector2(r - 2 * s, y), new Vector2(r - 2 * s, y + s), new Vector2(r - s, y + s),
                new Vector2(r - s, y + 2 * s), new Vector2(r, y + 2 * s), new Vector2(r, b - 2 * s), new Vector2(r - s, b - 2 * s),
                new Vector2(r - s, b - s), new Vector2(r - 2 * s, b - s), new Vector2(r - 2 * s, b), new Vector2(x + 2 * s, b),
                new Vector2(x + 2 * s, b - s), new Vector2(x + s, b - s), new Vector2(x + s, b - 2 * s), new Vector2(x, b - 2 * s),
                new Vector2(x, y + 2 * s), new Vector2(x + s, y + 2 * s), new Vector2(x + s, y + s), new Vector2(x + 2 * s, y + s),
            };
            var points = new List<Vector3>(corners.Length + 1);
            foreach (var c in corners) points.Add(new Vector3(c.x, -c.y, 0));
            return points;
        }

        public void FillNotched(float x, float y, float w, float h, float step, Color color)
        {
            var points = NotchedOutline(x, y, w, h, step);
            int n = points.Count;
            points.Add(new Vector3(x + w / 2, -(y + h / 2), 0));
            var triangles = new List<int>();
            for (int i = 0; i < n; i++) { triangles.Add(n); triangles.Add(i); triangles.Add((i + 1) % n); }
            AddMesh(points, triangles, color);
        }

        public void StrokeNotched(float x, float y, float w, float h, float step, Color color, float lineWidth)
        {
            float half = lineWidth / 2;
            Strip(NotchedOutline(x - half, y - half, w + lineWidth, h + lineWidth, step),
                NotchedOutline(x + half, y + half, w - lineWidth, h - lineWidth, step), true, color);
        }

        static List<Rect> Grow(List<Rect> cells, float by, float down)
        {
            var grown = new List<Rect>(cells.Count);
            foreach (var r in cells) grown.Add(new Rect(r.x - by, r.y - by + down, r.width + 2 * by, r.height + 2 * by));
            return grown;
        }

        /// Text in the pixel font, centred on `yMid`. `cell` is the size of one
        /// font pixel; it shrinks to fit `maxWidth` if that is set. An outline
        /// rings the letters and a shadow drops one font pixel below them.
        /// Returns the width drawn.
        public float PixelText(string text, float x, float yMid, float cell, Color color, Align align = Align.Left,
            Color? outline = null, Color? shadow = null, float maxWidth = 0)
        {
            text = text.ToUpperInvariant();
            int wide = PixelFont.WidthCells(text);
            if (wide <= 0) return 0;
            if (maxWidth > 0 && wide * cell > maxWidth) cell = Mathf.Max(1, Mathf.Floor(maxWidth / wide));
            float width = wide * cell;
            float left = Mathf.Round(align == Align.Center ? x - width / 2 : align == Align.Right ? x - width : x);
            float top = Mathf.Round(yMid - PixelFont.Rows * cell / 2);
            var cells = new List<Rect>();
            PixelFont.Cells(text, left, top, cell, cells);
            float edge = Mathf.Max(1, Mathf.Round(cell * 0.45f));
            if (shadow.HasValue) FillRects(Grow(cells, outline.HasValue ? edge : 0, edge * 1.4f), shadow.Value);
            if (outline.HasValue) FillRects(Grow(cells, edge, 0), outline.Value);
            FillRects(cells, color);
            return width;
        }

        // -------------------------------------------------------------- text

        public float Measure(string text, int size, bool bold)
        {
            var style = bold ? FontStyle.Bold : FontStyle.Normal;
            font.RequestCharactersInTexture(text, size, style);
            float width = 0;
            foreach (char c in text)
            {
                if (font.GetCharacterInfo(c, out var info, size, style)) width += info.advance;
            }
            return width;
        }

        /// Break text into at most maxLines lines; the last gets "…" if cut.
        public List<string> Wrap(string text, int size, bool bold, float maxWidth, int maxLines)
        {
            var lines = new List<string>();
            string line = "";
            foreach (var word in text.Split(' '))
            {
                string next = line.Length > 0 ? line + " " + word : word;
                if (Measure(next, size, bold) <= maxWidth || line.Length == 0) line = next;
                else { lines.Add(line); line = word; }
            }
            if (line.Length > 0) lines.Add(line);
            if (lines.Count > maxLines)
            {
                lines.RemoveRange(maxLines, lines.Count - maxLines);
                string last = lines[maxLines - 1];
                while (last.Length > 1 && Measure(last + "…", size, bold) > maxWidth) last = last.Substring(0, last.Length - 1);
                lines[maxLines - 1] = last + "…";
            }
            return lines;
        }

        public void Text(string text, float x, float y, int size, bool bold, Color color,
            Align align = Align.Left, Baseline baseline = Baseline.Alphabetic)
        {
            if (string.IsNullOrEmpty(text)) return;
            var style = bold ? FontStyle.Bold : FontStyle.Normal;
            font.RequestCharactersInTexture(text, size, style);
            var go = Spawn("Text");
            var mesh = go.AddComponent<TextMesh>();
            mesh.font = font;
            mesh.fontSize = size;
            mesh.fontStyle = style;
            mesh.characterSize = 10; // one font pixel = one canvas pixel
            mesh.color = color;
            mesh.text = text;
            bool centre = align == Align.Center, right = align == Align.Right;
            if (baseline == Baseline.Middle)
            {
                mesh.anchor = centre ? TextAnchor.MiddleCenter : right ? TextAnchor.MiddleRight : TextAnchor.MiddleLeft;
            }
            else
            {
                // TextMesh anchors to the line box; the baseline sits a
                // descender's height above its bottom edge.
                mesh.anchor = centre ? TextAnchor.LowerCenter : right ? TextAnchor.LowerRight : TextAnchor.LowerLeft;
                y += size * 0.22f;
            }
            go.transform.localPosition = new Vector3(x, -y, go.transform.localPosition.z);
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = textMaterial;
            renderer.sortingOrder = order++;
        }

        /// Text with a dark outline, for labels that float over anything.
        public void OutlinedText(string text, float x, float y, int size, Color color, Color outline, float width)
        {
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI / 4;
                Text(text, x + Mathf.Cos(a) * width, y + Mathf.Sin(a) * width, size, true, outline, Align.Center, Baseline.Middle);
            }
            Text(text, x, y, size, true, color, Align.Center, Baseline.Middle);
        }
    }
}
