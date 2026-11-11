using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace InboxZero.EditorTools
{
    /// Builds Assets/Scenes/Main.unity from the Blender models: the arena, the
    /// saber, the seat and the game object. Run it again after changing
    /// a model's parts (menu: Inbox Zero > Rebuild Scene). Everything the game
    /// shows while playing (cards, buttons, labels) is made by InboxGame.
    public static class SceneBuilder
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        static Material Save(Material material, string name)
        {
            Directory.CreateDirectory("Assets/Materials");
            string path = $"Assets/Materials/{name}.mat";
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null)
            {
                existing.shader = material.shader;
                existing.CopyPropertiesFromMaterial(material);
                existing.renderQueue = material.renderQueue;
                EditorUtility.SetDirty(existing);
                return existing;
            }
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        static GameObject Place(string model, System.Func<string, Material> materialFor)
        {
            string path = $"Assets/Models/{model}.fbx";
            var importer = (ModelImporter)AssetImporter.GetAtPath(path);
            if (importer.materialImportMode != ModelImporterMaterialImportMode.None || importer.importCameras)
            {
                importer.materialImportMode = ModelImporterMaterialImportMode.None;
                importer.importCameras = false;
                importer.importLights = false;
                importer.importAnimation = false;
                importer.SaveAndReimport();
            }
            var go = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(path));
            go.name = model;
            foreach (var renderer in go.GetComponentsInChildren<MeshRenderer>())
            {
                renderer.sharedMaterial = materialFor(renderer.name);
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
            }
            return go;
        }

        [MenuItem("Inbox Zero/Rebuild Scene")]
        public static void Build()
        {
            AssetDatabase.Refresh();

            var night = new Material(Look.Shader("Sky"));
            night.SetColor("_Sky", Look.Hex(0x08060f));
            night.SetColor("_Equator", Look.Hex(0x181030));
            night.SetColor("_Ground", Look.Hex(0x1f1535));
            var sky = Save(night, "Sky");
            var floor = Look.Lit(Look.Hex(0x07050f), 0);
            floor.SetFloat("_FadeStart", 1.0f);
            floor.SetFloat("_FadeEnd", 2.3f);
            floor.SetFloat("_ZWrite", 0);
            floor.SetFloat("_Cull", (float)CullMode.Off);
            floor.renderQueue = (int)RenderQueue.Transparent - 100;
            floor = Save(floor, "Floor");
            var level = Levels.All[0];
            var ring = Save(Look.Glow(Look.Hex(0x3b2a80)), "PlatformRing");
            // Weapons draw after the cards and labels, so they are always in front of
            // them, and still hide their own far sides.
            const int inFront = (int)RenderQueue.Transparent + 50;
            Material Weapon(Material material, string name, int queue = inFront)
            {
                material.renderQueue = queue;
                return Save(material, name);
            }
            // The blade is white-hot inside a shell of the level's colour; the
            // screen's saber glow does the rest. The grip is dark and plain.
            var blade = Weapon(Look.Glow(Look.Hex(0xf4ffff)), "BladeCore");
            var emitter = Weapon(Look.Glow(level.accent), "BladeEmitter");
            var button = Weapon(Look.Glow(level.second), "SaberSwitch");
            var halo = Weapon(Look.Neon(new Color(level.accent.r, level.accent.g, level.accent.b, 0.95f)), "BladeHalo", inFront + 10);
            var halo2 = Weapon(Look.Neon(new Color(level.accent.r, level.accent.g, level.accent.b, 0.4f)), "BladeHaloWide", inFront + 11);
            halo.SetFloat("_Soft", 1.2f);
            halo2.SetFloat("_Soft", 2.2f);
            var hilt = Weapon(Look.Lit(Look.Hex(0x15161c), 0.3f), "Hilt");
            var grip = Weapon(Look.Lit(Look.Hex(0x2a2c35), 0.15f), "SaberGrip");
            var shroud = Weapon(Look.Lit(Look.Hex(0x23252e), 0.45f), "SaberShroud");

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.skybox = sky;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.35f, 0.38f, 0.5f);
            RenderSettings.fog = false;

            Place("Arena", part => part.StartsWith("Ring") ? ring : floor);
            var sword = Place("Sword", part =>
                part == "Blade" ? blade : part == "Halo" ? halo : part == "Halo2" ? halo2 :
                part.StartsWith("Emitter") ? emitter : part == "Switch" ? button :
                part.StartsWith("Grip") ? grip : part == "Shroud" ? shroud : hilt);
            // Drawn crisp over the pixel world, and the source of its own glow (see RetroFx).
            foreach (var t in sword.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = RetroFx.SaberLayer;
            // Parked where the desktop view shows them; the game takes over on Play.
            sword.transform.SetPositionAndRotation(new Vector3(0.4f, 0.9f, 0.64f), Quaternion.Euler(28.6f, 0, 20));

            var rig = new GameObject("Seat");
            var seated = rig.AddComponent<SeatedRig>();
            var headGo = new GameObject("Head") { tag = "MainCamera" };
            headGo.transform.SetParent(rig.transform, false);
            headGo.transform.localPosition = new Vector3(0, SeatedRig.SeatedEyeHeight, 0);
            var head = headGo.AddComponent<Camera>();
            head.fieldOfView = 70;
            head.nearClipPlane = 0.05f;
            head.farClipPlane = 100;
            head.clearFlags = CameraClearFlags.Skybox;
            head.backgroundColor = Look.Hex(0x08060f);
            head.cullingMask = ~(1 << Painter.Layer);
            head.allowHDR = false;
            headGo.AddComponent<AudioListener>();
            headGo.AddComponent<RetroFx>(); // the level's pixel-art screen treatment
            seated.head = head;

            var gameGo = new GameObject("Game");
            var speaker = gameGo.AddComponent<AudioSource>();
            speaker.playOnAwake = false;
            speaker.spatialBlend = 0;
            var game = gameGo.AddComponent<InboxGame>();
            game.rig = rig.transform;
            game.head = head;
            game.sword = sword.transform;
            game.speaker = speaker;

            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            PlayerSettings.productName = "Inbox Zero";
            PlayerSettings.companyName = "Inbox Zero";
            QualitySettings.antiAliasing = 4;
            AssetDatabase.SaveAssets();
            Debug.Log("[InboxZero] Scene built: " + ScenePath);
        }
    }
}
