using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace InboxZero
{
    /// A Kyoto scene around the shared seated game: the prefab a level names
    /// (the Komorebi garden, or the v2 courtyard), driven through IKyotoScene.
    public class KyotoWorld : IWorld
    {
        public const float EyeInScene = 1.55f;
        readonly GameObject root;
        readonly IKyotoScene garden;
        bool underway;
        float time;
        public float Night { get; private set; }
        public float? NightOverride;
        public float DesktopFieldOfView => garden.DesktopFieldOfView;
        /// What the dev view calls the two ends of this scene's fade.
        public string EarlyName => garden.EarlyName;
        public string LateName => garden.LateName;
        public const string Garden = "Komorebi/Garden";
        public KyotoWorld(Transform parent, float eyeHeight, string scene = Garden)
        {
            var prefab=Resources.Load<GameObject>(scene);
            if(prefab==null)throw new System.InvalidOperationException("Build the Kyoto scene first: Inbox Zero > Komorebi > Rebuild Garden, or Inbox Zero > Kyoto v2 > Rebuild Courtyard ("+scene+").");
            root=Object.Instantiate(prefab,parent); root.name="Kyoto";
            root.transform.localPosition=new Vector3(0,eyeHeight-EyeInScene,0);
            garden=root.GetComponent<IKyotoScene>();
            var marker=new GameObject("Courtyard"); marker.transform.SetParent(root.transform,false);
        }
        public void ConfigureCamera(Camera camera) => garden.ConfigureCamera(camera);
        public void Show(bool on) { root.SetActive(on); if(on)garden.Activate(); }
        public void Round(bool on) { underway=on; if(!on && !NightOverride.HasValue)time=0; }
        public void Kick(float strength) { garden.Stir(strength,2); }
        public void Flash(Color tint) { }
        public void Wish(int count=1) { garden.Stir(0.5f,count*3); }
        public void Step(float dt,float targetSpeed,float beat,float energy)
        {
            if(underway)time+=dt;
            Night=NightOverride ?? Mathf.Clamp01((time-6)/70f);
            garden.Step(dt,Night);
        }

        /// The katana from Blender, dressed and sized for the hand: handle along
        /// +Y with the origin mid-grip, like the saber. The blade is a little
        /// shorter than modelled so its reach matches the game's hit samples.
        public static Transform Katana(Transform parent, string path, int queue)
        {
            var prefab = Resources.Load<GameObject>(path);
            if (prefab == null) return null;
            var weapon = new GameObject("Katana").transform;
            weapon.SetParent(parent, false);
            var model = Object.Instantiate(prefab, weapon);
            model.name = "Model";
            model.transform.localScale *= InboxGame.SwordBladeEnd / 0.86f;

            Material Part(Material material)
            {
                material.renderQueue = queue;
                return material;
            }
            // Painted steel: flat tones, a little lighter along the cutting bevel.
            var steel = Part(new Material(Shader.Find("Universal Render Pipeline/Lit")));
            steel.color = new Color(0.66f,0.69f,0.74f); steel.SetFloat("_Metallic",0.85f); steel.SetFloat("_Smoothness",0.75f);
            var bevel = Part(new Material(steel));
            bevel.color = new Color(1.16f, 1.15f, 1.18f);
            // The fittings are lit by the scene around the seat (see KyotoProp).
            Material Fitting(int colour, float metal)
            {
                var material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = Look.Hex(colour) };
                material.SetFloat("_Metallic", metal);
                material.SetFloat("_Smoothness", 0.35f);
                return Part(material);
            }
            var iron = Fitting(0x59452f, 0.15f);
            var brass = Fitting(0x94703c, 0.25f);
            var wrap = Fitting(0x1c1b28, 0.05f);
            var cream = Fitting(0xe2d2a4, 0);
            var red = Fitting(0x9d3424, 0.05f);
            foreach (var renderer in model.GetComponentsInChildren<MeshRenderer>())
            {
                renderer.shadowCastingMode = ShadowCastingMode.Off;
                renderer.receiveShadows = false;
                string part = renderer.name;
                if (part.Contains("Blade")) renderer.sharedMaterials = new[] { steel, bevel };
                else if (part.Contains("Collar")) renderer.sharedMaterial = brass;
                else if (part.Contains("Diamonds")) renderer.sharedMaterial = cream;
                else if (part.Contains("Accent")) renderer.sharedMaterial = red;
                else if (part.Contains("Grip")) renderer.sharedMaterial = wrap;
                else renderer.sharedMaterial = iron;
            }
            return weapon;
        }

        /// The paper letter as a card mesh: the same size and upright UVs as the
        /// card quad, turned so its readable face looks back at the seat (-Z).
        public static Mesh Letter()
        {
            var prefab = Resources.Load<GameObject>("Kyoto/Letter");
            if (prefab == null) return null;
            Mesh source = null;
            Transform node = null;
            var skinned = prefab.GetComponentInChildren<SkinnedMeshRenderer>();
            if (skinned != null) { source = skinned.sharedMesh; node = skinned.transform; }
            else
            {
                var filter = prefab.GetComponentInChildren<MeshFilter>();
                if (filter != null) { source = filter.sharedMesh; node = filter.transform; }
            }
            if (source == null || !source.isReadable) return null;

            // Out of the model's own space, then half a turn about the vertical.
            var turn = Matrix4x4.Rotate(Quaternion.Euler(0, 180, 0)) * prefab.transform.worldToLocalMatrix * node.localToWorldMatrix;
            var vertices = source.vertices;
            var sourceNormals = source.normals;
            for (int i = 0; i < vertices.Length; i++)
            {
                vertices[i] = turn.MultiplyPoint3x4(vertices[i]);
                if (i < sourceNormals.Length) sourceNormals[i] = turn.MultiplyVector(sourceNormals[i]).normalized;
            }
            var mesh = new Mesh { name = "Letter" };
            mesh.vertices = vertices;
            mesh.normals = sourceNormals;
            mesh.uv = source.uv;
            mesh.triangles = source.triangles;
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
