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
    /// live under the Meadow pack's sunset sky. This owns everything that
    /// changes as the sun goes down: the sun sinking behind the gate and the
    /// moon taking over, the sky turning to night, the mist, the lamps coming
    /// up, the wind, the grade and the bloom. The prefab is put together by
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
        /// Birds and butterflies: gone once the light has.
        public GameObject[] dayOnly;
        public ReflectionProbe mirror;
        /// A wide soft sheet of light hung in front of the sun: the glare that washes over
        /// whatever stands against it.
        public Renderer sunVeil;
        [ColorUsage(true, true)] public Color sunVeilColour = Color.white;
        [Range(0, 1)] public float night;
        /// The part of the day a round runs through: from `startAt` when it begins to `endAt`.
        [Range(0, 1)] public float startAt, endAt = 1;
        public float desktopFieldOfView = 56;
        /// Which of the pipeline's renderers draws this scene on a monitor: the one with contact shadows.
        public int rendererIndex;

        public float DesktopFieldOfView => desktopFieldOfView;
        public string EarlyName => "sundown";
        public string LateName => "blue hour";

        Material sky;
        MaterialPropertyBlock block;
        RenderTexture cube;
        Camera cubeCamera;
        int face = 6;
        float mirrored = -1, mirroring;
        bool mirrorFailed;
        float clock, gust, cloudShift;
        bool active;
        /// The garden's sound (wind, leaves, water, birds, crickets), made the first time the game steps the scene.
        KyotoAmbience ambience;
        float windSwell, windForce = 0.85f;
        /// No ambience, for a game started muted.
        [System.NonSerialized] public bool quiet;

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

        void OnEnable() { Activate(); ambience?.Reset(); }
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

        public void Step(float dt, float fade) => StepAt(dt, Mathf.Lerp(startAt, endAt, fade));

        /// As Step, but at a point on the whole day (0 the sun up, 1 full night).
        public void StepAt(float dt, float fade)
        {
            clock += dt;
            cloudShift += dt * 0.0016f;
            gust = Mathf.MoveTowards(gust, 0, dt * 0.7f);
            Apply(fade);
            Mirror();
            if (!Application.isPlaying) return;
            if (ambience == null) ambience = new KyotoAmbience(transform);
            ambience.Step(dt, Mathf.SmoothStep(0, 1, night), windSwell, windForce, clock, quiet);
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

            // ---- the sun, then the moon: one lamp, handed over while it is at its dimmest.
            // The sun stands low over the gate, in view, and goes down behind it as the round
            // goes on; everything is lit from behind and throws its shadow toward the seat.
            float sink = Mathf.Clamp01(t * 2);
            float sunHeight = Mathf.Lerp(SunHeight, -9, sink);                      // degrees above the horizon, as seen
            float sunUp = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(-5, 7, sunHeight));
            float lastLight = (1 - sink * sink) * Mathf.Lerp(0.35f, 1, sunUp), moonLight = t < 0.5f ? 0 : Mathf.Sqrt(t * 2 - 1);
            var sunDirection = Quaternion.Euler(-sunHeight, SunAzimuth, 0) * Vector3.forward;
            if (sun != null)
            {
                if (t < 0.5f)
                {
                    sun.color = Color.Lerp(C(0xffc890), C(0xff7a58), sink);
                    sun.intensity = 2.5f * lastLight;
                    // the light comes from a little higher than the sun stands, so it clears the wall for longer
                    sun.transform.localRotation = Quaternion.Euler(Mathf.Lerp(SunLight.x, 5, sink), SunLight.y, 0);
                }
                else
                {
                    sun.color = C(0x8fa2ff);
                    sun.intensity = 1.05f * moonLight;
                    sun.transform.localRotation = MoonLight;
                }
                RenderSettings.sun = sun;
            }

            // ---- the sky: the Meadow pack's sunset panorama, turned so its sun is ours
            if (sky != null)
            {
                var turn = Quaternion.LookRotation(sunDirection) * Quaternion.Inverse(Quaternion.LookRotation(PanoramaSun));
                sky.SetMatrix("_Turn", Matrix4x4.Rotate(Quaternion.Inverse(turn)));
                sky.SetVector("_SunDir", sunDirection);
                sky.SetFloat("_Exposure", Mathf.Lerp(0.92f, 0.75f, sink));
                sky.SetColor("_Tint", Color.Lerp(new Color(1, 0.86f, 0.98f), new Color(1, 0.66f, 0.78f), sink));       // toward pink as it sets
                sky.SetColor("_SunGlow", Color.Lerp(new Color(1.2f, 0.7f, 0.56f), new Color(1.4f, 0.4f, 0.4f), sink) * sunUp);
                sky.SetFloat("_Fade", Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.3f, 0.85f, t)));
                sky.SetColor("_NightTint", new Color(0.26f, 0.26f, 0.95f) * 0.5f);
                sky.SetColor("_Afterglow", new Color(1.0f, 0.16f, 0.36f));
                sky.SetFloat("_Stars", dark);
                RenderSettings.skybox = sky;
            }
            if (sunVeil != null && block != null)
            {
                var eye = transform.TransformPoint(0, 1.55f, 0);
                var veilAt = eye + transform.TransformDirection(sunDirection) * 4.6f;
                sunVeil.transform.SetPositionAndRotation(veilAt, Quaternion.LookRotation(veilAt - eye));
                sunVeil.GetPropertyBlock(block);
                block.SetColor("_Color", sunVeilColour * ((1 - sink) * sunUp));
                sunVeil.SetPropertyBlock(block);
            }

            // ---- the air. The shade is lavender, not black: the sky still fills it. The mist
            // is thin and takes the colour of the light, so the far hills melt into the sky.
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Mix(C(0x7d78d2), C(0x4a4cae), C(0x34369a), t);
            RenderSettings.ambientEquatorColor = Mix(C(0xa870a6), C(0x62458e), C(0x46307e), t);
            RenderSettings.ambientGroundColor = Mix(C(0x3e3060), C(0x24204a), C(0x161434), t);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = Mix(C(0xf2a8b4), C(0x8468b8), C(0x35287a), t);
            RenderSettings.fogDensity = Mix(0.0085f, 0.011f, 0.013f, t);

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
                emission.rateOverTime = Mathf.Lerp(5, 9, t);       // motes in the sunlight, then fireflies
            }
            if (nightGrade != null) nightGrade.weight = t;
            if (dayOnly != null)
                foreach (var creature in dayOnly)
                    if (creature != null && creature.activeSelf != t < 0.42f) creature.SetActive(t < 0.42f);

            Shader.SetGlobalFloat("_KyotoNight", t);
            // ---- the wind. In the pack's shaders a pattern of gusts slides along one fixed line
            // and bends whatever it passes over. Its speed, scale and line must not change (the
            // pattern would jump), so the life comes from its strength: a slow swell and lull with
            // a quicker breath on top, never the same twice, and broad slow gusts that reach one
            // part of the tree before another.
            float swell = Mathf.PerlinNoise(clock * 0.09f, 3.7f), breath = Mathf.PerlinNoise(clock * 0.31f, 8.2f);
            float wind = 0.85f + 1.5f * swell * swell + 0.45f * breath + gust * 1.6f;
            windSwell = swell; windForce = wind;      // the ambience is as loud as the trees are moved
            Shader.SetGlobalFloat("RaygeasTreeWindForce", wind);
            Shader.SetGlobalFloat("RaygeasTreeWindSpeed", 1.3f);
            Shader.SetGlobalFloat("RaygeasTreeWindWavesScale", 1.7f);
            Shader.SetGlobalFloat("RaygeasTreeWindFlowDensity", 0.22f + 0.3f * Mathf.PerlinNoise(clock * 0.06f, 1.3f));
            Shader.SetGlobalFloat("RaygeasGrassWindForce", 0.2f + 0.3f * swell + 0.1f * breath + gust * 0.6f);
            Shader.SetGlobalFloat("RaygeasGrassWindSpeed", 0.8f);
            Shader.SetGlobalVector("RaygeasWindDirection", new Vector3(0.8f, 0, -0.3f));
            // The Meadow pack's flowers, birds and butterflies listen to their own wind.
            Shader.SetGlobalVector("ASPW_WindDirection", new Vector3(0.8f, 0, -0.3f).normalized);
            Shader.SetGlobalFloat("ASPW_WindToggle", 1);
            Shader.SetGlobalFloat("ASPW_WindTreeAmplitude", 0.6f + 0.5f * swell);
            Shader.SetGlobalFloat("ASPW_WindTreeSpeed", 0.7f);
            Shader.SetGlobalFloat("ASPW_WindTreeFlexibility", 1);
            Shader.SetGlobalFloat("ASPW_WindTreeLeafAmplitude", 0.8f);
            Shader.SetGlobalFloat("ASPW_WindTreeLeafSpeed", 0.7f);
            Shader.SetGlobalFloat("ASPW_WindTreeLeafTurbulence", 0.8f);
            Shader.SetGlobalFloat("ASPW_WindTreeLeafOffset", 1);
            Shader.SetGlobalFloat("ASPW_WindGrassAmplitude", 0.6f + 0.6f * swell);
            Shader.SetGlobalFloat("ASPW_WindGrassSpeed", 0.7f);
            Shader.SetGlobalFloat("ASPW_WindGrassTurbulence", 0.6f);
            Shader.SetGlobalFloat("ASPW_WindGrassFlexibility", 1);
            Shader.SetGlobalFloat("ASPW_WindGrassWavesAmplitude", 0.5f);
            Shader.SetGlobalFloat("ASPW_WindGrassWavesSpeed", 0.5f);
            Shader.SetGlobalFloat("ASPW_WindGrassWavesScale", 1);
        }

        /// Where the sun stands at the start: a little right of straight ahead, low over the gate.
        public const float SunAzimuth = 8, SunHeight = 15;
        /// Pitch and yaw of its light (the builder lays its shafts of light along this), and the moon's.
        public static readonly Vector2 SunLight = new Vector2(22, 180 + SunAzimuth);
        static readonly Quaternion MoonLight = Quaternion.Euler(34, 152, 0);
        /// Where the sun is in the Meadow panorama (azimuth -68.55, 36.56 degrees up), found by its brightest texel.
        static readonly Vector3 PanoramaSun = Quaternion.Euler(-36.56f, -68.55f, 0) * Vector3.forward;

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
            camera.farClipPlane = Mathf.Max(camera.farClipPlane, 400);      // the hills stand a hundred metres off
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
