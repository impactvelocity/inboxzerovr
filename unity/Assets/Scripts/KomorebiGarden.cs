using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace InboxZero
{
    /// Owns the garden's lighting and renderer, restoring the previous world on exit.
    [ExecuteAlways]
    public sealed class KomorebiGarden : MonoBehaviour, IKyotoScene
    {
        public UniversalRenderPipelineAsset pipeline;
        public Material skySource;
        public Light sun;
        public Light[] lanterns;
        public Volume volume;
        [Range(0, 1)] public float twilight;
        public float desktopFieldOfView = 48;
        public float DesktopFieldOfView => desktopFieldOfView;
        public string EarlyName => "midday";
        public string LateName => "twilight";
        Material sky;
        RenderPipelineAsset previousPipeline, previousQuality;
        Material previousSky;
        Light previousSun;
        AmbientMode previousAmbient;
        Color previousSkyColor, previousEquator, previousGround, previousFog;
        bool previousFogEnabled, active;
        FogMode previousFogMode;
        float previousFogDensity, previousShadowDistance;
        int previousLights;
        float gust;
        ParticleSystem[] particles;

        void OnEnable() { Activate(); }
        void Update() { if (!Application.isPlaying) Apply(twilight); }
        public void Step(float dt,float value)
        { gust=Mathf.MoveTowards(gust,0,dt*0.7f); Apply(value); }
        public void Stir(float strength,int petals=0)
        {
            gust=Mathf.Max(gust,Mathf.Clamp01(strength)*0.45f);
            if(petals<=0)return;
            if(particles==null)particles=GetComponentsInChildren<ParticleSystem>();
            foreach(var system in particles)
                if(system.name.Contains("CherryBlossom"))system.Emit(Mathf.Clamp(petals,1,12));
        }
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
            previousShadowDistance = QualitySettings.shadowDistance; previousLights = QualitySettings.pixelLightCount;
            GraphicsSettings.defaultRenderPipeline = pipeline;
            QualitySettings.renderPipeline = pipeline;
            QualitySettings.shadowDistance = 60; QualitySettings.pixelLightCount = 4;
            if (skySource != null) sky = new Material(skySource) { hideFlags = HideFlags.HideAndDontSave };
            active = true;
            Apply(twilight);
        }
        static Color C(int hex) => new Color(((hex>>16)&255)/255f, ((hex>>8)&255)/255f, (hex&255)/255f);
        public void Apply(float value)
        {
            if (!active) { Activate(); if (!active) return; }
            twilight = Mathf.Clamp01(value);
            float t = Mathf.SmoothStep(0, 1, twilight);
            if (sky != null)
            {
                sky.SetFloat("_Exposure", Mathf.Lerp(0.31f, 0.12f, t));
                sky.SetColor("_Tint", Color.Lerp(new Color(0.5f,0.51f,0.52f), new Color(0.55f,0.42f,0.59f),t));
                RenderSettings.skybox = sky;
            }
            RenderSettings.sun = sun;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Color.Lerp(C(0xa1bde6), C(0x74618f), t);
            RenderSettings.ambientEquatorColor = Color.Lerp(C(0x707c8c), C(0x4e435f), t);
            RenderSettings.ambientGroundColor = Color.Lerp(C(0x626858), C(0x2f314a), t);
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = Color.Lerp(C(0x9ac6d7), C(0x9d7b9e), t);
            RenderSettings.fogDensity = Mathf.Lerp(0.009f, 0.014f, t);
            if (sun != null)
            {
                sun.color = Color.Lerp(C(0xffefd4), C(0xffa17d), t);
                sun.intensity = Mathf.Lerp(2.2f, 0.36f, t);
                sun.transform.rotation = Quaternion.Euler(Mathf.Lerp(52, 9, t), Mathf.Lerp(-36, -64, t), 0);
            }
            if (lanterns != null) foreach (var light in lanterns)
                if (light != null) light.intensity = Mathf.Lerp(0.05f, 0.7f, t);
            Shader.SetGlobalFloat("_KyotoNight", t);
            Shader.SetGlobalFloat("RaygeasTreeWindForce", 0.3f+gust);
            Shader.SetGlobalFloat("RaygeasTreeWindSpeed", 3.5f);
            Shader.SetGlobalFloat("RaygeasTreeWindWavesScale", 0.6f);
            Shader.SetGlobalFloat("RaygeasTreeWindFlowDensity", 0.4f);
            Shader.SetGlobalFloat("RaygeasGrassWindForce", 0.24f+gust*0.6f);
            Shader.SetGlobalFloat("RaygeasGrassWindSpeed", 1.3f);
            Shader.SetGlobalVector("RaygeasWindDirection", new Vector3(0.8f,0,0.3f));
        }
        public void ConfigureCamera(Camera camera)
        {
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.allowHDR = true;
            camera.farClipPlane = Mathf.Max(camera.farClipPlane, 250);
            var data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.requiresDepthTexture = true;
            data.requiresColorTexture = true;
            data.antialiasing = AntialiasingMode.None;
            data.SetRenderer(0); // Kyoto v2 moves the camera to its own renderer
        }
        void OnDisable()
        {
            if (!active) return;
            GraphicsSettings.defaultRenderPipeline = previousPipeline;
            QualitySettings.renderPipeline = previousQuality;
            QualitySettings.shadowDistance = previousShadowDistance; QualitySettings.pixelLightCount = previousLights;
            RenderSettings.skybox = previousSky; RenderSettings.sun = previousSun;
            RenderSettings.ambientMode = previousAmbient;
            RenderSettings.ambientSkyColor = previousSkyColor;
            RenderSettings.ambientEquatorColor = previousEquator;
            RenderSettings.ambientGroundColor = previousGround;
            RenderSettings.fog = previousFogEnabled; RenderSettings.fogMode = previousFogMode;
            RenderSettings.fogDensity = previousFogDensity; RenderSettings.fogColor = previousFog;
            active = false;
            if (sky != null) { if(Application.isPlaying) Destroy(sky); else DestroyImmediate(sky); }
        }
    }
}
