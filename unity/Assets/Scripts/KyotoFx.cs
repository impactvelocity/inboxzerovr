using UnityEngine;
using UnityEngine.XR;

namespace InboxZero
{
    /// Restrained optical bloom for desktop. Headsets keep the world-space
    /// light halos, without a stereo-unsafe OnRenderImage post-process.
    [ExecuteAlways, RequireComponent(typeof(Camera))]
    public sealed class KyotoFx : MonoBehaviour
    {
        [Range(0, 0.5f)] public float bloom = 0.22f;
        Material material;

        void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (XRSettings.isDeviceActive || bloom <= 0)
            {
                Graphics.Blit(source, destination);
                return;
            }
            if (material == null)
            {
                var shader = Look.Shader("KyotoBloom");
                if (shader == null || !shader.isSupported) { Graphics.Blit(source, destination); return; }
                material = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            }
            var a = RenderTexture.GetTemporary(Mathf.Max(1, source.width/2), Mathf.Max(1, source.height/2), 0, source.format);
            var b = RenderTexture.GetTemporary(Mathf.Max(1, source.width/4), Mathf.Max(1, source.height/4), 0, source.format);
            var c = RenderTexture.GetTemporary(Mathf.Max(1, source.width/8), Mathf.Max(1, source.height/8), 0, source.format);
            a.filterMode = b.filterMode = c.filterMode = FilterMode.Bilinear;
            try
            {
                Graphics.Blit(source, a, material, 0);
                Graphics.Blit(a, b, material, 1);
                Graphics.Blit(b, c, material, 1);
                Graphics.Blit(c, b, material, 1);
                material.SetTexture("_Bloom", b);
                material.SetFloat("_Strength", bloom);
                Graphics.Blit(source, destination, material, 2);
            }
            finally
            {
                RenderTexture.ReleaseTemporary(a);
                RenderTexture.ReleaseTemporary(b);
                RenderTexture.ReleaseTemporary(c);
            }
        }

        void OnDestroy()
        {
            if (material == null) return;
            if (Application.isPlaying) Destroy(material); else DestroyImmediate(material);
        }
    }
}
