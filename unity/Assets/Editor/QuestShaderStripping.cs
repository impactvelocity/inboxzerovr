using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace InboxZero.EditorTools
{
    /// Drops shader variants a Quest build can never use, so the Android build
    /// compiles thousands of variants instead of hundreds of thousands. URP's
    /// own stripping keeps everything the pipeline asset allows; this removes
    /// what the headset never switches on:
    ///
    /// - lightmaps and shadowmasks: nothing is baked, all light is live
    ///   (LIGHTMAP_BICUBIC_SAMPLING stays: URP's settings turn it on in every
    ///   variant, so stripping it would leave nothing);
    /// - screen-space effects (SSAO, SSR, irradiance, screen-space shadows):
    ///   the headset draws through the plain renderer (renderer 0), which has
    ///   no features; contact shadows are monitor-only;
    /// - Forward+, decals, light cookies, additional-light shadows, vertex
    ///   additional lights, probe volumes: off in the pipeline or the renderers;
    /// - low and medium soft shadows: the pipeline asks for high;
    /// - debug views and Meta's orthographic projection.
    ///
    /// If a scene starts using one of these (a baked lightmap, a cookie, a decal
    /// feature on renderer 0), take its keyword out of this list.
    class QuestShaderStripping : IPreprocessShaders
    {
        static readonly HashSet<string> Never = new HashSet<string>
        {
            "LIGHTMAP_ON", "DIRLIGHTMAP_COMBINED", "DYNAMICLIGHTMAP_ON", "LIGHTMAP_SHADOW_MIXING",
            "SHADOWS_SHADOWMASK",
            "_MAIN_LIGHT_SHADOWS_SCREEN", "_SCREEN_SPACE_OCCLUSION", "_SCREEN_SPACE_REFLECTION",
            "_SCREEN_SPACE_IRRADIANCE",
            "_CLUSTER_LIGHT_LOOP", "_FORWARD_PLUS", "_DBUFFER_MRT1", "_DBUFFER_MRT2", "_DBUFFER_MRT3",
            "_LIGHT_COOKIES", "_ADDITIONAL_LIGHT_SHADOWS", "_ADDITIONAL_LIGHTS_VERTEX",
            "PROBE_VOLUMES_L1", "PROBE_VOLUMES_L2",
            "_SHADOWS_SOFT_LOW", "_SHADOWS_SOFT_MEDIUM",
            "DEBUG_DISPLAY", "META_QUEST_ORTHO_PROJ",
        };

        static int kept, dropped;

        public int callbackOrder => 100; // after URP's own stripping

        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android) return;
            int before = data.Count;
            if (before == 0) return;

            var keep = new List<ShaderCompilerData>(before);
            string firstHit = null;
            foreach (var variant in data)
            {
                string hit = null;
                foreach (var keyword in variant.shaderKeywordSet.GetShaderKeywords())
                {
                    var name = keyword.name;
                    if (Never.Contains(name)) { hit = name; break; }
                }
                if (hit == null) keep.Add(variant);
                else if (firstHit == null) firstHit = hit;
            }
            if (keep.Count == 0)
            {
                // Never leave a pass with nothing to draw with.
                var names = new List<string>();
                foreach (var keyword in data[0].shaderKeywordSet.GetShaderKeywords())
                    names.Add(keyword.name);
                Debug.LogWarning($"[InboxZero] Quest stripping would empty {shader.name} ({snippet.passName}), " +
                                 $"first hit {firstHit}, first variant [{string.Join(" ", names)}]; kept all {before}");
                keep.AddRange(data);
            }
            data.Clear();
            foreach (var variant in keep) data.Add(variant);
            kept += data.Count;
            dropped += before - data.Count;
            if (before - data.Count > 1000)
                Debug.Log($"[InboxZero] Quest stripping: {shader.name} ({snippet.passName}) {before} -> {data.Count} variants");
        }

        class Report : IPostprocessBuildWithReport
        {
            public int callbackOrder => 0;
            public void OnPostprocessBuild(UnityEditor.Build.Reporting.BuildReport report)
            {
                if (report.summary.platform != BuildTarget.Android) return;
                Debug.Log($"[InboxZero] Quest stripping: kept {kept} variants, dropped {dropped}");
                kept = dropped = 0;
            }
        }
    }
}
