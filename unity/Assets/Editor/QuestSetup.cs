using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace InboxZero.EditorTools
{
    /// Sets the project up for a Meta Quest and builds the APK.
    /// Menu: Inbox Zero > Configure For Quest, Build Quest APK.
    ///
    /// The headset is reached through OpenXR: Meta Quest Support, the Touch
    /// controller profiles and hand tracking (the XR Hands package).
    public static class QuestSetup
    {
        const string LoaderKey = "com.unity.xr.management.loader_settings";
        const string OpenXRLoaderType = "UnityEngine.XR.OpenXR.OpenXRLoader";
        public const string ApkPath = "Builds/InboxZero.apk";

        static readonly System.Type[] Features =
        {
            typeof(UnityEngine.XR.OpenXR.Features.MetaQuestSupport.MetaQuestFeature),
            typeof(UnityEngine.XR.OpenXR.Features.Interactions.OculusTouchControllerProfile),        // Quest 2 / Pro
            typeof(UnityEngine.XR.OpenXR.Features.Interactions.MetaQuestTouchPlusControllerProfile), // Quest 3
            typeof(UnityEngine.XR.Hands.OpenXR.HandTracking),                                        // hand joints
        };

        [MenuItem("Inbox Zero/Configure For Quest")]
        public static void Configure()
        {
            var android = BuildTargetGroup.Android;
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                EditorUserBuildSettings.SwitchActiveBuildTarget(android, BuildTarget.Android);

            // Player.
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.inboxzero.vr");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)32; // Horizon OS is Android 12L or newer
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            // OpenXR reads devices through the Input System package.
            var player = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            var handler = player.FindProperty("activeInputHandler");
            if (handler != null && handler.intValue != 1)
            {
                handler.intValue = 1; // Input System Package (New)
                player.ApplyModifiedPropertiesWithoutUndo();
                Debug.Log("[InboxZero] Input handling set to the Input System package (takes effect after a restart).");
            }

            // XR Plug-in Management: start OpenXR on Android.
            if (!EditorBuildSettings.TryGetConfigObject(LoaderKey, out XRGeneralSettingsPerBuildTarget perTarget) || perTarget == null)
            {
                var guids = AssetDatabase.FindAssets("t:XRGeneralSettingsPerBuildTarget");
                if (guids.Length > 0)
                    perTarget = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>(AssetDatabase.GUIDToAssetPath(guids[0]));
                if (perTarget == null)
                {
                    Directory.CreateDirectory("Assets/XR");
                    perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                    AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                }
                EditorBuildSettings.AddConfigObject(LoaderKey, perTarget, true);
            }
            if (!perTarget.HasManagerSettingsForBuildTarget(android)) perTarget.CreateDefaultManagerSettingsForBuildTarget(android);
            var general = perTarget.SettingsForBuildTarget(android);
            general.InitManagerOnStart = true;
            if (!XRPackageMetadataStore.IsLoaderAssigned(OpenXRLoaderType, android) &&
                !XRPackageMetadataStore.AssignLoader(general.Manager, OpenXRLoaderType, android))
                Debug.LogError("[InboxZero] Could not assign the OpenXR loader for Android.");
            EditorUtility.SetDirty(general);
            EditorUtility.SetDirty(perTarget);

            // OpenXR features.
            FeatureHelpers.RefreshFeatures(android);
            var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(android);
            if (openxr == null)
            {
                Debug.LogError("[InboxZero] No OpenXR settings for Android.");
                return;
            }
            openxr.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
            foreach (var feature in openxr.GetFeatures())
            {
                bool wanted = System.Array.IndexOf(Features, feature.GetType()) >= 0;
                if (feature.enabled != wanted) { feature.enabled = wanted; EditorUtility.SetDirty(feature); }
            }
            foreach (var type in Features)
                if (openxr.GetFeatures(type).Length == 0) Debug.LogError("[InboxZero] OpenXR feature not found: " + type.Name);
            EditorUtility.SetDirty(openxr);
            AssetDatabase.SaveAssets();

            foreach (var feature in openxr.GetFeatures())
                if (feature.enabled) Debug.Log("[InboxZero] OpenXR feature on: " + feature.name);
            Debug.Log($"[InboxZero] Quest configured. Loader assigned: {XRPackageMetadataStore.IsLoaderAssigned(OpenXRLoaderType, android)}");
        }

        [MenuItem("Inbox Zero/Build Quest APK")]
        public static void Build()
        {
            Configure();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { "Assets/Scenes/Main.unity" },
                locationPathName = ApkPath,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            });
            Debug.Log($"[InboxZero] Quest build {report.summary.result}: {report.summary.outputPath} " +
                      $"({report.summary.totalSize / (1024 * 1024)} MB, {report.summary.totalErrors} errors)");
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }
    }
}
