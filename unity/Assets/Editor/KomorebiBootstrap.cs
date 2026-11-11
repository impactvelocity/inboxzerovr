using System.IO;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;

namespace InboxZero.EditorTools
{
    [InitializeOnLoad]
    public static class KomorebiBootstrap
    {
        static KomorebiBootstrap() { EditorApplication.update += Poll; }
        static void Poll()
        {
            if(EditorApplication.isCompiling || EditorApplication.isUpdating || EditorApplication.isPlayingOrWillChangePlaymode)return;
            if(File.Exists("Checks/komorebi-linear.request"))
            {
                File.Delete("Checks/komorebi-linear.request"); PlayerSettings.colorSpace=ColorSpace.Linear; return;
            }
            if(File.Exists("Checks/komorebi-player-scripts.request"))
            {
                File.Delete("Checks/komorebi-player-scripts.request"); ValidatePlayerScripts(); return;
            }
            if (File.Exists("Checks/komorebi-audit.request") && !EditorApplication.isCompiling && !EditorApplication.isUpdating)
            {
                File.Delete("Checks/komorebi-audit.request");
                if (EditorApplication.isPlaying) EditorApplication.isPlaying = false;
                Audit();
            }
            const string request = "Checks/komorebi-install.request";
            if (!File.Exists(request)) return;
            if (EditorApplication.isPlaying) { EditorApplication.isPlaying = false; return; }
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            File.Delete(request);
            Client.Add("com.unity.render-pipelines.universal");
            Debug.Log("[Komorebi] Installing Unity's compatible URP package.");
        }

        [MenuItem("Inbox Zero/Komorebi/Validate Android Scripts")]
        public static void ValidatePlayerScripts()
        {
            var settings=new UnityEditor.Build.Player.ScriptCompilationSettings
            { target=BuildTarget.Android, group=BuildTargetGroup.Android, options=UnityEditor.Build.Player.ScriptCompilationOptions.None };
            Directory.CreateDirectory("Checks/komorebi-player-scripts");
            var result=UnityEditor.Build.Player.PlayerBuildInterface.CompilePlayerScripts(settings,"Checks/komorebi-player-scripts");
            bool passed=result.assemblies!=null && result.assemblies.Count>0;
            File.WriteAllText("Checks/komorebi-player-scripts/result.txt",passed?"Android player scripts compiled successfully (not an APK or hardware test).":"Android player script compilation failed.");
            if(!passed)throw new System.Exception("Android player scripts did not compile.");
            Debug.Log("[Komorebi] Android player scripts compiled successfully.");
        }

        static void Audit()
        {
            var text = new System.Text.StringBuilder();
            foreach (string guid in AssetDatabase.FindAssets("t:Prefab", new[] { "Assets/Raygeas/Komorebi Nature/Assets/Prefabs" }))
            {
                string path=AssetDatabase.GUIDToAssetPath(guid);
                if (path.Contains("Snow") || path.Contains("Particle") || path.Contains("Mushroom")) continue;
                var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var go=Object.Instantiate(prefab);
                var renderers=go.GetComponentsInChildren<Renderer>();
                var bounds=new Bounds(); bool first=true;
                foreach (var r in renderers) { if(first) {bounds=r.bounds;first=false;} else bounds.Encapsulate(r.bounds); }
                text.AppendLine($"{path}: center={bounds.center:F2}; size={bounds.size:F2}; renderers={renderers.Length}");
                if (path.Contains("Gazebo") || path.Contains("Hokora"))
                    foreach(var r in renderers)text.AppendLine("  "+r.name+" "+r.bounds.size.ToString("F2"));
                Object.DestroyImmediate(go);
            }
            File.WriteAllText("Checks/komorebi-inventory.txt",text.ToString());
            Debug.Log("[Komorebi] Asset inventory saved.");
        }
    }
}
