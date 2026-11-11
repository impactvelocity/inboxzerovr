using UnityEngine;
using UnityEngine.XR;

namespace InboxZero
{
    /// The level's screen treatment, on the camera.
    ///
    /// The world (stars, sparks, the halves of a cut email) is rebuilt out of
    /// big pixels with bloom, a dithered palette and scanlines. The UI and the
    /// saber stay crisp: they live on their own layers, are drawn separately at
    /// full resolution, and only pick up a trace of the pixel grid. A hit
    /// punches, shakes and splits the colours of the whole picture.
    ///
    /// On a monitor only. In a headset pixels locked to the face would be
    /// unpleasant, so it steps aside and the camera draws every layer itself.
    [ExecuteAlways, RequireComponent(typeof(Camera))]
    public class RetroFx : MonoBehaviour
    {
        /// Cards, text and buttons.
        public const int UiLayer = 30;
        /// The weapon and its trail: crisp like the UI, and the source of its own glow.
        public const int SaberLayer = 29;
        /// Painter's private layer, never shown.
        public const int PainterLayer = 31;

        [Tooltip("Rows of pixels down the screen. Lower is chunkier.")]
        [Range(120, 720)] public int pixelRows = 320;
        [Range(0, 2)] public float bloom = 0.7f;
        [Range(0, 1)] public float bloomThreshold = 0.5f;
        [Tooltip("How much the saber lights up the picture around it.")]
        [Range(0, 3)] public float saberGlow = 1.3f;
        [Tooltip("Colour steps per channel. Lower is more banded and dithered.")]
        [Range(4, 64)] public float colourLevels = 20;
        [Range(0, 0.6f)] public float scanlines = 0.12f;
        [Tooltip("How much of the pixel grid shows over the UI.")]
        [Range(0, 0.3f)] public float uiGrid = 0.05f;
        [Range(0, 1)] public float vignette = 0.45f;
        [Tooltip("Resting colour split, in pixels at the edge of the screen.")]
        [Range(0, 3)] public float colourSplit = 0.5f;

        Material material;
        Camera cam, layers;
        float kick, shake, flash, shakeTime;
        Vector2 shakeWay = Vector2.right;
        Color flashColor = Color.white;

        const int Everything = ~(1 << PainterLayer);
        const int Crisp = (1 << UiLayer) | (1 << SaberLayer);

        /// A hit: the picture punches in and shakes, mostly along `direction`
        /// (screen space; zero for any way). 1 is a solid hit.
        public void Punch(float strength, Vector2 direction = default)
        {
            kick = Mathf.Max(kick, strength);
            shake = Mathf.Max(shake, strength);
            shakeTime = 0;
            shakeWay = direction.sqrMagnitude > 1e-6f ? direction.normalized : Random.insideUnitCircle.normalized;
        }

        /// Fill the screen with a colour for an instant.
        public void Flash(Color color, float amount)
        {
            flashColor = color;
            flash = Mathf.Max(flash, amount);
        }

        /// Let the punch, shake and flash die away. The game calls this each frame.
        public void Tick(float dt)
        {
            kick = Mathf.Max(0, kick - dt * 5);
            shake = Mathf.Max(0, shake - dt * 4);
            flash = Mathf.Max(0, flash - dt * 6);
            shakeTime += dt;
        }

        bool Ready()
        {
            if (material == null)
            {
                var shader = Look.Shader("Retro");
                if (shader != null) material = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            }
            if (cam == null) cam = GetComponent<Camera>();
            return material != null && !XRSettings.isDeviceActive;
        }

        void OnPreCull()
        {
            // With the effect on, the UI and saber are drawn separately, below.
            bool on = Ready();
            cam.cullingMask = on ? Everything & ~Crisp : Everything;
        }

        void OnDisable()
        {
            if (cam != null) cam.cullingMask = Everything;
        }

        void OnDestroy()
        {
            if (layers != null) Look.Kill(layers.gameObject);
            if (material != null) Look.Kill(material);
        }

        /// Draw only `mask` from this camera's point of view into `target`.
        void RenderLayers(RenderTexture target, int mask)
        {
            if (layers == null)
            {
                var go = new GameObject("RetroFxLayers") { hideFlags = HideFlags.HideAndDontSave };
                layers = go.AddComponent<Camera>();
                layers.enabled = false;
            }
            layers.CopyFrom(cam);
            layers.cullingMask = mask;
            layers.clearFlags = CameraClearFlags.SolidColor;
            layers.backgroundColor = Color.clear;
            layers.targetTexture = target;
            layers.Render();
            layers.targetTexture = null;
        }

        void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (!Ready())
            {
                Graphics.Blit(source, destination);
                return;
            }

            int rows = Mathf.Clamp(pixelRows, 60, source.height);
            int columns = Mathf.Max(1, Mathf.RoundToInt(rows * source.width / (float)source.height));
            material.SetVector("_Res", new Vector4(columns, rows, 0, 0));
            var pixels = RenderTexture.GetTemporary(columns, rows, 0, source.format);
            pixels.filterMode = FilterMode.Point;
            Graphics.Blit(source, pixels, material, 3);

            // The UI and saber at full size, and the saber alone, small, for its glow.
            int msaa = QualitySettings.antiAliasing > 1 ? QualitySettings.antiAliasing : 1;
            var front = RenderTexture.GetTemporary(source.width, source.height, 24, RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.Default, msaa);
            RenderLayers(front, Crisp);
            var saber = RenderTexture.GetTemporary(Mathf.Max(8, source.width / 4), Mathf.Max(8, source.height / 4), 16,
                RenderTextureFormat.ARGB32);
            RenderLayers(saber, 1 << SaberLayer);

            material.SetFloat("_Threshold", bloomThreshold);
            var tight = Blurred(pixels, columns / 2, rows / 2, true);
            var wide = Blurred(tight, columns / 5, rows / 5, false);
            var glow = Blurred(saber, saber.width, saber.height, false);
            var glowWide = Blurred(glow, saber.width / 3, saber.height / 3, false);

            material.SetTexture("_Bloom", tight);
            material.SetTexture("_BloomWide", wide);
            material.SetTexture("_Glow", glow);
            material.SetTexture("_GlowWide", glowWide);
            material.SetTexture("_Front", front);
            material.SetFloat("_BloomAmount", bloom);
            material.SetFloat("_GlowAmount", saberGlow);
            material.SetFloat("_Levels", colourLevels);
            material.SetFloat("_Scan", scanlines);
            material.SetFloat("_UiGrid", uiGrid);
            material.SetFloat("_Vignette", vignette);
            material.SetFloat("_Split", colourSplit);
            material.SetFloat("_Kick", kick * kick);
            // The shake swings back and forth along its line and settles.
            float swing = Mathf.Sin(shakeTime * 55) * shake * shake * 5;
            var jitter = new Vector2(Mathf.Sin(shakeTime * 91), Mathf.Cos(shakeTime * 77)) * shake * shake * 1.5f;
            material.SetVector("_Shake", shakeWay * swing + jitter);
            material.SetColor("_Flash", new Color(flashColor.r, flashColor.g, flashColor.b, flash));
            Graphics.Blit(pixels, destination, material, 2);

            RenderTexture.ReleaseTemporary(pixels);
            RenderTexture.ReleaseTemporary(front);
            RenderTexture.ReleaseTemporary(saber);
            RenderTexture.ReleaseTemporary(tight);
            RenderTexture.ReleaseTemporary(wide);
            RenderTexture.ReleaseTemporary(glow);
            RenderTexture.ReleaseTemporary(glowWide);
        }

        /// A smaller, blurred copy. `bright` keeps only the bright parts first.
        RenderTexture Blurred(RenderTexture from, int width, int height, bool bright)
        {
            width = Mathf.Max(8, width);
            height = Mathf.Max(8, height);
            var a = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32);
            var b = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32);
            a.filterMode = b.filterMode = FilterMode.Bilinear;
            if (bright) Graphics.Blit(from, a, material, 0);
            else Graphics.Blit(from, a);
            for (int i = 0; i < 2; i++)
            {
                material.SetVector("_Dir", new Vector2(1, 0));
                Graphics.Blit(a, b, material, 1);
                material.SetVector("_Dir", new Vector2(0, 1));
                Graphics.Blit(b, a, material, 1);
            }
            RenderTexture.ReleaseTemporary(b);
            return a;
        }
    }
}
