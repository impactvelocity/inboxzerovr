using UnityEditor;
using UnityEngine;

namespace InboxZero.EditorTools
{
    /// Long music tracks are streamed from disk instead of being unpacked into
    /// memory; short effects stay as they are, ready to play instantly.
    public class AudioImport : AssetPostprocessor
    {
        void OnPreprocessAudio()
        {
            if (!assetPath.Contains("Music")) return;
            var importer = (AudioImporter)assetImporter;
            var settings = importer.defaultSampleSettings;
            settings.loadType = AudioClipLoadType.Streaming;
            settings.compressionFormat = AudioCompressionFormat.Vorbis;
            settings.quality = 0.6f;
            importer.defaultSampleSettings = settings;
            importer.loadInBackground = true;
        }
    }
}
