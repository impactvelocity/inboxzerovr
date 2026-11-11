using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace InboxZero.EditorTools
{
    /// Builds a desktop app to Builds/InboxZero.app (menu: Inbox Zero > Build Mac App).
    public static class BuildApp
    {
        [MenuItem("Inbox Zero/Build Mac App")]
        public static void Mac()
        {
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { "Assets/Scenes/Main.unity" },
                locationPathName = "Builds/InboxZero.app",
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
            });
            Debug.Log($"[InboxZero] Build {report.summary.result}: {report.summary.outputPath}");
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
