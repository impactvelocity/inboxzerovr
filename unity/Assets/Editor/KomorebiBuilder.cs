using System;
using System.IO;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace InboxZero.EditorTools
{
    [InitializeOnLoad]
    public static class KomorebiBuilder
    {
        const string Pack = "Assets/Raygeas/Komorebi Nature/";
        const string Out = "Assets/Resources/Komorebi/";
        static Transform root;
        static readonly List<Light> lanterns = new List<Light>();
        static readonly List<string> sources = new List<string>();
        static KomorebiBuilder() { EditorApplication.update += Poll; }
        static void Poll()
        {
            const string request="Checks/komorebi-build.request";
            if (!File.Exists(request) || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            if (EditorApplication.isPlaying) { EditorApplication.isPlaying=false; return; }
            File.Delete(request);
            try { Build(); } catch(Exception e) { File.WriteAllText("Checks/komorebi-error.txt",e.ToString()); Debug.LogException(e); }
        }
        static T Load<T>(string path) where T:Object
        {
            var value=AssetDatabase.LoadAssetAtPath<T>(path);
            if(value==null)throw new InvalidOperationException("Missing package asset: "+path);
            return value;
        }
        static GameObject Place(string category,string name,Vector3 position,Vector3 scale,float yaw=0)
        {
            string path=Pack+"Assets/Prefabs/"+category+"/"+name+".prefab";
            var go=(GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(path),root);
            go.transform.localPosition=position; go.transform.localRotation=Quaternion.Euler(0,yaw,0); go.transform.localScale=scale;
            sources.Add(path);
            foreach(var light in go.GetComponentsInChildren<Light>(true)) { light.color=new Color(1,0.55f,0.24f); light.range=4; light.shadows=LightShadows.None; lanterns.Add(light); }
            return go;
        }
        static GameObject P(string category,string name,float x,float y,float z,float size=1,float yaw=0) => Place(category,name,new Vector3(x,y,z),Vector3.one*size,yaw);
        static T Save<T>(T asset,string name) where T:Object
        {
            string path=Out+name;
            var old=AssetDatabase.LoadAssetAtPath<T>(path);
            if(old!=null) { EditorUtility.CopySerialized(asset,old); Object.DestroyImmediate(asset); return old; }
            AssetDatabase.CreateAsset(asset,path); return asset;
        }
        static void RegisterPipelineForBuild(UniversalRenderPipelineAsset pipeline)
        {
            // Include URP shader variants without changing the Retro level's default renderer.
            var settings=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset")[0]);
            var levels=settings.FindProperty("m_QualitySettings"); int index=-1;
            for(int i=0;i<levels.arraySize;i++)
                if(levels.GetArrayElementAtIndex(i).FindPropertyRelative("name").stringValue=="Komorebi")index=i;
            if(index<0) { index=levels.arraySize; levels.InsertArrayElementAtIndex(index); }
            var level=levels.GetArrayElementAtIndex(index);
            level.FindPropertyRelative("name").stringValue="Komorebi";
            level.FindPropertyRelative("customRenderPipeline").objectReferenceValue=pipeline;
            level.FindPropertyRelative("excludedTargetPlatforms").ClearArray();
            settings.ApplyModifiedPropertiesWithoutUndo();
        }
        static void SaveGardenScene()
        {
            var original=UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
            UnityEngine.SceneManagement.SceneManager.SetActiveScene(scene);
            var instance=(GameObject)PrefabUtility.InstantiatePrefab(Load<GameObject>(Out+"Garden.prefab"),scene);
            var camera=new GameObject("Garden Camera").AddComponent<Camera>();
            camera.tag="MainCamera"; camera.transform.position=new Vector3(0,1.55f,0);
            camera.fieldOfView=48; camera.nearClipPlane=0.05f;
            instance.GetComponent<KomorebiGarden>().ConfigureCamera(camera);
            camera.gameObject.AddComponent<AudioListener>();
            EditorSceneManager.SaveScene(scene,"Assets/Scenes/KyotoGarden.unity");
            EditorSceneManager.CloseScene(scene,true);
            UnityEngine.SceneManagement.SceneManager.SetActiveScene(original);
        }
        static float Ground(float x,float z)
        {
            float baseY=0.08f*Mathf.PerlinNoise(x*0.16f+20,z*0.16f+40);
            float pond=Mathf.Exp(-Mathf.Pow((x-5.7f)/3.4f,4)-Mathf.Pow((z-7.0f)/5.7f,4));
            float hill=Mathf.Max(0,z-21)*0.09f + Mathf.Max(0,Mathf.Abs(x)-10)*0.08f;
            return baseY - pond*1.15f + hill;
        }
        static void Terrain()
        {
            var data=AssetDatabase.LoadAssetAtPath<TerrainData>(Out+"GardenTerrain.asset");
            if(data==null) { data=new TerrainData(); AssetDatabase.CreateAsset(data,Out+"GardenTerrain.asset"); }
            data.name="GardenTerrain"; data.heightmapResolution=257; data.alphamapResolution=256;
            data.baseMapResolution=512; data.size=new Vector3(64,12,72);
            var heights=new float[257,257];
            for(int z=0;z<257;z++)for(int x=0;x<257;x++)heights[z,x]=(Ground(x/256f*64-32,z/256f*72-15)+3)/12;
            data.SetHeights(0,0,heights);
            data.terrainLayers=new[]{Load<TerrainLayer>(Pack+"Assets/Terrain Layers/Grass_1.terrainlayer"),Load<TerrainLayer>(Pack+"Assets/Terrain Layers/Ground_1.terrainlayer"),Load<TerrainLayer>(Pack+"Assets/Terrain Layers/Stones_1.terrainlayer")};
            var splat=new float[256,256,3];
            for(int z=0;z<256;z++)for(int x=0;x<256;x++)
            {
                float px=x/255f*64-32,pz=z/255f*72-15;
                float pathX=0.7f*Mathf.Sin(pz*0.25f);
                float dirt=(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(0.9f,2.1f,Mathf.Abs(px-pathX))))*Mathf.SmoothStep(0,1,Mathf.InverseLerp(0,3,pz));
                float pond=1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(-0.65f,-0.05f,Ground(px,pz)));
                dirt=Mathf.Max(dirt,pond*0.8f);
                splat[z,x,0]=1-dirt; splat[z,x,1]=dirt*(1-pond*0.5f); splat[z,x,2]=dirt*pond*0.5f;
            }
            data.SetAlphamaps(0,0,splat); EditorUtility.SetDirty(data);
            var go=UnityEngine.Terrain.CreateTerrainGameObject(data); go.name="Garden ground · Komorebi terrain layers";
            go.transform.SetParent(root,false); go.transform.localPosition=new Vector3(-32,-3,-15);
            var terrain=go.GetComponent<UnityEngine.Terrain>(); terrain.drawInstanced=true; terrain.heightmapPixelError=5;
            terrain.materialTemplate=Load<Material>(Pack+"Demo/KomorebiNature_Demo/Terrain.mat");
        }
        [MenuItem("Inbox Zero/Komorebi/Rebuild Garden")]
        public static void Build()
        {
            Directory.CreateDirectory(Out); Directory.CreateDirectory("Checks/komorebi-review");
            AssetDatabase.Refresh();
            // A forward renderer keeps MSAA and single-pass stereo available.
            var renderer=ScriptableObject.CreateInstance<UniversalRendererData>();
            renderer.name="Komorebi Forward Renderer";
            var rendererAsset=Save(renderer,"Renderer.asset");
            var pipeline=Object.Instantiate(Load<UniversalRenderPipelineAsset>(Pack+"Demo/Settings/KomorebiNature_URP_Asset.asset"));
            pipeline.name="Komorebi Garden URP";
            var serialized=new SerializedObject(pipeline);
            serialized.FindProperty("m_RendererDataList").GetArrayElementAtIndex(0).objectReferenceValue=rendererAsset;
            serialized.FindProperty("m_MainLightShadowmapResolution").intValue=2048;
            serialized.FindProperty("m_AdditionalLightShadowsSupported").boolValue=false;
            serialized.FindProperty("m_AdditionalLightsPerObjectLimit").intValue=8; // shared with Kyoto v2, which has more lamps
            serialized.ApplyModifiedPropertiesWithoutUndo();
            pipeline.msaaSampleCount=4; pipeline.shadowDistance=60; pipeline.shadowCascadeCount=2;
            pipeline.supportsCameraDepthTexture=true; pipeline.supportsCameraOpaqueTexture=true;
            pipeline=Save(pipeline,"RenderPipeline.asset");
            RegisterPipelineForBuild(pipeline);
            var profile=ScriptableObject.CreateInstance<VolumeProfile>(); profile.name="Garden atmosphere";
            var bloom=profile.Add<Bloom>(true); bloom.intensity.Override(0.28f); bloom.threshold.Override(1.05f); bloom.scatter.Override(0.65f);
            var tone=profile.Add<Tonemapping>(true); tone.mode.Override(TonemappingMode.Neutral);
            var grade=profile.Add<ColorAdjustments>(true); grade.saturation.Override(7); grade.contrast.Override(8);
            var vignette=profile.Add<Vignette>(true); vignette.intensity.Override(0.13f); vignette.smoothness.Override(0.45f);
            // Recreate profile sub-assets together, preserving the root GUID on rebuilds.
            var saved=AssetDatabase.LoadAssetAtPath<VolumeProfile>(Out+"Atmosphere.asset");
            if(saved!=null) { foreach(var c in saved.components)Object.DestroyImmediate(c,true); saved.components.Clear(); }
            else { saved=ScriptableObject.CreateInstance<VolumeProfile>(); AssetDatabase.CreateAsset(saved,Out+"Atmosphere.asset"); }
            foreach(var c in profile.components) { saved.components.Add(c); AssetDatabase.AddObjectToAsset(c,saved); }
            profile.components.Clear(); Object.DestroyImmediate(profile); EditorUtility.SetDirty(saved);

            var scene=EditorSceneManager.NewPreviewScene();
            var garden=new GameObject("Kyoto · Komorebi garden"); UnityEngine.SceneManagement.SceneManager.MoveGameObjectToScene(garden,scene);
            root=garden.transform; lanterns.Clear(); sources.Clear();
            try
            {
                Terrain();
                Place("Environment","Gazebo_1",new Vector3(0,-0.1f,0),new Vector3(1f,0.7f,0.8f),0);
                P("Nature","Sakura_1",-3.4f,-0.12f,8f,0.67f,-20);
                P("Nature","Sakura_2",-9,0,16,0.60f,55);
                P("Nature","Sakura_3",11,0.3f,21,0.66f,210);
                P("Nature","Sakura_1",2,1.1f,31,0.65f,60);
                P("Nature","PineTree_1",-8,0,12,0.55f,65);
                P("Nature","PineTree_2",8,0,19,0.66f,120);
                P("Nature","PineTree_3",-14,1,27,0.7f,80);
                P("Nature","PineTree_1",15,1,32,0.8f,200);
                P("Nature","PineTree_2",-5,0.6f,28,0.65f,180);
                P("Nature","PineTree_3",5,0.6f,29,0.6f,70);
                P("Nature","Sakura_2",-11,0.5f,24,0.65f,110);
                P("Environment","Torii_2",0.8f,0.12f,17,0.86f);
                P("Environment","HokoraShrine_2",6.4f,0.15f,11.7f,0.95f,200);
                P("Environment","StoneLantern_1_Light",-2.15f,0.04f,6.1f,1.05f,25);
                P("Environment","StoneLantern_1_Light",2.2f,0.02f,15.1f,0.85f,-15);
                P("Environment","StoneLantern_1_Light",-1.8f,0.05f,15.7f,0.85f,20);
                for(int i=0;i<7;i++)
                {
                    float z=3.7f+i*1.9f, x=0.7f*Mathf.Sin(z*0.25f);
                    P("Environment",i%2==0?"StonePath_2":"StonePath_1",x,Ground(x,z)+0.035f,z,i%2==0?0.7f:0.46f,i*47);
                }
                P("Environment","Platform_1",0.8f,-0.85f,20,0.75f);
                for(int i=0;i<6;i++)P("Environment","BambooFence_2",-11+i*3.8f,0.12f,23,1,i%2==0?0:180);
                Place("Nature","Water",new Vector3(5.2f,-0.24f,7),new Vector3(1.15f,1,1.4f));
                for(int i=0;i<8;i++)
                {
                    float angle=i*2.4f; float x=5.4f+Mathf.Cos(angle)*2.7f,z=6.8f+Mathf.Sin(angle)*3.6f;
                    P("Nature","WaterLily_Group_"+(i%4+1),x,-0.21f,z,0.7f+i%3*0.13f,i*47);
                }
                P("Environment","Bridge_1",5.8f,0.12f,9.5f,0.65f);
                P("Rocks Grass","Stone_3",2,-0.3f,9.5f,0.35f,30);
                P("Rocks Grass","Stone_3",9.6f,-0.3f,9.5f,0.35f,130);
                P("Rocks Grass","Stone_1",-3.4f,-0.3f,5.5f,0.35f,40);
                P("Rocks Grass","Stone_3",-2.6f,-0.2f,3.1f,0.27f,95);
                P("Rocks Grass","Stone_2",3.2f,-0.35f,3.5f,0.26f,180);
                var rng=new System.Random(418);
                float Rand(float a,float b)=>a+(float)rng.NextDouble()*(b-a);
                for(int i=0;i<18;i++)
                {
                    float angle=i/18f*Mathf.PI*2;
                    float x=5.3f+Mathf.Cos(angle)*4.2f,z=7+Mathf.Sin(angle)*5.7f;
                    if(x<2)continue;
                    P("Rocks Grass","Stone_"+(i%8+1),x,Ground(x,z)-0.2f,z,Rand(0.13f,0.24f),Rand(0,360));
                }
                for(int i=0;i<10;i++)
                {
                    float x=-36+i*8f,z=58+Rand(-3,8);
                    P("Rocks Grass","Rock_"+(i%3+1),x,1,z,Rand(0.7f,1.1f),Rand(0,360));
                }
                // Surround the seat, including side and rear headset views.
                for(int i=1;i<18;i++)
                {
                    float angle=i/18f*Mathf.PI*2;
                    float x=Mathf.Sin(angle)*18,z=5+Mathf.Cos(angle)*15;
                    if(Mathf.Abs(x)<9 && z>10)continue;
                    P("Nature",i%3==0?"Sakura_2":"PineTree_"+(i%3+1),x,Ground(x,z)-0.08f,z,Rand(0.65f,0.85f),i*61);
                    P("Rocks Grass","Stone_"+(i%5+1),x*0.8f,Ground(x*0.8f,z)-0.45f,z,Rand(0.35f,0.55f),i*37);
                    P("Nature","Bush_1_Flowers",x*0.85f,Ground(x*0.85f,z+1),z+1,Rand(0.8f,1.3f),i*45);
                }
                for(int side=-1;side<=1;side+=2)for(int i=0;i<4;i++)
                {
                    float x=side*(25+Rand(-1,2)),z=-9+i*12;
                    P("Rocks Grass","Rock_"+(i%3+1),x,0,z,Rand(0.9f,1f),i*81);
                }
                for(int i=0;i<5;i++)P("Rocks Grass","Rock_"+(i%3+1),-24+i*12,-1,-20,1f,i*93);
                for(int i=0;i<50;i++)
                {
                    float angle=Rand(0,Mathf.PI*2),radius=Rand(9,17);
                    float x=Mathf.Sin(angle)*radius,z=3+Mathf.Cos(angle)*radius*0.65f;
                    if(z>1 && x>-5 && x<10)continue;
                    P("Nature",i%3==0?"Fern_2":"Grass_1_Large",x,Ground(x,z),z,Rand(0.85f,1.3f),i*41);
                }
                for(int i=0;i<125;i++)
                {
                    float x=Rand(-12,13),z=Rand(2.5f,26);
                    if(Mathf.Abs(x-0.7f*Mathf.Sin(z*0.25f))<1.55f || Ground(x,z)<-0.08f)continue;
                    string name=i%7==0?"Bush_2_Flowers":i%5==0?"Farfugium_1":i%3==0?"Fern_2":"Grass_1_Large";
                    float scale=name.StartsWith("Bush")?Rand(0.45f,0.7f):Rand(0.7f,1.2f);
                    P("Nature",name,x,Ground(x,z),z,scale,Rand(0,360));
                }
                for(int i=0;i<24;i++)
                {
                    float x=Rand(-15,16),z=Rand(24,35);
                    if(Mathf.Abs(x)<2)continue;
                    P("Nature",i%4==0?"Bush_1_Flowers":"Bush_1",x,Ground(x,z)-0.06f,z,Rand(0.8f,1.25f),Rand(0,360));
                }
                P("Nature","Bush_1_Flowers",-5.7f,0,5,0.8f);
                P("Nature","Bush_4_Flowers",7.5f,0,13,0.85f);
                P("Nature","Fern_1",-2.1f,0,3,1.15f,120);
                P("Nature","Fern_3",-3.6f,0,3,1.1f,40);
                P("Nature","Fallen_Leaves_1",-3,0.1f,6,0.8f,22);
                var petals=P("Particle Systems","CherryBlossom_Leaffall",-3.8f,5.5f,7,0.6f);
                foreach(var particles in petals.GetComponentsInChildren<ParticleSystem>())
                { var main=particles.main; main.startSize=new ParticleSystem.MinMaxCurve(0.035f,0.07f); }
                P("Particle Systems","Cloud_1",-12,25,49,2);
                P("Particle Systems","Cloud_3",22,28,56,2);
                var mist=P("Particle Systems","Fog_1",0,0.4f,35,0.45f);
                foreach(var particles in mist.GetComponentsInChildren<ParticleSystem>())
                { var main=particles.main; main.startColor=new Color(1,1,1,0.18f); }
                var sunGo=new GameObject("Sun · midday to twilight"); sunGo.transform.SetParent(root,false);
                var sun=sunGo.AddComponent<Light>(); sun.type=LightType.Directional; sun.shadows=LightShadows.Soft; sun.shadowBias=0.04f; sun.shadowNormalBias=0.35f;
                var volumeGo=new GameObject("Atmosphere"); volumeGo.transform.SetParent(root,false);
                var volume=volumeGo.AddComponent<Volume>(); volume.isGlobal=true; volume.sharedProfile=saved;
                var controller=garden.AddComponent<KomorebiGarden>(); controller.pipeline=pipeline;
                controller.skySource=Load<Material>(Pack+"Assets/Materials/Nature/Skybox_1.mat");
                controller.sun=sun; controller.lanterns=lanterns.ToArray(); controller.volume=volume;
                controller.Activate(); controller.Apply(0);
                PrefabUtility.SaveAsPrefabAsset(garden,Out+"Garden.prefab");
                File.WriteAllText("Checks/komorebi-review/asset-sources.txt",string.Join("\n",new HashSet<string>(sources)));
                Debug.Log("[Komorebi] Built garden from "+sources.Count+" package prefab instances.");
            }
            finally { Object.DestroyImmediate(garden); EditorSceneManager.ClosePreviewScene(scene); }
            SaveGardenScene();
            AssetDatabase.SaveAssets(); AssetDatabase.Refresh();
        }
    }
}
