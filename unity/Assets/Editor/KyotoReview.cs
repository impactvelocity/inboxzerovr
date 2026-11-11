using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace InboxZero.EditorTools
{
    /// Repeatable, isolated art review from the actual runtime world and shaders.
    /// Does not open, rebuild or save the user's working scene.
    [InitializeOnLoad]
    public static class KyotoReview
    {
        const string Request = "Checks/kyoto-review.request";
        static KyotoReview() { EditorApplication.update += Poll; EditorApplication.update += FinishPreview; }

        [MenuItem("Inbox Zero/Kyoto/Preview Garden in Play Mode")]
        public static void Preview()
        {
            SessionState.SetBool("Kyoto.ArtPreview", true);
            if (!EditorApplication.isPlaying) EditorApplication.isPlaying = true;
        }

        static void FinishPreview()
        {
            if (!EditorApplication.isPlaying || !SessionState.GetBool("Kyoto.ArtPreview", false)) return;
            var game = UnityEngine.Object.FindAnyObjectByType<InboxGame>();
            if (game == null || game.Session == null) return;
            SessionState.SetBool("Kyoto.ArtPreview", false);
            var eye = game.head.transform.position;
            game.Click(new Ray(eye, game.LevelTileAt(1)-eye));
            game.SetDev(true);
            game.DevLook(0, 0);
        }

        static void Poll()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling ||
                EditorApplication.isUpdating || !File.Exists(Request)) return;
            string command = File.ReadAllText(Request).Trim();
            File.Delete(Request);
            try
            {
                if (command == "capture") Capture();
                else if (command == "preview") Preview();
                else if (command == "playthrough")
                {
                    Playthrough.Run();
                    EditorSceneManager.OpenScene("Assets/Scenes/Main.unity");
                }
            }
            catch (Exception e)
            {
                File.WriteAllText("Checks/kyoto-review-error.txt", e.ToString());
                Debug.LogException(e);
            }
        }

        [MenuItem("Inbox Zero/Kyoto/Capture Art Review")]
        public static void Capture() => KomorebiReview.Begin();
    }
}
