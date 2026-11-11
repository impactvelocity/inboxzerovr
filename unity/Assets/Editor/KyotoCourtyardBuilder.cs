using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace InboxZero.EditorTools
{
    /// Puts the Kyoto v2 courtyard together and saves it as a prefab
    /// (Assets/Resources/KyotoV2/Courtyard.prefab), which the game loads.
    ///
    /// Old:  the veranda, machiya, walls and shut gate from the Blender courtyard
    ///       (Assets/KyotoV2/Architecture.fbx, written by
    ///       Blender/kyoto_courtyard/source/export_v2.py), in the same places.
    /// Sky:  the sunset panorama from ANGRY MESH's Meadow Environment pack, with
    ///       its mountains, birds, butterflies and a few of its flowers. That
    ///       pack must have its own "URP Template" applied (see its SRP Templates).
    /// New:  everything that grows or was carved, from Komorebi Nature: the
    ///       cherry tree (the pack's largest), stepping stones, rocks, lanterns,
    ///       pond, the bamboo and bushes that hide the left wall, and petals.
    ///
    /// Positions are in the prefab's own space: the seated eye is at (0, 1.55, 0)
    /// looking along +Z, the deck is 0.35 up and the garden's ground is at 0.
    /// B(x, y, z) converts a point of the Blender scene.
    ///
    /// Menu: Inbox Zero > Kyoto v2 > Rebuild Courtyard, and > Capture Review,
    /// which renders the scene from the seat at dusk and at night to Checks/v2-review.
    public static class KyotoCourtyardBuilder
    {
        const string Pack = "Assets/Raygeas/Komorebi Nature/";
        const string Meadow = "Assets/ANGRY MESH/Stylized Pack - Meadow Environment/";
        const string Old = "Assets/KyotoV2/";
        const string Made = "Assets/KyotoV2/Generated/";
        const string Out = "Assets/Resources/KyotoV2/";
        const float Seat = 2.2f;                  // the seat sits this far forward of the Blender scene's origin
        public const float Eye = 1.55f;

        /// Light in the air is drawn before the game's own see-through things (the letter, the
        /// labels, the blade), so it never washes over an email.
        const int GlowQueue = 2950;
        static Transform root;
        static Material haloMaterial, shaftMaterial;
        static readonly List<GameObject> dayOnly = new List<GameObject>();
        static readonly List<KyotoCourtyard.Lamp> lamps = new List<KyotoCourtyard.Lamp>();
        static readonly List<KyotoCourtyard.Glow> glows = new List<KyotoCourtyard.Glow>();
        static readonly List<ParticleSystem> petals = new List<ParticleSystem>();
        static System.Random random;

        static Vector3 B(float x, float y, float z = 0) => new Vector3(x, z, y - Seat);
        static Color Hex(int hex, float gain = 1) =>
            new Color(((hex >> 16) & 255) / 255f * gain, ((hex >> 8) & 255) / 255f * gain, (hex & 255) / 255f * gain, 1);
        /// For shader colours that must arrive as they are (HDR, linear).
        static Color Hdr(int hex, float gain)
        {
            var colour = Hex(hex).linear * gain;
            colour.a = 1;
            return colour;
        }
        static float Rand(float a, float b) => a + (float)random.NextDouble() * (b - a);

        static T Load<T>(string path) where T : Object
        {
            var value = AssetDatabase.LoadAssetAtPath<T>(path);
            if (value == null) throw new InvalidOperationException("Missing asset: " + path);
            return value;
        }

        /// Write an asset, keeping the file (and so every reference to it) if it is already there.
        static T Save<T>(T asset, string path) where T : Object
        {
            var old = AssetDatabase.LoadAssetAtPath<T>(path);
            if (old != null)
            {
                EditorUtility.CopySerialized(asset, old);
                Object.DestroyImmediate(asset);
                EditorUtility.SetDirty(old);
                return old;
            }
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        // ------------------------------------------------------------ ground

        const float TreeX = -5.0f, TreeZ = 8.8f;
        // The pond stops short of the machiya (its footing is at x = 3.8): a bank of gravel, stones
        // and leaves lies between them, as under any eave.
        const float PondX = 2.45f, PondZ = 5.6f, PondRx = 0.75f, PondRz = 2.1f, WaterLevel = -0.13f;

        /// The stepping stones, deck to gate, and on along the lane beyond it.
        static readonly Vector2[] Path =
        {
            new Vector2(-0.30f, 3.70f), new Vector2(0.35f, 5.16f), new Vector2(0.21f, 6.59f), new Vector2(0.70f, 8.00f),
            new Vector2(0.62f, 9.37f), new Vector2(1.14f, 10.71f), new Vector2(1.49f, 11.98f), new Vector2(2.02f, 13.19f),
        };

        static float Bump(float x, float z, float cx, float cz, float r)
        {
            float dx = (x - cx) / r, dz = (z - cz) / r;
            return Mathf.Exp(-(dx * dx + dz * dz));
        }

        static float Pond(float x, float z) =>
            Mathf.Exp(-Mathf.Pow(Mathf.Abs((x - PondX) / PondRx), 4) - Mathf.Pow(Mathf.Abs((z - PondZ) / PondRz), 4));

        static float Ground(float x, float z)
        {
            float y = 0.05f * (Mathf.PerlinNoise(x * 0.35f + 20, z * 0.35f + 40) - 0.5f);
            y += 0.32f * Bump(x, z, TreeX, TreeZ, 2.2f);      // the mound the tree stands on
            y += 0.10f * Bump(x, z, -2.9f, 6.3f, 0.9f);       // and the lantern's
            y -= 0.62f * Pond(x, z);
            if (z > 2.4f && z < 9.8f)                          // the bank at the machiya's foot stands a little proud
                y += 0.05f * Mathf.Exp(-Mathf.Pow((x - 3.6f) / 0.28f, 2)) * Mathf.Clamp01(Mathf.Min(z - 2.4f, 9.8f - z) * 2);
            float beyond = Mathf.Max(Mathf.Max(-6.8f - x, x - 10.6f), z - 15.2f);
            if (beyond > 0) y += Mathf.Min(beyond * 0.045f, 1.6f);     // the land rises toward the hills
            return y;
        }

        static float PathDistance(float x, float z)
        {
            var p = new Vector2(x, z);
            float best = 99;
            var from = new Vector2(-0.3f, 2.3f);
            for (int i = 0; i <= Path.Length + 1; i++)
            {
                var to = i < Path.Length ? Path[i] : i == Path.Length ? new Vector2(2.33f, 14.6f) : new Vector2(2.33f, 44);
                var along = to - from;
                float t = Mathf.Clamp01(Vector2.Dot(p - from, along) / along.sqrMagnitude);
                best = Mathf.Min(best, (p - (from + along * t)).magnitude);
                from = to;
            }
            return best;
        }

        static TerrainLayer Layer(string name, string source, int tint, float gain, float tile)
        {
            var layer = Object.Instantiate(Load<TerrainLayer>(Pack + "Assets/Terrain Layers/" + source + ".terrainlayer"));
            layer.name = name;
            var colour = Hex(tint, gain);
            layer.diffuseRemapMax = new Vector4(colour.r, colour.g, colour.b, 1);
            layer.tileSize = new Vector2(tile, tile);
            return Save(layer, Made + name + ".terrainlayer");
        }

        static void BuildGround()
        {
            const int cells = 513, splats = 512;
            var size = new Vector3(72, 10, 72);
            var origin = new Vector3(-36, -4, -14);
            var data = AssetDatabase.LoadAssetAtPath<TerrainData>(Made + "Ground.asset");
            if (data == null) { data = new TerrainData(); AssetDatabase.CreateAsset(data, Made + "Ground.asset"); }
            data.heightmapResolution = cells; data.alphamapResolution = splats; data.baseMapResolution = 1024;
            data.size = size;
            var heights = new float[cells, cells];
            for (int z = 0; z < cells; z++)
                for (int x = 0; x < cells; x++)
                    heights[z, x] = (Ground(origin.x + x / (cells - 1f) * size.x, origin.z + z / (cells - 1f) * size.z) - origin.y) / size.y;
            data.SetHeights(0, 0, heights);
            data.terrainLayers = new[]
            {
                Layer("Moss", "Grass_1", 0x2a6a3c, 0.5f, 2.2f),
                Layer("Earth", "Ground_1", 0x6e4c4c, 0.62f, 3.5f),
                Layer("Gravel", "Stones_1", 0x6c6a80, 0.5f, 1.6f),
            };
            var map = new float[splats, splats, 3];
            for (int z = 0; z < splats; z++)
                for (int x = 0; x < splats; x++)
                {
                    float wx = origin.x + (x + 0.5f) / splats * size.x, wz = origin.z + (z + 0.5f) / splats * size.z;
                    float ragged = (Mathf.PerlinNoise(wx * 1.7f + 5, wz * 1.7f + 9) - 0.5f) * 0.5f;
                    float earth = 1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.5f, 1.0f, PathDistance(wx, wz) + ragged));
                    float pond = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.05f, 0.32f, Pond(wx, wz)));
                    // a band of gravel under the eaves, where the rain drips
                    bool yard = wx > -6 && wx < 3.9f;
                    float drip = yard ? 1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.55f, 0.95f, wz - 2.33f + ragged * 0.5f)) : 0;
                    // ...and along the foot of the machiya, where the pond's bank meets the building
                    float foot = wz > 2.3f && wz < 9.9f && wx < 4 ? 1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.3f, 0.62f, 3.85f - wx + ragged * 0.35f)) : 0;
                    float gravel = Mathf.Max(pond, Mathf.Max(drip, foot));
                    earth *= 1 - gravel;
                    map[z, x, 0] = 1 - earth - gravel; map[z, x, 1] = earth; map[z, x, 2] = gravel;
                }
            data.SetAlphamaps(0, 0, map);
            EditorUtility.SetDirty(data);

            var go = Terrain.CreateTerrainGameObject(data);
            go.name = "Ground · Komorebi terrain layers";
            go.transform.SetParent(root, false);
            go.transform.localPosition = origin;
            var terrain = go.GetComponent<Terrain>();
            terrain.drawInstanced = true;
            terrain.heightmapPixelError = 4;
            terrain.basemapDistance = 70;
            terrain.shadowCastingMode = ShadowCastingMode.Off;
            terrain.materialTemplate = Load<Material>(Pack + "Demo/KomorebiNature_Demo/Terrain.mat");
            Object.DestroyImmediate(go.GetComponent<TerrainCollider>());
        }

        // ---------------------------------------------------------- placing

        static GameObject Place(string prefab, Vector3 position, Vector3 scale, float yaw, bool shadows = true)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(Pack + "Assets/Prefabs/" + prefab + ".prefab"), root);
            go.transform.localPosition = position;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            go.transform.localScale = scale;
            if (!shadows)
                foreach (var renderer in go.GetComponentsInChildren<Renderer>(true))
                    renderer.shadowCastingMode = ShadowCastingMode.Off;
            return go;
        }

        /// On the ground at (x, z), `lift` above it.
        static GameObject P(string prefab, float x, float z, float size = 1, float yaw = 0, float lift = 0, bool shadows = true) =>
            Place(prefab, new Vector3(x, Ground(x, z) + lift, z), Vector3.one * size, yaw, shadows);

        // The pack's stones: how wide each is, and how far its top stands above its pivot, at scale 1.
        static readonly (float width, float top)[] Stones =
        {
            (0, 0), (6.4f, 1.6f), (8.0f, 3.18f), (4.5f, 1.63f), (3.5f, 1.39f), (7.0f, 3.9f), (6.6f, 3.45f), (5.5f, 2.69f), (7.4f, 3.17f),
        };

        /// A mossy stone `width` across, standing `height` out of the ground.
        static void Rock(int kind, float x, float z, float width, float height, float yaw, bool mossy = true)
        {
            float s = width / Stones[kind].width;
            Place(mossy ? "Rocks Grass/Stone_" + kind : "Rocks/Stone_" + kind + "_NoGrass",
                new Vector3(x, Ground(x, z) + height - Stones[kind].top * s, z), Vector3.one * s, yaw);
        }

        /// A lamp that is part of a pack prefab: its light, and the lit panes that glow with it.
        static void Lamp(GameObject go, int colour, float range, float dusk, float night, float flicker, float panesDusk, float panesNight)
        {
            foreach (var light in go.GetComponentsInChildren<Light>(true))
            {
                light.color = Hex(colour); light.range = range; light.shadows = LightShadows.None;
                light.renderMode = LightRenderMode.ForcePixel;
                lamps.Add(new KyotoCourtyard.Lamp { light = light, dusk = dusk, night = night, flicker = flicker });
            }
            foreach (var renderer in go.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                    if (materials[i] != null && materials[i].name.Contains("_Light"))
                        glows.Add(new KyotoCourtyard.Glow
                        {
                            renderer = renderer, slot = i, property = "_EmissionColor",
                            dusk = Color.white * panesDusk, night = Color.white * panesNight, flicker = flicker * 0.6f,
                        });
            }
        }

        static Light PointLight(string name, Vector3 at, int colour, float range, float dusk, float night, float flicker)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            go.transform.localPosition = at;
            var light = go.AddComponent<Light>();
            light.type = LightType.Point; light.color = Hex(colour); light.range = range;
            light.shadows = LightShadows.None; light.renderMode = LightRenderMode.ForcePixel;
            lamps.Add(new KyotoCourtyard.Lamp { light = light, dusk = dusk, night = night, flicker = flicker });
            return light;
        }

        /// A shaft of light from `top`, along the last sunlight, `length` long: a long soft
        /// sheet turned about its own line to face the seat.
        static void Shaft(Vector3 top, float length, float width, float strength)
        {
            var along = Quaternion.Euler(KyotoCourtyard.SunLight.x, KyotoCourtyard.SunLight.y, 0) * Vector3.forward;
            var centre = top + along * length * 0.5f;
            var facing = Vector3.ProjectOnPlane(new Vector3(0, Eye, 0) - centre, along).normalized;
            var go = new GameObject("Shaft of light");
            go.transform.SetParent(root, false);
            go.transform.localPosition = centre;
            go.transform.localRotation = Quaternion.LookRotation(-facing, along);
            go.transform.localScale = new Vector3(width, length, 1);
            go.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = shaftMaterial;
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            glows.Add(new KyotoCourtyard.Glow
            {
                renderer = renderer, slot = -1, property = "_Color", sunlit = true,
                dusk = Hdr(0xffb27c, strength), night = Hdr(0x93a4ff, strength * 0.3f),
            });
        }

        /// A soft light in the air, turned to face the seat.
        static void Halo(string name, Vector3 at, float width, float height, Color dusk, Color night, float flicker = 0)
        {
            var go = new GameObject("Halo · " + name);
            go.transform.SetParent(root, false);
            go.transform.localPosition = at;
            go.transform.localRotation = Quaternion.LookRotation(at - new Vector3(0, Eye, 0));
            go.transform.localScale = new Vector3(width, height, 1);
            go.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = haloMaterial;
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            glows.Add(new KyotoCourtyard.Glow { renderer = renderer, slot = -1, property = "_Color", dusk = dusk, night = night, flicker = flicker });
        }

        // ------------------------------------------------------ old buildings

        static void ImportOld()
        {
            foreach (var (file, colour, size) in new[] { ("Architecture_Albedo.png", true, 4096), ("Architecture_Occlusion.png", false, 2048) })
            {
                var texture = (TextureImporter)AssetImporter.GetAtPath(Old + file);
                if (texture.sRGBTexture == colour && texture.maxTextureSize == size && texture.anisoLevel == 8 &&
                    texture.wrapMode == TextureWrapMode.Clamp) continue;
                texture.sRGBTexture = colour; texture.maxTextureSize = size; texture.anisoLevel = 8;   // the deck is seen at a shallow angle
                texture.wrapMode = TextureWrapMode.Clamp; texture.mipmapEnabled = true; texture.filterMode = FilterMode.Trilinear;
                texture.textureCompression = TextureImporterCompression.CompressedHQ;
                texture.alphaSource = TextureImporterAlphaSource.None;
                texture.SaveAndReimport();
            }
            var model = (ModelImporter)AssetImporter.GetAtPath(Old + "Architecture.fbx");
            if (model.importCameras || model.importLights || model.importAnimation)
            {
                model.importCameras = false; model.importLights = false; model.importAnimation = false;
                model.animationType = ModelImporterAnimationType.None; model.importBlendShapes = false;
                model.meshCompression = ModelImporterMeshCompression.Off; model.isReadable = false;
                model.importNormals = ModelImporterNormals.Import;
                model.SaveAndReimport();
            }
        }

        static Material Surface(string name, Texture albedo, Texture occlusion, float smoothness, float metallic = 0, Color? tint = null)
        {
            var material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = name };
            material.SetColor("_BaseColor", tint ?? Color.white);
            if (albedo != null) material.SetTexture("_BaseMap", albedo);
            if (occlusion != null)
            {
                material.SetTexture("_OcclusionMap", occlusion);
                material.SetFloat("_OcclusionStrength", 1);
                material.EnableKeyword("_OCCLUSIONMAP");
            }
            material.SetFloat("_Smoothness", smoothness);
            material.SetFloat("_Metallic", metallic);
            return Save(material, Made + name + ".mat");
        }

        static Material Paper(string name, int colour, Color emission)
        {
            var material = Surface(name, null, null, 0.1f, 0, Hex(colour));
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", emission);
            material.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(material);
            return material;
        }

        static void BuildOld()
        {
            var albedo = Load<Texture2D>(Old + "Architecture_Albedo.png");
            var occlusion = Load<Texture2D>(Old + "Architecture_Occlusion.png");
            var kinds = new Dictionary<string, Material>
            {
                ["Wood"] = Surface("Wood", albedo, occlusion, 0.2f),
                ["Deck"] = Surface("Deck", albedo, occlusion, 0.3f),           // worn boards: a soft sheen, not a mirror
                ["Plaster"] = Surface("Plaster", albedo, occlusion, 0.06f),
                ["Stone"] = Surface("Stone", albedo, occlusion, 0.2f),
                ["Tile"] = Surface("Tile", albedo, occlusion, 0.5f),
                ["Metal"] = Surface("Metal", null, occlusion, 0.5f, 0.7f, Hex(0x595e70)),
                ["PaperLit"] = Paper("PaperLit", 0xf2c08c, Hdr(0xffa050, 2.4f)),
                ["PaperDim"] = Paper("PaperDim", 0xa87458, Hdr(0xd66a48, 0.5f)),
            };
            var old = (GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(Old + "Architecture.fbx"), root);
            old.name = "Old courtyard · veranda, machiya, walls, gate";
            old.transform.localPosition = new Vector3(0, 0, -Seat);
            old.transform.localRotation = Quaternion.Euler(0, 180, 0);       // Unity's importer turns Blender's +Y to -Z
            foreach (var renderer in old.GetComponentsInChildren<MeshRenderer>())
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    // Blender numbers a name it already has ("Plaster.001"): the kind is what comes before.
                    string kind = materials[i] != null ? materials[i].name.Split('.')[0] : "Wood";
                    if (!kinds.TryGetValue(kind, out var material)) throw new InvalidOperationException("No material for " + kind);
                    materials[i] = material;
                    if (kind == "PaperLit")
                        glows.Add(new KyotoCourtyard.Glow
                        {
                            renderer = renderer, slot = i, property = "_EmissionColor",
                            dusk = Hdr(0xffa050, 3.4f), night = Hdr(0xffa050, 4.2f), flicker = 0.05f,
                        });
                    if (kind == "PaperDim")
                        glows.Add(new KyotoCourtyard.Glow
                        {
                            renderer = renderer, slot = i, property = "_EmissionColor",
                            dusk = Hdr(0xd66a48, 0.8f), night = Hdr(0xd66a48, 1.1f), flicker = 0.03f,
                        });
                }
                renderer.sharedMaterials = materials;
                renderer.shadowCastingMode = ShadowCastingMode.On;
            }
        }

        // ------------------------------------------------------------- garden

        static void BuildGarden()
        {
            // The cherry tree: the pack's largest, its canopy over the whole left of the garden,
            // the lantern and the first stones of the path.
            var tree = P("Nature/Sakura_5", TreeX, TreeZ, 0.42f, 200, -0.15f);
            var blossom = Object.Instantiate(Load<Material>(Pack + "Assets/Materials/Nature/Sakura_Leaves_1.mat"));
            blossom.name = "Blossom";
            blossom.SetColor("_MainColor", Hex(0xe487a8));             // the pack's blossom is dusty; this one holds its pink in the shade
            blossom.SetColor("_Second_Color", Hex(0xffbccb));
            blossom.SetColor("_Height_Gradient_Color", Hex(0xffc6cf));
            blossom.SetColor("_UV_Gradient_Color", Hex(0xffb6aa));
            blossom.SetColor("_SSS_Color", Hex(0xff8fa2));
            Calm(blossom);
            blossom = Save(blossom, Made + "Blossom.mat");
            foreach (var renderer in tree.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                    if (materials[i] != null && materials[i].name.StartsWith("Sakura_Leaves")) materials[i] = blossom;
                renderer.sharedMaterials = materials;
            }

            // The stone lantern at its foot, and a low one where the pond ends.
            var lantern = P("Environment/StoneLantern_1_Light", -2.9f, 6.3f, 1.08f, 20, -0.03f);
            Lamp(lantern, 0xffb060, 8, 2.6f, 3.6f, 0.16f, 2.4f, 3.6f);
            Halo("stone lantern", new Vector3(-2.9f, Ground(-2.9f, 6.3f) + 1.2f, 6.3f), 3.4f, 3.4f, Hdr(0xff9a40, 0.36f), Hdr(0xff9a40, 0.7f), 0.1f);
            P("Environment/StoneLantern_2", 2.05f, 8.35f, 1.0f, -35, -0.02f);
            PointLight("Pond lantern", new Vector3(2.05f, 0.42f, 8.35f), 0xffb060, 3.6f, 1.1f, 1.6f, 0.2f);
            Halo("pond lantern", new Vector3(2.05f, 0.4f, 8.3f), 1.3f, 1.3f, Hdr(0xffa850, 0.6f), Hdr(0xffa850, 0.8f), 0.15f);

            // Stepping stones: single wide slabs, a stride apart, deck to gate.
            for (int i = 0; i < Path.Length; i++)
            {
                // Each slab about 1.35 m across the path and 0.9 m along it, thinned and set down into
                // the moss so only a few centimetres stand proud of it.
                float wide = 1.35f + 0.15f * Mathf.Sin(i * 2.3f), deep = 0.9f + 0.08f * Mathf.Cos(i * 1.7f);
                bool turned = i % 2 == 0;      // StonePath_3 (0.84 x 1.05) is longer front to back: turn it; StonePath_4 is 1.06 x 0.79
                var stone = P("Environment/StonePath_" + (turned ? 3 : 4), Path[i].x, Path[i].y, 1, 0, turned ? -0.035f : -0.06f);
                stone.transform.localRotation = Quaternion.Euler(0, (turned ? 90 : 0) + Rand(-12, 12), 0);
                stone.transform.localScale = turned ? new Vector3(deep / 0.84f, 0.7f, wide / 1.05f) : new Vector3(wide / 1.06f, 0.7f, deep / 0.79f);
            }
            var step = P("Environment/StonePath_4", -0.15f, 2.72f, 1, 4, 0.0f);     // the stone you step down onto
            step.transform.localScale = new Vector3(1.25f, 1.1f, 0.95f);

            // Rocks, mossed over, where the old boulders lay.
            Rock(4, -3.5f, 4.85f, 1.8f, 0.78f, 35);
            Rock(3, -2.35f, 4.6f, 1.2f, 0.36f, 110);
            Rock(8, -5.25f, 6.65f, 1.6f, 0.62f, 200);
            Rock(1, -2.5f, 7.2f, 0.95f, 0.3f, 60);
            Rock(7, -3.8f, 6.85f, 0.8f, 0.4f, 300);
            Rock(3, -4.65f, 4.15f, 0.95f, 0.34f, 10);
            Rock(6, -1.0f, 12.1f, 1.05f, 0.42f, 150);
            Rock(5, -5.6f, 11.8f, 1.05f, 0.5f, 80);
            Rock(4, 3.15f, 12.75f, 1.25f, 0.4f, 240);
            Rock(2, 0.55f, 13.6f, 0.9f, 0.3f, 20);
            // ...and round the pond.
            Rock(7, 1.75f, 3.45f, 1.0f, 0.36f, 30);
            Rock(1, 3.3f, 3.15f, 0.8f, 0.28f, 250);
            Rock(8, 1.55f, 6.2f, 0.85f, 0.3f, 100);
            Rock(6, 2.95f, 8.15f, 1.2f, 0.48f, 190);
            Rock(3, 1.45f, 7.75f, 0.7f, 0.22f, 330, false);
            // The bank between the pond and the machiya: stones along the footing, a rock or two
            // half in the water, and leaves growing out of the gravel.
            Rock(3, 3.52f, 4.5f, 0.62f, 0.2f, 70);
            Rock(7, 3.58f, 6.75f, 0.55f, 0.24f, 210);
            Rock(1, 3.6f, 9.3f, 0.6f, 0.18f, 130, false);
            for (int i = 0; i < 11; i++)
                P("Rocks/SmallStone_" + (i % 6 + 1), 3.66f + Rand(-0.1f, 0.06f), 2.75f + i * 0.66f + Rand(-0.15f, 0.15f), Rand(0.32f, 0.55f), Rand(0, 360), -0.03f, false);
            P("Nature/Fern_2", 3.5f, 5.55f, 0.3f, 250, 0, false);
            P("Nature/Farfugium_1", 3.52f, 7.65f, 0.48f, 300, 0, false);
            P("Nature/Grass_1", 3.6f, 3.6f, 0.55f, 40, 0, false);
            P("Nature/Grass_1", 3.62f, 6.1f, 0.5f, 170, 0, false);
            P("Nature/Grass_1_Large", 3.55f, 8.5f, 0.5f, 80, 0, false);
            P("Nature/Clovers_2", 3.5f, 3.0f, 0.7f, 10, 0, false);
            P("Nature/Fern_1", 3.45f, 6.4f, 0.26f, 100, 0, false);
            P("Nature/Grass_1", 3.5f, 4.9f, 0.5f, 300, 0, false);
            P("Nature/Clovers_1", 3.4f, 7.2f, 0.45f, 200, 0, false);
            for (int i = 0; i < 16; i++)
            {
                float angle = i / 16f * Mathf.PI * 2 + Rand(-0.12f, 0.12f);
                float x = PondX + Mathf.Cos(angle) * PondRx * 1.2f, z = PondZ + Mathf.Sin(angle) * PondRz * 1.14f;
                P("Rocks/SmallStone_" + (i % 6 + 1), x, z, Rand(0.45f, 0.8f), Rand(0, 360), -0.05f, false);
            }
            for (int i = 0; i < 9; i++)
            {
                var at = Path[random.Next(Path.Length)];
                float side = random.Next(2) == 0 ? -1 : 1;
                P("Rocks/SmallStone_" + (i % 6 + 1), at.x + side * Rand(1.05f, 1.35f), at.y + Rand(-0.6f, 0.6f), Rand(0.3f, 0.55f), Rand(0, 360), -0.04f, false);
            }

            // The pond: water, lilies, petals afloat.
            var pond = Place("Nature/Water", new Vector3(PondX, WaterLevel, PondZ), new Vector3(0.2f, 1, 0.52f), 0, false);
            var water = Object.Instantiate(Load<Material>(Pack + "Assets/Materials/Nature/Water_1.mat"));
            water.name = "Pond";
            water.SetColor("_Deep_Color", Hex(0x0b1c36));
            water.SetColor("_Shallow_Color", Hex(0x5a5c88));
            water.SetFloat("_Waves_Speed", 0.5f);
            water.SetFloat("_Normal_Strength", 0.22f);
            water.SetFloat("_Refraction_Strength", 0.06f);
            water.SetFloat("_Depth_Fade_Distance", 1.2f);
            water.SetFloat("_Foam_Distance", 0.08f);
            water = Save(water, Made + "Pond.mat");
            foreach (var renderer in pond.GetComponentsInChildren<Renderer>()) renderer.sharedMaterial = water;
            // The water and what floats on it read the camera's depth picture. The reflection camera
            // makes none (their shaders write runaway values without it), so they go on the Water
            // layer, which it leaves out (see KyotoCourtyard.Mirror).
            var afloat = new List<GameObject> { pond };
            afloat.Add(Place("Nature/WaterLily_Group_1", new Vector3(2.35f, WaterLevel + 0.01f, 4.75f), Vector3.one * 0.38f, 40, false));
            afloat.Add(Place("Nature/WaterLily_Group_3", new Vector3(2.7f, WaterLevel + 0.01f, 6.3f), Vector3.one * 0.32f, 200, false));
            afloat.Add(Place("Nature/WaterLily_Group_4", new Vector3(2.3f, WaterLevel + 0.01f, 7.1f), Vector3.one * 0.36f, 120, false));
            afloat.Add(Place("Nature/Fallen_Leaves_2", new Vector3(2.2f, WaterLevel + 0.012f, 5.6f), Vector3.one * 0.8f, 70, false));
            foreach (var thing in afloat)
                foreach (var part in thing.GetComponentsInChildren<Transform>(true)) part.gameObject.layer = 4;

            // The left of the garden is all planting, so the wall behind it hardly shows: bamboo
            // in both corners, big bushes either side of the cherry's trunk, ferns and broad leaves in front.
            foreach (var (kind, x, z, s, yaw) in new[]
                     { (2, -5.55f, 2.9f, 0.56f, 0f), (4, -5.1f, 3.9f, 0.5f, 80f), (1, -5.75f, 4.9f, 0.62f, 160f), (3, -5.3f, 5.7f, 0.46f, 240f),
                       (6, -5.6f, 3.6f, 0.4f, 30f), (1, -4.5f, 2.8f, 0.42f, 300f),
                       (2, -5.9f, 3.5f, 0.6f, 200f), (4, -5.75f, 4.3f, 0.45f, 120f), (3, -5.85f, 6.3f, 0.5f, 40f), (2, -4.9f, 5.0f, 0.4f, 280f),
                       (7, -5.7f, 5.4f, 0.36f, 150f),
                       (3, -5.5f, 13.3f, 0.52f, 20f), (2, -4.7f, 13.8f, 0.5f, 110f), (1, -5.8f, 12.1f, 0.56f, 200f), (6, -5.2f, 12.9f, 0.4f, 280f),
                       (4, -5.85f, 11.2f, 0.5f, 60f), (1, -3.9f, 13.9f, 0.46f, 330f), (7, -5.6f, 13.9f, 0.36f, 100f), (2, -5.9f, 9.9f, 0.48f, 250f) })
                P("Nature/Bamboo_" + kind, x, z, s, yaw, -0.08f);
            // Bushes stand in front of the wall wherever the bamboo lets it through.
            P("Nature/Bush_2", -5.75f, 2.95f, 0.85f, 10);
            P("Nature/Bush_4", -5.7f, 4.6f, 0.62f, 130);
            P("Nature/Bush_3", -5.5f, 6.9f, 0.9f, 40);
            P("Nature/Bush_2", -5.85f, 8.7f, 0.8f, 300);
            P("Nature/Bush_4_Flowers", -5.6f, 10.7f, 0.8f, 170);
            P("Nature/Bush_2_Flowers", -4.6f, 11.9f, 0.66f, 250);
            P("Nature/Bush_3", -5.6f, 12.7f, 0.7f, 80);
            P("Nature/Bush_1_Flowers", -4.4f, 5.5f, 0.6f, 30);
            P("Nature/Salvia_Group_1", -4.5f, 4.5f, 0.85f, 60, 0, false);
            P("Nature/Salvia_Group_1", -4.2f, 9.9f, 0.8f, 200, 0, false);
            // ...and flowering bushes along the back wall and in the far corner.
            P("Nature/Bush_3_Flowers", -3.2f, 13.5f, 0.46f, 60);
            P("Nature/Bush_1", -1.5f, 13.65f, 0.62f, 300);
            P("Nature/Bush_1_Flowers", 4.6f, 13.4f, 0.7f, 10);
            P("Nature/Bush_2_Flowers", 6.9f, 12.6f, 0.62f, 100);
            P("Nature/Bush_1", 9.0f, 13.4f, 0.8f, 200);
            P("Nature/PineTree_1", -3.7f, 11.4f, 0.2f, 70, -0.05f);      // the little garden pine
            foreach (var (x, z, s, yaw) in new[]
                     { (-2.15f, 5.4f, 0.42f, 20f), (-3.9f, 6.1f, 0.5f, 140f), (-1.8f, 7.75f, 0.36f, 250f), (-4.3f, 7.9f, 0.52f, 60f),
                       (3.45f, 9.2f, 0.45f, 300f), (-0.35f, 12.9f, 0.4f, 100f), (-3.9f, 10.3f, 0.5f, 200f), (-4.2f, 3.4f, 0.46f, 330f),
                       (-4.4f, 9.4f, 0.44f, 90f), (-3.6f, 12.6f, 0.42f, 10f) })
                P("Nature/Fern_" + (1 + (int)(Mathf.Abs(x) * 7) % 3), x, z, s, yaw, 0, false);
            P("Nature/Farfugium_2", 1.55f, 4.3f, 0.62f, 40, 0, false);
            P("Nature/Farfugium_1", 1.5f, 7.0f, 0.7f, 200, 0, false);
            P("Nature/Farfugium_3", 3.5f, 8.75f, 0.5f, 120, 0, false);
            P("Nature/Farfugium_2", -3.3f, 7.6f, 0.5f, 310, 0, false);
            P("Nature/Farfugium_3", -4.6f, 6.8f, 0.6f, 70, 0, false);
            P("Nature/Farfugium_1", -4.3f, 11.0f, 0.7f, 150, 0, false);
            P("Nature/Farfugium_2", -3.7f, 4.0f, 0.55f, 220, 0, false);
            P("Nature/Salvia_Group_1", 0.3f, 13.75f, 0.85f, 0, 0, false);
            P("Nature/Salvia_Group_1", -2.3f, 12.9f, 0.8f, 90, 0, false);
            P("Nature/Salvia_Group_1", 5.7f, 13.7f, 0.9f, 200, 0, false);
            P("Nature/Salvia_Group_1", -5.55f, 5.1f, 0.8f, 30, 0, false);
            P("Nature/Salvia_2", 3.45f, 10.6f, 0.9f, 0, 0, false);
            P("Nature/Flowers_1", -1.35f, 3.5f, 0.7f, 20, -0.3f, false);
            P("Nature/Flowers_1", 1.45f, 11.0f, 0.65f, 200, -0.3f, false);
            foreach (var (x, z, s) in new[] { (-3.4f, 8.9f, 1.3f), (-2.2f, 9.6f, 1.1f), (-3.9f, 7.2f, 1.2f), (-1.2f, 8.4f, 0.9f), (-0.2f, 6.7f, 0.8f), (0.6f, 9.5f, 0.8f),
                                              (-1.6f, 5.9f, 1.2f), (0.4f, 5.0f, 0.9f), (-2.6f, 11.2f, 1.1f), (0.7f, 8.1f, 0.8f) })
                P("Nature/Fallen_Leaves_" + (s > 1 ? 1 : 2), x, z, s, x * 97, 0.06f, false);     // petals under the tree, some on the stones

            // Tufts of grass and clover, thicker by the walls and the rocks.
            int tufts = 0;
            for (int i = 0; i < 400 && tufts < 95; i++)
            {
                float x = Rand(-5.9f, 3.75f), z = Rand(2.75f, 14.0f);
                if (PathDistance(x, z) < 1.2f || Pond(x, z) > 0.04f) continue;
                float edge = Mathf.Min(Mathf.Min(x + 6.05f, 14.3f - z), new Vector2(x - TreeX, z - TreeZ).magnitude * 0.8f);
                if (Rand(0, 1) > 0.3f + 0.7f * Mathf.Clamp01(1 - edge / 2.6f)) continue;
                int pick = random.Next(10);
                string kind = pick < 6 ? "Grass_1_Large" : pick < 8 ? "Grass_1" : "Clovers_" + (pick - 7);
                P("Nature/" + kind, x, z, Rand(0.5f, 0.85f), Rand(0, 360), 0, false);
                tufts++;
            }
        }

        static void BuildBeyond()
        {
            // Little stands beyond the walls: the painted sky and mountains are the
            // background. Only bamboo at the sides, over the left wall and behind
            // the machiya, clear of the view to the gate.
            foreach (var (kind, x, z, s) in new[] { (7, -8.4f, 3.4f, 0.85f), (5, -9.6f, 6.4f, 0.8f), (6, -8.3f, 13.6f, 0.82f), (7, -9.8f, 16.5f, 0.8f),
                                                   (6, 13.4f, 4.5f, 0.8f), (5, 13.0f, 10.5f, 0.85f) })
                P("Nature/Bamboo_" + kind, x, z, s, x * 53, -0.1f);

            // The gate is shut. A lantern hangs beside it, over the end of the path.
            var hanging = P("Environment/StreetLantern_2_Light", 0.35f, 13.5f, 0.92f, 90);
            Lamp(hanging, 0xffb060, 7.5f, 2.4f, 3.2f, 0.14f, 2.6f, 3.6f);
            Halo("gate lantern", new Vector3(1.2f, Ground(0.35f, 13.5f) + 2.2f, 13.5f), 2.6f, 2.6f, Hdr(0xffa050, 0.36f), Hdr(0xffa050, 0.7f), 0.12f);
        }

        static readonly Dictionary<Material, Material> shaded = new Dictionary<Material, Material>();

        /// The pack's props know nothing of the roof over them. Darken them to sit in its shade.
        static GameObject Shade(GameObject go, float amount)
        {
            foreach (var renderer in go.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    var source = materials[i];
                    if (source == null || !source.HasProperty("_BaseColor")) continue;
                    if (!shaded.TryGetValue(source, out var dark))
                    {
                        dark = Object.Instantiate(source);
                        dark.name = "Shaded " + source.name;
                        var colour = source.GetColor("_BaseColor") * amount; colour.a = 1;
                        dark.SetColor("_BaseColor", colour);
                        dark = Save(dark, Made + dark.name + ".mat");
                        shaded[source] = dark;
                    }
                    materials[i] = dark;
                }
                renderer.sharedMaterials = materials;
            }
            return go;
        }

        static GameObject PlaceMeadow(string prefab, Vector3 position, float size, float yaw, bool shadows = false)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(Meadow + "Prefabs/" + prefab + ".prefab"), root);
            go.transform.localPosition = position;
            go.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            go.transform.localScale = Vector3.one * size;
            if (!shadows)
                foreach (var renderer in go.GetComponentsInChildren<Renderer>(true))
                    renderer.shadowCastingMode = ShadowCastingMode.Off;
            return go;
        }

        /// From the Meadow Environment pack, besides its sky: mountains for the skyline, birds
        /// crossing it, butterflies, and a few of its meadow flowers among the moss.
        static void BuildMeadow()
        {
            // Mountains, scaled down and set a hundred metres off, so the thin mist half hides them.
            // The tallest stands between the gate and the machiya's roof, under the sun.
            PlaceMeadow("Background/Background - Autumn/P_Mountain_03_Autumn", new Vector3(32, -3, 105), 0.1f, 30);
            PlaceMeadow("Background/Background - Autumn/P_Mountain_02_Autumn", new Vector3(-12, -3, 132), 0.07f, 200);
            PlaceMeadow("Background/Background - Autumn/P_Mountain_04_Autumn", new Vector3(85, -3, 128), 0.06f, 110);

            // A flock crossing the sky from left to right, far off, while there is light.
            dayOnly.Add(PlaceMeadow("VFX/P_VFX_Bird_01", new Vector3(-105, 25, 92), 1, 0));
            dayOnly.Add(PlaceMeadow("VFX/P_VFX_Bird_01", new Vector3(-150, 40, 150), 1, 8));

            // A few of its smaller flowers in the moss: daisies, cornflowers and a purple spray, kept
            // low and sparse (its poppies are too loud for this garden).
            foreach (var (kind, x, z) in new[] { (5, -1.6f, 3.6f), (3, -1.1f, 4.3f), (5, 1.3f, 11.5f), (3, -1.3f, 11.3f), (10, -2.0f, 10.6f),
                                                 (5, 1.35f, 8.9f), (3, 3.45f, 9.9f), (10, 3.5f, 11.2f), (5, -0.9f, 6.2f), (3, 1.5f, 3.9f) })
                PlaceMeadow($"Flowers/P_Flower_{kind:00}_0{1 + random.Next(3)}", new Vector3(x + Rand(-0.1f, 0.1f), Ground(x, z) - 0.02f, z + Rand(-0.1f, 0.1f)), Rand(0.5f, 0.72f), Rand(0, 360));
            // ...with butterflies over them while the sun is up.
            dayOnly.Add(PlaceMeadow("VFX/P_VFX_Butterfly_01", new Vector3(-1.4f, 0.5f, 3.9f), 0.55f, 0));
            dayOnly.Add(PlaceMeadow("VFX/P_VFX_Butterfly_03", new Vector3(1.4f, 0.55f, 11.2f), 0.55f, 120));
        }

        static void BuildVeranda()
        {
            const float deck = 0.35f;
            shaded.Clear();
            // An andon by the right-hand post, and the makings of tea to the left.
            var andon = Place("Environment/WoodLantern_2_Light Variant", new Vector3(2.75f, deck, 1.45f), Vector3.one * 0.95f, 25);
            Lamp(andon, 0xffa860, 5, 1.5f, 2.0f, 0.1f, 2.2f, 3.0f);
            Halo("andon", new Vector3(2.7f, deck + 0.3f, 1.4f), 1.8f, 1.8f, Hdr(0xffa050, 0.2f), Hdr(0xffa050, 0.4f), 0.08f);
            Shade(Place("Environment/Table_1", new Vector3(-2.3f, deck, 0.95f), Vector3.one * 0.8f, 8), 0.5f);
            Shade(Place("Environment/Teapot_1", new Vector3(-2.38f, deck + 0.43f, 1.0f), Vector3.one * 0.8f, 200), 0.55f);
            Shade(Place("Environment/Cup_1", new Vector3(-2.05f, deck + 0.43f, 1.12f), Vector3.one * 0.9f, 0), 0.55f);
            Shade(Place("Environment/Cup_1", new Vector3(-2.2f, deck + 0.43f, 0.72f), Vector3.one * 0.9f, 90), 0.55f);
            Shade(Place("Environment/Pillow_1", new Vector3(-2.3f, deck, -0.1f), Vector3.one * 0.75f, 12), 0.5f);
            Shade(Place("Environment/Pillow_2", new Vector3(0, deck, 0.05f), Vector3.one * 0.8f, 0), 0.5f);       // the one you sit on
            Shade(Place("Environment/Pot_1", new Vector3(-4.45f, deck, 1.75f), Vector3.one * 1.0f, 40), 0.6f);
            // The room behind is lit by one low lamp, so it is a warm dark, not a black one.
            PointLight("Room lamp", B(0.4f, -0.7f, 2.3f), 0xff9a58, 9, 1.0f, 1.2f, 0.04f);
        }

        // -------------------------------------------------- light and air

        static void BuildLights(KyotoCourtyard yard)
        {
            var sunGo = new GameObject("Sun, then moon");
            sunGo.transform.SetParent(root, false);
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional; sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.9f; sun.shadowBias = 0.04f; sun.shadowNormalBias = 0.4f;
            yard.sun = sun;

            // The lit shoji spill onto the pond and the stones.
            PointLight("Window spill 1", B(2.5f, 5.5f, 1.5f), 0xffaa60, 6, 1.9f, 2.6f, 0.05f);
            PointLight("Window spill 2", B(2.5f, 7.3f, 1.5f), 0xffaa60, 6, 1.9f, 2.6f, 0.05f);
            Halo("windows", B(3.4f, 6.4f, 1.8f), 6.4f, 4, Hdr(0xff8a40, 0.09f), Hdr(0xff8a40, 0.16f), 0.04f);

            var probe = new GameObject("Reflection of the courtyard");
            probe.transform.SetParent(root, false);
            probe.transform.localPosition = new Vector3(0.9f, 1.0f, 6.6f);
            var mirror = probe.AddComponent<ReflectionProbe>();
            mirror.mode = ReflectionProbeMode.Custom;
            mirror.boxProjection = true;
            mirror.center = new Vector3(-1.15f, 3, 8.3f) - probe.transform.localPosition;
            mirror.size = new Vector3(10.2f, 6.4f, 12.2f);
            mirror.blendDistance = 1; mirror.importance = 1; mirror.hdr = false;
            mirror.enabled = false;               // until the scene has taken its first picture
            yard.mirror = mirror;
        }

        static VolumeProfile Profile(string file, Action<VolumeProfile> fill)
        {
            var fresh = ScriptableObject.CreateInstance<VolumeProfile>();
            fill(fresh);
            var saved = AssetDatabase.LoadAssetAtPath<VolumeProfile>(Made + file);
            if (saved != null)
            {
                foreach (var component in saved.components) Object.DestroyImmediate(component, true);
                saved.components.Clear();
            }
            else
            {
                saved = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(saved, Made + file);
            }
            foreach (var component in fresh.components)
            {
                component.hideFlags = HideFlags.HideInInspector | HideFlags.HideInHierarchy;
                saved.components.Add(component);
                AssetDatabase.AddObjectToAsset(component, saved);
            }
            fresh.components.Clear();
            Object.DestroyImmediate(fresh);
            EditorUtility.SetDirty(saved);
            return saved;
        }

        static void BuildAir(KyotoCourtyard yard)
        {
            // The grade, after the Meadow pack's own autumn look: filmic, the middle tones leaned
            // toward pink and the shadows toward violet, and a wide bloom that takes the sun in
            // the sky and the lamps and spreads them over the picture.
            var dusk = Profile("Grade Dusk.asset", profile =>
            {
                var bloom = profile.Add<Bloom>(true);
                bloom.intensity.Override(0.95f); bloom.threshold.Override(0.9f); bloom.scatter.Override(0.86f);
                bloom.tint.Override(new Color(1, 0.74f, 0.64f)); bloom.highQualityFiltering.Override(true);
                profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.ACES);
                var colour = profile.Add<ColorAdjustments>(true);
                colour.postExposure.Override(0.45f); colour.contrast.Override(6); colour.saturation.Override(16);
                var tones = profile.Add<ShadowsMidtonesHighlights>(true);
                tones.shadows.Override(new Vector4(0.95f, 0.82f, 1, -0.02f));
                tones.midtones.Override(new Vector4(1, 1, 1, 0.03f));
                tones.highlights.Override(new Vector4(1, 0.97f, 0.94f, 0));
                var curve = profile.Add<LiftGammaGain>(true);
                curve.lift.Override(new Vector4(1, 1, 1, 0));
                curve.gamma.Override(new Vector4(1, 0.9f, 0.95f, 0));
                curve.gain.Override(new Vector4(1, 1, 1, 0));
                var vignette = profile.Add<Vignette>(true);
                vignette.intensity.Override(0.3f); vignette.smoothness.Override(0.4f); vignette.color.Override(Hex(0x241c5c));
            });
            // ...deeper and more electric as night comes on (blended in by KyotoCourtyard).
            var night = Profile("Grade Night.asset", profile =>
            {
                var bloom = profile.Add<Bloom>(true);
                bloom.intensity.Override(2.4f); bloom.threshold.Override(0.72f); bloom.scatter.Override(0.82f);
                bloom.tint.Override(new Color(1, 0.8f, 0.9f));
                var colour = profile.Add<ColorAdjustments>(true);
                colour.postExposure.Override(1.05f); colour.contrast.Override(12); colour.saturation.Override(30);
                var tones = profile.Add<ShadowsMidtonesHighlights>(true);
                tones.shadows.Override(new Vector4(0.86f, 0.86f, 1, 0));
                tones.midtones.Override(new Vector4(1, 1, 1, 0));
                tones.highlights.Override(new Vector4(1, 0.95f, 0.92f, 0));
                var curve = profile.Add<LiftGammaGain>(true);
                curve.gamma.Override(new Vector4(1, 0.96f, 1, 0));
                var vignette = profile.Add<Vignette>(true);
                vignette.intensity.Override(0.38f); vignette.smoothness.Override(0.45f); vignette.color.Override(Hex(0x0a0620));
            });
            Volume Grade(string name, VolumeProfile profile, float priority, float weight)
            {
                var go = new GameObject(name);
                go.transform.SetParent(root, false);
                var volume = go.AddComponent<Volume>();
                volume.isGlobal = true; volume.sharedProfile = profile; volume.priority = priority; volume.weight = weight;
                return volume;
            }
            Grade("Grade · dusk", dusk, 0, 1);
            yard.nightGrade = Grade("Grade · night", night, 1, 0);

            // Petals off the tree, and a slower drift right across the garden.
            // Petals. The pack's are leaf-sized for its giant trees (its mesh is 27 cm across), so
            // they are scaled to a few centimetres. Two falls under the canopy...
            foreach (var at in new[] { new Vector3(-3.6f, 5.6f, 8.2f), new Vector3(-1.2f, 5.0f, 6.0f) })
            {
                var fall = Place("Particle Systems/CherryBlossom_Leaffall", at, Vector3.one * 0.6f, 0);
                foreach (var system in fall.GetComponentsInChildren<ParticleSystem>())
                {
                    var main = system.main;
                    main.startSize = new ParticleSystem.MinMaxCurve(0.13f, 0.21f);
                    main.startLifetime = new ParticleSystem.MinMaxCurve(6, 11);
                    main.maxParticles = 160;
                    var rate = system.emission;
                    rate.rateOverTime = 7;
                    petals.Add(system);
                }
            }
            // ...and a drift carried on the wind right across the garden, some of it close to the seat.
            var drift = Place("Particle Systems/CherryBlossom_Leaffall", new Vector3(-4.6f, 3.0f, 7.6f), Vector3.one, 0);
            drift.name = "Petals on the wind";
            foreach (var system in drift.GetComponentsInChildren<ParticleSystem>())
            {
                var main = system.main;
                main.startSize = new ParticleSystem.MinMaxCurve(0.12f, 0.2f);
                main.startLifetime = new ParticleSystem.MinMaxCurve(11, 16);
                main.gravityModifier = 0.012f;
                main.maxParticles = 120;
                var rate = system.emission;
                rate.rateOverTime = 4.5f;
                var area = system.shape;
                area.shapeType = ParticleSystemShapeType.Box;
                area.rotation = Vector3.zero;
                area.scale = new Vector3(3, 3.4f, 11);
                var velocity = system.velocityOverLifetime;
                velocity.enabled = true;
                velocity.space = ParticleSystemSimulationSpace.World;
                velocity.x = new ParticleSystem.MinMaxCurve(0.45f, 1.0f);       // with the wind (see KyotoCourtyard)
                velocity.y = new ParticleSystem.MinMaxCurve(-0.16f, 0.02f);
                velocity.z = new ParticleSystem.MinMaxCurve(-0.4f, -0.05f);
                var tumble = system.noise;
                tumble.enabled = true; tumble.strength = 0.45f; tumble.frequency = 0.22f; tumble.scrollSpeed = 0.12f;
            }
            // Shafts of sunlight over the wall and the gate, coming toward the seat: seen from
            // there they fan out from the sun.
            foreach (var (top, length, width, strength) in new[]
                     { (new Vector3(-1.0f, 4.6f, 13.6f), 10.0f, 0.9f, 0.3f), (new Vector3(0.8f, 5.0f, 13.8f), 10.5f, 0.6f, 0.26f),
                       (new Vector3(2.4f, 4.4f, 13.9f), 9.5f, 0.8f, 0.3f), (new Vector3(3.9f, 5.2f, 13.6f), 11.0f, 0.7f, 0.22f),
                       (new Vector3(-2.6f, 5.4f, 12.8f), 11.5f, 1.0f, 0.2f), (new Vector3(1.6f, 3.9f, 13.2f), 8.5f, 0.45f, 0.3f),
                       (new Vector3(5.2f, 4.7f, 13.4f), 10.0f, 0.6f, 0.2f), (new Vector3(-0.2f, 4.0f, 12.2f), 8.0f, 0.5f, 0.26f) })
                Shaft(top, length, width, strength);
            // The glare itself: a wide sheet of light that KyotoCourtyard keeps in front of the sun.
            var veil = new Material(Look.Shader("KyotoHalo")) { name = "Sun Veil" };
            veil.SetFloat("_Core", 1.5f);
            veil.enableInstancing = false;
            veil.renderQueue = GlowQueue;
            veil = Save(veil, Made + "Sun Veil.mat");
            var sheet = new GameObject("Sun veil");
            sheet.transform.SetParent(root, false);
            sheet.transform.localScale = new Vector3(8, 8, 1);
            sheet.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
            var sheetRenderer = sheet.AddComponent<MeshRenderer>();
            sheetRenderer.sharedMaterial = veil;
            sheetRenderer.shadowCastingMode = ShadowCastingMode.Off; sheetRenderer.receiveShadows = false;
            yard.sunVeil = sheetRenderer;
            yard.sunVeilColour = Hdr(0xffb89c, 0.2f);
            // Haze in layers, so the garden has depth to look into: low over the moss, before the
            // back wall, over the pond, and blossom-coloured under the tree. (The pack's mist and
            // light-shaft particles do not show in this light; these do, for almost nothing.)
            Halo("evening haze", new Vector3(0.6f, 1.3f, 12.6f), 13, 4.4f, Hdr(0xffa08c, 0.16f), Hdr(0x7a5cf0, 0.1f));
            Halo("haze over the moss", new Vector3(-1.2f, 0.6f, 9.2f), 11, 2.4f, Hdr(0xff94a0, 0.1f), Hdr(0x6a64f0, 0.08f));
            Halo("haze over the pond", new Vector3(2.7f, 0.3f, 5.9f), 4.5f, 1.3f, Hdr(0xffa878, 0.09f), Hdr(0x6a78ff, 0.08f));
            Halo("under the blossom", new Vector3(-3.0f, 2.7f, 7.4f), 8, 5, Hdr(0xff7aa0, 0.12f), Hdr(0xff6a90, 0.06f));

            // Fireflies, a few at dusk and more with the dark.
            var firefly = new Material(Look.Shader("KyotoHalo")) { name = "Firefly" };
            firefly.SetColor("_Color", new Color(1.7f, 2.0f, 0.55f, 1));     // bright enough to bloom, not to become a lamp
            firefly.SetFloat("_Core", 9);
            firefly.renderQueue = GlowQueue;
            firefly = Save(firefly, Made + "Firefly.mat");
            var go = new GameObject("Fireflies");
            go.transform.SetParent(root, false);
            go.transform.localPosition = new Vector3(-1.3f, 0.8f, 8.6f);       // out in the garden, never up against the seat
            var flies = go.AddComponent<ParticleSystem>();
            var m = flies.main;
            m.loop = true; m.prewarm = true; m.maxParticles = 80; m.simulationSpace = ParticleSystemSimulationSpace.World;
            m.startLifetime = new ParticleSystem.MinMaxCurve(5, 9);
            m.startSpeed = new ParticleSystem.MinMaxCurve(0.03f, 0.12f);
            m.startSize = new ParticleSystem.MinMaxCurve(0.04f, 0.075f);
            var emission = flies.emission;
            emission.rateOverTime = 3;
            var shape = flies.shape;
            shape.shapeType = ParticleSystemShapeType.Box; shape.scale = new Vector3(9, 1.1f, 8);
            var noise = flies.noise;
            noise.enabled = true; noise.strength = 0.12f; noise.frequency = 0.35f; noise.scrollSpeed = 0.15f; noise.damping = true;
            var fade = flies.colorOverLifetime;
            fade.enabled = true;
            var blink = new Gradient();
            blink.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 0.12f), new GradientAlphaKey(0.15f, 0.38f), new GradientAlphaKey(1, 0.55f),
                        new GradientAlphaKey(0.2f, 0.78f), new GradientAlphaKey(0.9f, 0.9f), new GradientAlphaKey(0, 1) });
            fade.color = blink;
            var draw = go.GetComponent<ParticleSystemRenderer>();
            draw.sharedMaterial = firefly; draw.renderMode = ParticleSystemRenderMode.Billboard;
            draw.shadowCastingMode = ShadowCastingMode.Off; draw.receiveShadows = false;
            yard.fireflies = flies;
            // In the sun they are motes of gold; with the dark, fireflies.
            glows.Add(new KyotoCourtyard.Glow { renderer = draw, slot = -1, property = "_Color",
                dusk = new Color(2.0f, 1.5f, 1.0f, 1), night = new Color(1.7f, 2.0f, 0.55f, 1) });
        }

        /// Deeper greens and wet stone: the pack's grass and bamboo are a midday yellow-green and
        /// its paving dry and pale, which reads flat at dusk.
        static void Enrich()
        {
            var grass = Object.Instantiate(Load<Material>(Pack + "Assets/Materials/Nature/Grass_1.mat"));
            grass.name = "Grass Deep";
            grass.SetColor("_Base_Color", Hex(0x1c4a2e));
            grass.SetColor("_Gradient_Color", Hex(0x6a9a48));
            grass.SetColor("_UV_Gradient_Color", Hex(0x1a5846));
            grass.SetColor("_World_Noise_Color", Hex(0x4f8a3c));
            grass = Save(grass, Made + "Grass Deep.mat");
            var stone = Object.Instantiate(Load<Material>(Pack + "Assets/Materials/Environment/StonePath.mat"));
            stone.name = "Stone Wet";
            stone.SetColor("_BaseColor", Hex(0x9a94b4));
            stone.SetFloat("_Smoothness", 0.78f);
            stone = Save(stone, Made + "Stone Wet.mat");
            var bamboo = Object.Instantiate(Load<Material>(Pack + "Assets/Materials/Nature/Bamboo_Leaves_1.mat"));
            bamboo.name = "Bamboo Deep";
            foreach (string colour in new[] { "_MainColor", "_Second_Color", "_Height_Gradient_Color", "_UV_Gradient_Color" })
            {
                var c = bamboo.GetColor(colour);
                bamboo.SetColor(colour, new Color(c.r * 0.6f, c.g * 0.74f, c.b * 0.78f, c.a));      // deeper, and a little toward blue
            }
            Calm(bamboo);
            bamboo = Save(bamboo, Made + "Bamboo Deep.mat");
            var calmed = new Dictionary<Material, Material>();
            foreach (var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                bool changed = false;
                for (int i = 0; i < materials.Length; i++)
                {
                    if (materials[i] == null) continue;
                    if (materials[i].name == "Grass_1") { materials[i] = grass; changed = true; }
                    else if (materials[i].name == "StonePath") { materials[i] = stone; changed = true; }
                    else if (materials[i].name == "Bamboo_Leaves_1") { materials[i] = bamboo; changed = true; }
                    else if (materials[i].shader.name.EndsWith("Tree_Foliage") && AssetDatabase.GetAssetPath(materials[i]).StartsWith(Pack))
                    {
                        // every other leaf of the pack (bushes, the pine): the same leaf, without the jitter
                        if (!calmed.TryGetValue(materials[i], out var calm))
                        {
                            calm = Object.Instantiate(materials[i]);
                            calm.name = "Calm " + materials[i].name;
                            Calm(calm);
                            calm = Save(calm, Made + calm.name + ".mat");
                            calmed[materials[i]] = calm;
                        }
                        materials[i] = calm; changed = true;
                    }
                    else if (materials[i].HasProperty("_Wind_Force_Multiplier") && materials[i].GetFloat("_Wind_Force_Multiplier") > MostBend
                             && AssetDatabase.GetAssetPath(materials[i]).StartsWith(Pack))
                    {
                        // the branches under those leaves must bend exactly as far as they do
                        if (!calmed.TryGetValue(materials[i], out var calm))
                        {
                            calm = Object.Instantiate(materials[i]);
                            calm.name = "Calm " + materials[i].name;
                            calm.SetFloat("_Wind_Force_Multiplier", MostBend);
                            calm = Save(calm, Made + calm.name + ".mat");
                            calmed[materials[i]] = calm;
                        }
                        materials[i] = calm; changed = true;
                    }
                }
                if (changed) renderer.sharedMaterials = materials;
            }
        }

        /// The pack's leaves shiver quickly in place (a shake at 5 to 10 a second and a wobble of
        /// the leaf texture), which reads as a nervous back-and-forth. Slow both right down and
        /// leave the motion to the wind itself, which KyotoCourtyard lets swell and fall.
        /// The wind here is stronger than the pack's bushes were made for (they bend three times
        /// as far as a tree): nothing bends more than this multiple.
        const float MostBend = 1.6f;

        static void Calm(Material leaves)
        {
            leaves.SetFloat("_Vertex_Shake", 0.85f);
            leaves.SetFloat("_Vertex_Shake_Speed", 1.6f);
            leaves.SetFloat("_UV_Shake_Speed", 1.7f);
            leaves.SetFloat("_UV_Shake_Force", Mathf.Min(leaves.GetFloat("_UV_Shake_Force"), 0.12f));
            leaves.SetFloat("_Wind_Force_Multiplier", Mathf.Min(leaves.GetFloat("_Wind_Force_Multiplier"), MostBend));
        }

        /// Kyoto v2's own renderer, second in the shared pipeline's list: the garden's, plus
        /// contact shadows (URP's screen-space ambient occlusion). Returns its place in the list.
        static int BuildRenderer(UniversalRenderPipelineAsset pipeline)
        {
            const string path = Made + "Renderer.asset";
            var data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(path);
            if (data == null)
            {
                data = Object.Instantiate(Load<UniversalRendererData>("Assets/Resources/Komorebi/Renderer.asset"));
                data.name = "Kyoto v2 Renderer";
                AssetDatabase.CreateAsset(data, path);
            }
            ScreenSpaceAmbientOcclusion shade = null;
            foreach (var feature in data.rendererFeatures)
                if (feature is ScreenSpaceAmbientOcclusion found) shade = found;
            if (shade == null)
            {
                shade = ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();
                shade.name = "Contact shadows";
                AssetDatabase.AddObjectToAsset(shade, data);
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(shade, out _, out long id);
                var list = new SerializedObject(data);
                var features = list.FindProperty("m_RendererFeatures");
                var map = list.FindProperty("m_RendererFeatureMap");
                features.arraySize++; features.GetArrayElementAtIndex(features.arraySize - 1).objectReferenceValue = shade;
                map.arraySize++; map.GetArrayElementAtIndex(map.arraySize - 1).longValue = id;
                list.ApplyModifiedPropertiesWithoutUndo();
            }
            var settings = new SerializedObject(shade);
            settings.FindProperty("m_Settings.Intensity").floatValue = 1.5f;
            settings.FindProperty("m_Settings.Radius").floatValue = 0.55f;
            settings.FindProperty("m_Settings.Falloff").floatValue = 60;
            settings.FindProperty("m_Settings.DirectLightingStrength").floatValue = 0.35f;
            settings.FindProperty("m_Settings.Downsample").boolValue = true;
            settings.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(shade); EditorUtility.SetDirty(data);

            var asset = new SerializedObject(pipeline);
            var renderers = asset.FindProperty("m_RendererDataList");
            for (int i = 0; i < renderers.arraySize; i++)
                if (renderers.GetArrayElementAtIndex(i).objectReferenceValue == data) return i;
            renderers.arraySize++;
            renderers.GetArrayElementAtIndex(renderers.arraySize - 1).objectReferenceValue = data;
            asset.ApplyModifiedPropertiesWithoutUndo();
            return renderers.arraySize - 1;
        }

        // -------------------------------------------------------------- build

        [MenuItem("Inbox Zero/Kyoto v2/Rebuild Courtyard")]
        public static void Build()
        {
            Directory.CreateDirectory(Made); Directory.CreateDirectory(Out);
            AssetDatabase.Refresh();
            ImportOld();
            random = new System.Random(2718);
            lamps.Clear(); glows.Clear(); petals.Clear(); dayOnly.Clear();

            // Kyoto v2 has more lamps than the garden: let a surface take light from eight of them.
            var pipeline = Load<UniversalRenderPipelineAsset>("Assets/Resources/Komorebi/RenderPipeline.asset");
            var limits = new SerializedObject(pipeline);
            limits.FindProperty("m_AdditionalLightsPerObjectLimit").intValue = 8;
            limits.ApplyModifiedPropertiesWithoutUndo();

            var halo = new Material(Look.Shader("KyotoHalo")) { name = "Halo" };
            halo.SetFloat("_Core", 2.6f);
            halo.enableInstancing = false;
            halo.renderQueue = GlowQueue;
            haloMaterial = Save(halo, Made + "Halo.mat");
            var shaft = new Material(Look.Shader("KyotoHalo")) { name = "Shaft" };
            shaft.SetFloat("_Core", 2.2f);
            shaft.enableInstancing = false;
            shaft.renderQueue = GlowQueue;
            shaftMaterial = Save(shaft, Made + "Shaft.mat");
            // The sky is the Meadow pack's sunset panorama (see KyotoDuskSky.shader).
            var skyMaterial = new Material(Look.Shader("KyotoDuskSky")) { name = "Sky" };
            skyMaterial.SetTexture("_Sky", Load<Texture>(Meadow + "Sources/Textures/Skybox/T_Skybox_Summer_01.HDR"));
            skyMaterial = Save(skyMaterial, Made + "Sky.mat");

            var scene = EditorSceneManager.NewPreviewScene();
            var courtyard = new GameObject("Kyoto · courtyard v2");
            UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(courtyard, scene);
            root = courtyard.transform;
            try
            {
                var yard = courtyard.AddComponent<KyotoCourtyard>();
                yard.enabled = false;             // nothing takes over the editor's renderer while it is being built
                yard.pipeline = pipeline;
                yard.rendererIndex = BuildRenderer(pipeline);
                // A round runs from just after sundown to blue hour: darker than the sun-in-view
                // start of the day, never as dark as night. (0 and 1 are those two ends.)
                yard.startAt = 0.28f; yard.endAt = 0.5f;
                yard.skySource = skyMaterial;
                BuildGround();
                BuildOld();
                BuildGarden();
                BuildBeyond();
                BuildVeranda();
                BuildMeadow();
                Enrich();
                BuildLights(yard);
                BuildAir(yard);
                yard.lamps = lamps.ToArray();
                yard.glows = glows.ToArray();
                yard.petals = petals.ToArray();
                yard.dayOnly = dayOnly.ToArray();
                yard.enabled = true;
                PrefabUtility.SaveAsPrefabAsset(courtyard, Out + "Courtyard.prefab");
                Debug.Log($"[Kyoto v2] Built the courtyard: {lamps.Count} lamps, {glows.Count} glows, {courtyard.GetComponentsInChildren<Renderer>(true).Length} renderers.");
            }
            finally
            {
                Object.DestroyImmediate(courtyard);
                EditorSceneManager.ClosePreviewScene(scene);
            }
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        // ------------------------------------------------------------- review

        static readonly (string name, float night, float yaw, float pitch, float field)[] Shots =
        {
            ("dusk", 0, 0, 0, 56), ("dusk-wide", 0, 0, 4, 96), ("dusk-left", 0, -42, 0, 56), ("dusk-right", 0, 42, 2, 56),
            ("dusk-up", 0, -20, -38, 70), ("dusk-pond", 0, 30, 20, 50), ("blue-hour", 0.5f, 0, 0, 56), ("sinking", 0.3f, 0, 0, 56),
            ("round-start", 0.28f, 0, 0, 56), ("round-start-wide", 0.28f, 0, 4, 96), ("round-end", 0.5f, 0, 0, 56),
            ("night", 1, 0, 0, 56), ("night-wide", 1, 0, 4, 96), ("night-left", 1, -42, 0, 56), ("night-right", 1, 42, 2, 56),
            ("night-behind", 1, 180, 0, 80),
        };

        /// Render the built prefab from the seat, at dusk and at night, to Checks/v2-review.
        [MenuItem("Inbox Zero/Kyoto v2/Capture Review")]
        public static void Review()
        {
            bool async = ShaderUtil.allowAsyncCompilation;
            ShaderUtil.allowAsyncCompilation = false;
            Directory.CreateDirectory("Checks/v2-review");
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var go = Object.Instantiate(Resources.Load<GameObject>("KyotoV2/Courtyard"));
            var yard = go.GetComponent<KyotoCourtyard>();
            yard.Activate();
            var camera = new GameObject("Review camera").AddComponent<Camera>();
            camera.transform.position = new Vector3(0, Eye, 0);
            camera.nearClipPlane = 0.05f; camera.enabled = false;
            yard.ConfigureCamera(camera);
            foreach (var system in go.GetComponentsInChildren<ParticleSystem>()) system.Simulate(8, true, true, true);
            var target = new RenderTexture(1600, 900, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var image = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
            camera.aspect = target.width / (float)target.height;
            foreach (var shot in Shots)
            {
                for (int i = 0; i < 8; i++) yard.StepAt(0.1f, shot.night);      // let the lamps and the reflection settle
                camera.transform.rotation = Quaternion.Euler(shot.pitch, shot.yaw, 0);
                camera.fieldOfView = shot.field;
                for (int pass = 0; pass < 2; pass++)
                    RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                RenderTexture.active = target;
                image.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
                image.Apply();
                RenderTexture.active = null;
                File.WriteAllBytes($"Checks/v2-review/{shot.name}.png", image.EncodeToPNG());
            }

            long triangles = 0;
            foreach (var filter in go.GetComponentsInChildren<MeshFilter>(true))
            {
                var mesh = filter.sharedMesh;
                if (mesh == null || (filter.name.Contains("_LOD") && !filter.name.Contains("_LOD0"))) continue;
                for (int i = 0; i < mesh.subMeshCount; i++) triangles += (long)mesh.GetIndexCount(i) / 3;
            }
            File.WriteAllText("Checks/v2-review/report.txt",
                $"{DateTime.Now:s}\n{go.GetComponentsInChildren<Renderer>(true).Length} renderers, {triangles:N0} triangles at the nearest level of detail (terrain not counted).\n" +
                $"{go.GetComponentsInChildren<Light>(true).Length} lights, {go.GetComponentsInChildren<ParticleSystem>(true).Length} particle systems.\n");
            Object.DestroyImmediate(image);
            target.Release(); Object.DestroyImmediate(target);
            Object.DestroyImmediate(go);
            Object.DestroyImmediate(camera.gameObject);
            ShaderUtil.allowAsyncCompilation = async;
            Debug.Log("[Kyoto v2] Review captured.");
        }

        /// Six seconds from the seat at dusk, as frames in Checks/v2-motion: for judging the wind,
        /// the petals and the shafts of light, which a still cannot show.
        [MenuItem("Inbox Zero/Kyoto v2/Capture Motion")]
        public static void Motion()
        {
            bool async = ShaderUtil.allowAsyncCompilation;
            ShaderUtil.allowAsyncCompilation = false;
            if (Directory.Exists("Checks/v2-motion")) Directory.Delete("Checks/v2-motion", true);
            Directory.CreateDirectory("Checks/v2-motion");
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var go = Object.Instantiate(Resources.Load<GameObject>("KyotoV2/Courtyard"));
            var yard = go.GetComponent<KyotoCourtyard>();
            yard.Activate();
            var camera = new GameObject("Motion camera").AddComponent<Camera>();
            camera.transform.position = new Vector3(0, Eye, 0);
            camera.transform.rotation = Quaternion.Euler(-4, -12, 0);
            camera.nearClipPlane = 0.05f; camera.enabled = false; camera.fieldOfView = 60;
            yard.ConfigureCamera(camera);
            var systems = go.GetComponentsInChildren<ParticleSystem>();
            foreach (var system in systems) system.Simulate(14, false, true, true);
            var target = new RenderTexture(960, 540, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            var image = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
            camera.aspect = target.width / (float)target.height;
            const float step = 1 / 12f;
            var clock = System.Diagnostics.Stopwatch.StartNew();
            for (int frame = 0; frame < 72; frame++)
            {
                // the pack's wind runs on the shader clock, which follows real time in the editor
                while (clock.Elapsed.TotalSeconds < frame * step) System.Threading.Thread.Sleep(2);
                yard.Step(step, 0);                                              // as a round begins
                foreach (var system in systems) system.Simulate(step, false, false, true);
                RenderPipeline.SubmitRenderRequest(camera, new UniversalRenderPipeline.SingleCameraRequest { destination = target });
                RenderTexture.active = target;
                image.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
                image.Apply();
                RenderTexture.active = null;
                File.WriteAllBytes($"Checks/v2-motion/{frame:000}.png", image.EncodeToPNG());
            }
            Object.DestroyImmediate(image);
            target.Release(); Object.DestroyImmediate(target);
            Object.DestroyImmediate(go);
            Object.DestroyImmediate(camera.gameObject);
            ShaderUtil.allowAsyncCompilation = async;
            Debug.Log("[Kyoto v2] Motion captured.");
        }

        /// For a terminal: Unity -batchmode -projectPath . -executeMethod InboxZero.EditorTools.KyotoCourtyardBuilder.BuildAndReview -quit
        public static void BuildAndReview()
        {
            Build();
            Review();
            Motion();
        }
    }
}
