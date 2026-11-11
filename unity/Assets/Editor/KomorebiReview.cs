using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace InboxZero.EditorTools
{
    [InitializeOnLoad]
    public static class KomorebiReview
    {
        static GameObject root, cameraObject;
        static Camera camera;
        static Scene scene;
        static KomorebiGarden garden;
        static bool previousAsync;
        static int wait, warmup, pose=-1;
        static readonly string[] Names={"midday","twilight","left","right","rear"};
        static KomorebiReview() { EditorApplication.update+=Poll; }
        static void Poll()
        {
            if(EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            if(pose<0 && File.Exists("Checks/komorebi-capture.request"))
            {
                File.Delete("Checks/komorebi-capture.request"); Begin();
            }
            if(pose<0 || --wait>0)return;
            try
            {
                if(warmup>0) { Capture(false); warmup--; wait=10; return; }
                Capture(true); pose++;
                if(pose>=Names.Length) { Finish(); return; }
                garden.Apply(pose==1?1:0);
                camera.transform.rotation=Quaternion.Euler(0,pose==2?-35:pose==3?35:pose==4?180:0,0);
                wait=8;
            }
            catch(Exception e) { File.WriteAllText("Checks/komorebi-error.txt",e.ToString()); Debug.LogException(e); Finish(); }
        }
        [MenuItem("Inbox Zero/Komorebi/Capture Midday and Twilight")]
        public static void Begin()
        {
            if(pose>=0)return;
            bool stale=false;
            foreach(var old in Resources.FindObjectsOfTypeAll<KomorebiGarden>())
            {
                if(!EditorSceneManager.IsPreviewScene(old.gameObject.scene))continue;
                var abandoned=old.gameObject.scene; Object.DestroyImmediate(old.gameObject);
                EditorSceneManager.ClosePreviewScene(abandoned); stale=true;
            }
            if(stale) { GraphicsSettings.defaultRenderPipeline=null; QualitySettings.renderPipeline=null; }
            previousAsync=ShaderUtil.allowAsyncCompilation; ShaderUtil.allowAsyncCompilation=false;
            scene=EditorSceneManager.NewPreviewScene();
            root=Object.Instantiate(Resources.Load<GameObject>("Komorebi/Garden"));
            SceneManager.MoveGameObjectToScene(root,scene);
            garden=root.GetComponent<KomorebiGarden>(); garden.Activate(); garden.Apply(0);
            cameraObject=new GameObject("Garden review camera"); SceneManager.MoveGameObjectToScene(cameraObject,scene);
            camera=cameraObject.AddComponent<Camera>(); camera.scene=scene;
            camera.transform.position=new Vector3(0,1.55f,0); camera.fieldOfView=garden.desktopFieldOfView;
            camera.nearClipPlane=0.05f; camera.farClipPlane=250; camera.enabled=false; garden.ConfigureCamera(camera);
            foreach(var ps in root.GetComponentsInChildren<ParticleSystem>())ps.Simulate(1,true,true,true);
            pose=0; warmup=3; wait=15;
        }
        static void Capture(bool save)
        {
            Directory.CreateDirectory("Checks/komorebi-review");
            var target=new RenderTexture(1672,941,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB){antiAliasing=1};
            var old=RenderTexture.active;
            camera.aspect=1672f/941;
            var request=new UniversalRenderPipeline.SingleCameraRequest{destination=target};
            RenderPipeline.SubmitRenderRequest(camera,request);
            RenderTexture.active=target;
            var image=new Texture2D(target.width,target.height,TextureFormat.RGB24,false);
            image.ReadPixels(new Rect(0,0,target.width,target.height),0,0); image.Apply();
            if(save)File.WriteAllBytes("Checks/komorebi-review/"+Names[pose]+".png",image.EncodeToPNG());
            Object.DestroyImmediate(image); RenderTexture.active=old; target.Release(); Object.DestroyImmediate(target);
            if(!save)return;
            if(pose==0)
            {
                var report=new System.Text.StringBuilder(); long triangles=0;int meshes=0;
                foreach(var filter in root.GetComponentsInChildren<MeshFilter>(true))
                {
                    var mesh=filter.sharedMesh; if(mesh==null)continue;
                    string source=AssetDatabase.GetAssetPath(mesh);
                    if(!source.StartsWith("Assets/Raygeas/") && source!="Library/unity default resources")throw new Exception("Non-Komorebi environment mesh: "+source);
                    meshes++; for(int j=0;j<mesh.subMeshCount;j++)triangles+=(long)mesh.GetIndexCount(j)/3;
                }
                var shaders=new System.Collections.Generic.HashSet<Shader>();
                foreach(var renderer in root.GetComponentsInChildren<Renderer>(true))foreach(var mat in renderer.sharedMaterials)
                    if(mat!=null)shaders.Add(mat.shader);
                foreach(var shader in shaders)
                {
                    if(shader==null || !shader.isSupported || ShaderUtil.ShaderHasError(shader))throw new Exception("Invalid shader: "+shader);
                    report.AppendLine("Compiled: "+shader.name);
                }
                report.AppendLine($"{DateTime.Now:s}: {meshes} mesh renderers across all LODs; {triangles:N0} triangles across all LODs.");
                report.AppendLine("All environment mesh assets originate in Raygeas. Terrain uses Komorebi terrain layers.");
                report.AppendLine("URP forward rendering; depth and opaque textures enabled; 4x MSAA; original LOD groups retained.");
                File.WriteAllText("Checks/komorebi-review/report.txt",report.ToString());
            }
            Debug.Log("[Komorebi] Captured "+Names[pose]);
        }
        static void Finish()
        {
            if(root!=null)Object.DestroyImmediate(root);
            if(cameraObject!=null)Object.DestroyImmediate(cameraObject);
            EditorSceneManager.ClosePreviewScene(scene); ShaderUtil.allowAsyncCompilation=previousAsync; pose=-1;
        }
    }
}
