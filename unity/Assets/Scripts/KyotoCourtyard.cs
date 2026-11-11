using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace InboxZero
{
    /// What a Kyoto scene prefab answers to. KyotoWorld drives whichever one
    /// the level names: the Komorebi garden or the v2 courtyard.
    public interface IKyotoScene
    {
        float DesktopFieldOfView { get; }
        /// What the dev view calls the two ends of the scene's fade.
        string EarlyName { get; }
        string LateName { get; }
        void Activate();
        /// `fade` runs 0..1 over the round: the scene's own passage of time.
        void Step(float dt, float fade);
        void Stir(float strength, int petals = 0);
        void ConfigureCamera(Camera camera);
    }

    /// Kyoto v2: the old courtyard, replanted with the Komorebi pack and lit
    /// live under the painted sky and mountains. This owns everything that
    /// changes as dusk turns to night: the last light sinking and the moon
    /// taking over, the painting fading to its night, the mist, the lamps
    /// coming up, the grade and the bloom. The prefab is put together by
    /// KyotoCourtyardBuilder (Inbox Zero > Kyoto v2 > Rebuild Courtyard).
    [ExecuteAlways]
    public sealed class KyotoCourtyard : MonoBehaviour, IKyotoScene
    {
        /// A lamp that burns low at dusk and comes up with the dark.
        [System.Serializable]
        public class Lamp
        {
            public Light light;
            public float dusk = 1, night = 1;
            [Range(0, 1)] public float flicker = 0.1f;
        }

        /// Something that glows: a paper window, a lantern's flame, a halo in the mist.
        [System.Serializable]
        public class Glow
        {
            public Renderer renderer;
            public int slot = -1;                 // which material; -1 is all of them
            public string property = "_Color";
            [ColorUsage(true, true)] public Color dusk = Color.white, night = Color.white;
            [Range(0, 1)] public float flicker;
            /// A shaft of light: `dusk` while the sun is up, `night` under the moon, nothing in between.
            public bool sunlit;
        }

        public UniversalRenderPipelineAsset pipeline;
        public Material skySource;
        public Light sun;
        public Volume nightGrade;
        public Lamp[] lamps;
        public Glow[] glows;
        public ParticleSystem[] petals;
        public ParticleSystem fireflies;
        public ReflectionProbe mirror;
        [Range(0, 1)] public float night;
        public float desktopFieldOfView = 56;
        /// Which of the pipeline's renderers draws this scene on a monitor: the one with contact shadows.
        public int rendererIndex;

        public float DesktopFieldOfView => desktopFieldOfView;
        public string EarlyName => "dusk";
        public string LateName => "night";

        Material sky;
        MaterialPropertyBlock block;
        RenderTexture cube;
        Camera cubeCamera;
        int face = 6;
        float mirrored = -1, mirroring;
        bool mirrorFailed;
        float clock, gust, cloudShift;
        bool active;

        RenderPipelineAsset previousPipeline, previousQuality;
        Material previousSky;
        Light previousSun;
        AmbientMode previousAmbient;
        Color previousSkyColor, previousEquator, previousGround, previousFog;
        bool previousFogEnabled;
        FogMode previousFogMode;
        float previousFogDensity;
        DefaultReflectionMode previousReflectionMode;
        Texture previousReflection;

        static Color C(int hex) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f);
        /// Three stops: dusk, blue hour, night.
        static Color Mix(Color a, Color b, Color c, float t) => t < 0.5f ? Color.Lerp(a, b, t * 2) : Color.Lerp(b, c, t * 2 - 1);
        static float Mix(float a, float b, float c, float t) => t < 0.5f ? Mathf.Lerp(a, b, t * 2) : Mathf.Lerp(b, c, t * 2 - 1);

        void OnEnable() { Activate(); }
        void Update() { if (!Application.isPlaying) Apply(night); }

        public void Activate()
        {
            if (active || pipeline == null) return;
            previousPipeline = GraphicsSettings.defaultRenderPipeline;
            previousQuality = QualitySettings.renderPipeline;
            previousSky = RenderSettings.skybox; previousSun = RenderSettings.sun;
            previousAmbient = RenderSettings.ambientMode;
            previousSkyColor = RenderSettings.ambientSkyColor;
            previousEquator = RenderSettings.ambientEquatorColor;
            previousGround = RenderSettings.ambientGroundColor;
            previousFog = RenderSettings.fogColor; previousFogEnabled = RenderSettings.fog;
            previousFogMode = RenderSettings.fogMode; previousFogDensity = RenderSettings.fogDensity;
            previousReflectionMode = RenderSettings.defaultReflectionMode;
            previousReflection = RenderSettings.customReflectionTexture;
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            if (skySource != null) sky = new Material(skySource) { hideFlags = HideFlags.HideAndDontSave };
            block = new MaterialPropertyBlock();
            active = true;
            mirrored = -1; face = 6;
            Apply(night);
        }

        public void Step(float dt, float fade)
        {
            clock += dt;
            cloudShift += dt * 0.0016f;
            gust = Mathf.MoveTowards(gust, 0, dt * 0.7f);
            Apply(fade);
            Mirror();
        }

        /// A cut stirs the tree: a gust through the leaves and a few petals shaken loose.
        public void Stir(float strength, int count = 0)
        {
            gust = Mathf.Max(gust, Mathf.Clamp01(strength) * 0.5f);
            if (count <= 0 || petals == null) return;
            foreach (var system in petals)
                if (system != null) system.Emit(Mathf.Clamp(count, 1, 12));
        }

        public void Apply(float value)
        {
            if (!active) { Activate(); if (!active) return; }
            night = Mathf.Clamp01(value);
            float t = Mathf.SmoothStep(0, 1, night);
            float dark = Mathf.InverseLerp(0.45f, 1, t);          // how far the night proper has come on

            // ---- the last light, then the moon: one lamp, handed over while it is at its dimmest.
            // Both come low over the back wall, past the cherry tree: the blossom is lit from
            // behind, the machiya and the path catch the light, and under the tree the shade is deep.
            float lastLight = t < 0.5f ? 1 - t * 2 * (t * 2) : 0, moonLight = t < 0.5f ? 0 : Mathf.Sqrt(t * 2 - 1);
            if (sun != null)
            {
                if (t < 0.5f)
                {
                    float sink = t * 2;
                    sun.color = Color.Lerp(C(0xffb488), C(0xff7a5c), sink);
                    sun.intensity = 2.3f * lastLight;
                    sun.transform.localRotation = Quaternion.Euler(Mathf.Lerp(SunLight.x, 7, sink), Mathf.Lerp(SunLight.y, SunLight.y + 5, sink), 0);
                }
                else
                {
                    sun.color = C(0x8fa2ff);
                    sun.intensity = 1.05f * moonLight;
                    sun.transform.localRotation = MoonLight;
                }
                RenderSettings.sun = sun;
            }

            // ---- the painted sky and mountains, dusk fading to night
            if (sky != null)
            {
                sky.SetFloat("_Fade", t);
                sky.SetFloat("_Gain", Mix(1.15f, 1.1f, 1.4f, t));
                sky.SetFloat("_Saturation", Mix(1.4f, 1.35f, 1.25f, t));
                sky.SetFloat("_Glow", Mix(2.6f, 1.8f, 1.3f, t));
                sky.SetColor("_Top", Mix(new Color(0.42f, 0.42f, 0.8f), new Color(0.6f, 0.6f, 0.9f), Color.white, t));
                sky.SetFloat("_Stars", dark);
                RenderSettings.skybox = sky;
            }

            // ---- the air. Little light comes from the sky, and it is cool, so whatever the
            // sun and the lamps do not reach falls away into blue; the mist takes the warm side.
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Mix(C(0x4a5cae), C(0x3c44a0), C(0x34369a), t);
            RenderSettings.ambientEquatorColor = Mix(C(0x6e4c88), C(0x523e86), C(0x46307e), t);
            RenderSettings.ambientGroundColor = Mix(C(0x221c3a), C(0x1c1a38), C(0x161434), t);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = Mix(C(0xc47a98), C(0x6c5aac), C(0x35287a), t);
            RenderSettings.fogDensity = Mix(0.024f, 0.026f, 0.027f, t);

            // ---- lamps and everything that glows
            if (lamps != null)
                for (int i = 0; i < lamps.Length; i++)
                {
                    var lamp = lamps[i];
                    if (lamp == null || lamp.light == null) continue;
                    lamp.light.intensity = Mathf.Lerp(lamp.dusk, lamp.night, t) * Flicker(i, lamp.flicker);
                }
            if (glows != null && block != null)
                for (int i = 0; i < glows.Length; i++)
                {
                    var glow = glows[i];
                    if (glow == null || glow.renderer == null) continue;
                    // A shaft of light comes and goes slowly, as the leaves it passes through move.
                    var colour = glow.sunlit
                        ? (glow.dusk * lastLight + glow.night * moonLight) * (0.7f + 0.6f * Mathf.PerlinNoise(clock * 0.28f, i * 9.1f))
                        : Color.Lerp(glow.dusk, glow.night, t) * Flicker(i + 31, glow.flicker);
                    if (glow.slot < 0)
                    {
                        glow.renderer.GetPropertyBlock(block);
                        block.SetColor(glow.property, colour);
                        glow.renderer.SetPropertyBlock(block);
                    }
                    else
                    {
                        glow.renderer.GetPropertyBlock(block, glow.slot);
                        block.SetColor(glow.property, colour);
                        glow.renderer.SetPropertyBlock(block, glow.slot);
                    }
                }
            if (fireflies != null)
            {
                var emission = fireflies.emission;
                emission.rateOverTime = Mathf.Lerp(1.2f, 9, t);
            }
            if (nightGrade != null) nightGrade.weight = t;

            Shader.SetGlobalFloat("_KyotoNight", t);
            Shader.SetGlobalFloat("RaygeasTreeWindForce", 0.26f + gust);
            Shader.SetGlobalFloat("RaygeasTreeWindSpeed", 3.2f);
            Shader.SetGlobalFloat("RaygeasTreeWindWavesScale", 0.6f);
            Shader.SetGlobalFloat("RaygeasTreeWindFlowDensity", 0.4f);
            Shader.SetGlobalFloat("RaygeasGrassWindForce", 0.22f + gust * 0.6f);
            Shader.SetGlobalFloat("RaygeasGrassWindSpeed", 1.2f);
            Shader.SetGlobalVector("RaygeasWindDirection", new Vector3(0.8f, 0, -0.3f));
        }

        /// Pitch and yaw of the last sunlight (the builder lays its shafts of light along this), and the moon's.
        public static readonly Vector2 SunLight = new Vector2(27, 155);
        static readonly Quaternion MoonLight = Quaternion.Euler(34, 152, 0);

        float Flicker(int seed, float amount)
        {
            if (amount <= 0) return 1;
            float a = Mathf.PerlinNoise(clock * 5.3f, seed * 7.31f) - 0.5f;
            float b = Mathf.PerlinNoise(clock * 13.7f, seed * 3.17f + 40) - 0.5f;
            return 1 + amount * (a * 1.5f + b * 0.7f);
        }

        // ------------------------------------------------------ reflections

        /// The pond, the wet stones and the polished deck reflect the courtyard
        /// from one small picture of it, taken from the middle of the garden and
        /// retaken a face at a time whenever the light has moved on.
        void Mirror()
        {
            if (mirror == null || mirrorFailed) return;
            try
            {
                if (cube == null)
                {
                    // Eight bits a channel on purpose: one runaway pixel (a stray highlight, a shader
                    // dividing by nothing) in a floating-point picture floods every blurred copy of it.
                    cube = new RenderTexture(128, 128, 16, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                    {
                        dimension = TextureDimension.Cube, useMipMap = true, autoGenerateMips = true,
                        hideFlags = HideFlags.HideAndDontSave, name = "Courtyard reflection",
                    };
                    var go = new GameObject("Reflection camera") { hideFlags = HideFlags.HideAndDontSave };
                    go.transform.SetParent(transform, false);
                    cubeCamera = go.AddComponent<Camera>();
                    cubeCamera.enabled = false;
                    // The world, not the game in front of it; and not the pond (layer 4), whose shader
                    // needs the depth picture this camera does not make and writes runaway values without it.
                    cubeCamera.cullingMask = 1 << 0 | 1 << 1;
                    cubeCamera.nearClipPlane = 0.05f;
                    cubeCamera.farClipPlane = 250;
                    cubeCamera.allowHDR = false;
                    cubeCamera.clearFlags = CameraClearFlags.Skybox;
                    var data = cubeCamera.GetUniversalAdditionalCameraData();
                    data.renderPostProcessing = false;
                    data.renderShadows = false;
                }
                bool first = mirrored < 0;
                if (face >= 6)
                {
                    if (!first && Mathf.Abs(night - mirrored) < 0.03f) return;
                    face = 0;
                    mirroring = night;
                }
                cubeCamera.transform.position = mirror.transform.position;
                int faces = first ? 63 : 1 << face;
                if (!cubeCamera.RenderToCubemap(cube, faces)) throw new System.InvalidOperationException("RenderToCubemap refused");
                face = first ? 6 : face + 1;
                if (face >= 6)
                {
                    mirrored = mirroring;
                    mirror.mode = ReflectionProbeMode.Custom;
                    mirror.customBakedTexture = cube;
                    mirror.enabled = true;
                    RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
                    RenderSettings.customReflectionTexture = cube;
                }
            }
            catch (System.Exception e)
            {
                mirrorFailed = true;
                Debug.LogWarning("[Kyoto v2] No live reflections: " + e.Message);
            }
        }

        public void ConfigureCamera(Camera camera)
        {
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.allowHDR = true;
            camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250);
            var data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.requiresDepthTexture = true;       // the pond's shader reads both
            data.requiresColorTexture = true;
            data.antialiasing = AntialiasingMode.None;
            // Contact shadows under leaves, stones and eaves on a monitor; a headset is spared their cost.
            data.SetRenderer(UnityEngine.XR.XRSettings.isDeviceActive ? 0 : rendererIndex);
        }

        void OnDisable()
        {
            if (!active) return;
            GraphicsSettings.defaultRenderPipeline = previousPipeline;
            QualitySettings.renderPipeline = previousQuality;
            RenderSettings.skybox = previousSky; RenderSettings.sun = previousSun;
            RenderSettings.ambientMode = previousAmbient;
            RenderSettings.ambientSkyColor = previousSkyColor;
            RenderSettings.ambientEquatorColor = previousEquator;
            RenderSettings.ambientGroundColor = previousGround;
            RenderSettings.fog = previousFogEnabled; RenderSettings.fogMode = previousFogMode;
            RenderSettings.fogDensity = previousFogDensity; RenderSettings.fogColor = previousFog;
            RenderSettings.defaultReflectionMode = previousReflectionMode;
            RenderSettings.customReflectionTexture = previousReflection;
            active = false;
            if (mirror != null) { mirror.enabled = false; mirror.customBakedTexture = null; }
            Look.Kill(sky);
            if (cubeCamera != null) Look.Kill(cubeCamera.gameObject);
            if (cube != null) { cube.Release(); Look.Kill(cube); }
            sky = null; cube = null; cubeCamera = null;
        }
    }
}
