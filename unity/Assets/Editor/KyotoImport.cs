using UnityEditor;
using UnityEngine;

namespace InboxZero.EditorTools
{
    /// Import settings for the Kyoto level's files (Assets/Resources/Kyoto),
    /// which Blender/kyoto_courtyard/source/export_unity.py writes.
    ///
    /// The models bring no materials, cameras or lights; the game dresses them.
    /// Their vertex colours and extra UV sets carry the baked light, so nothing
    /// may be compressed or stripped, and the letter must stay readable so the
    /// game can turn a copy of it to face the seat. The two backdrops are the
    /// same panorama at two times of day and must not wrap or band.
    public class KyotoImport : AssetPostprocessor
    {
        bool Ours => assetPath.StartsWith("Assets/Resources/Kyoto/");

        void OnPreprocessModel()
        {
            if (!Ours) return;
            var model = (ModelImporter)assetImporter;
            model.materialImportMode = ModelImporterMaterialImportMode.None;
            model.importCameras = false;
            model.importLights = false;
            model.importAnimation = false;
            model.animationType = ModelImporterAnimationType.None;
            model.importBlendShapes = false;
            model.meshCompression = ModelImporterMeshCompression.Off;
            model.isReadable = assetPath.EndsWith("Letter.fbx");
            model.importNormals = ModelImporterNormals.Import;
            model.importTangents = ModelImporterTangents.None;
            model.weldVertices = true;
            model.swapUVChannels = false;
            model.generateSecondaryUV = false;
        }

        void OnPreprocessTexture()
        {
            if (!Ours) return;
            var texture = (TextureImporter)assetImporter;
            bool backdrop = assetPath.Contains("Backdrop_"), atlas = assetPath.Contains("Atlas_"),
                panorama = assetPath.Contains("Env_") || assetPath.Contains("Reflection_");
            texture.mipmapEnabled = true;
            texture.wrapMode = backdrop || atlas ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
            if (panorama) texture.wrapModeV = TextureWrapMode.Clamp;      // round the horizon, not over the pole
            texture.maxTextureSize = 4096;
            texture.npotScale = backdrop ? TextureImporterNPOTScale.None : TextureImporterNPOTScale.ToNearest;
            texture.textureCompression = backdrop ? TextureImporterCompression.Uncompressed : TextureImporterCompression.CompressedHQ;
            texture.filterMode = FilterMode.Trilinear;
            if (atlas) texture.anisoLevel = 8;                             // the deck is seen at a shallow angle
            texture.alphaSource = TextureImporterAlphaSource.None;
        }
    }
}
