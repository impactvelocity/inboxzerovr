"""Check packed assets, light endpoints, tree connectivity and motion continuity."""
import json, math, bpy
from mathutils import Vector
s=bpy.context.scene; tree=bpy.data.objects['Cherry_Tree']
assert s.camera and s.camera.name=='Camera_Seated'
images=[i for i in bpy.data.images if i.source=='FILE' and i.users]
assert images and all(i.packed_file for i in images), 'External image dependency'
adj=[[] for _ in tree.data.vertices]
for e in tree.data.edges:
    a,b=e.vertices; adj[a].append(b); adj[b].append(a)
seen=set(); components=[]
for i in range(len(adj)):
    if i in seen: continue
    stack=[i]; seen.add(i); count=0
    while stack:
        v=stack.pop(); count+=1
        for n in adj[v]:
            if n not in seen: seen.add(n); stack.append(n)
    components.append(count)
assert max(components)/len(adj)>0.95, components
endpoints=[]
for f in (1,721,1153):
    s.frame_set(f); bpy.context.view_layer.update()
    endpoints.append(dict(frame=f,night=bpy.data.objects['Dusk_Control']['Night'],
        sky_w=bpy.data.lights['Sky_Key'].energy,world=s.world.node_tree.nodes['Background'].inputs[1].default_value))
assert endpoints[0]['night']==0 and endpoints[-1]['night']==1
assert endpoints[0]['sky_w']>endpoints[1]['sky_w']>endpoints[-1]['sky_w']
poses=[]
for f in (1,145,289):
    s.frame_set(f); bpy.context.view_layer.update()
    ev=tree.evaluated_get(bpy.context.evaluated_depsgraph_get())
    poses.append([v.co.copy() for v in ev.data.vertices])
loop_error=max((a-b).length for a,b in zip(poses[0],poses[2]))
motion=max((a-b).length for a,b in zip(poses[0],poses[1]))
assert loop_error<0.0001,(loop_error,motion)
assert motion>0.0001,motion
root_ids=[v.index for v in tree.data.vertices if v.co.z<0.65]
root_error=max((poses[0][i]-poses[1][i]).length for i in root_ids)
assert root_error<0.0001,root_error
for o in bpy.data.objects:
    assert all(math.isfinite(v) for row in o.matrix_world for v in row),o.name
s.frame_set(1)
print('VERIFIED '+json.dumps(dict(objects=len(bpy.data.objects),tree_vertices=len(adj),
    tree_faces=len(tree.data.polygons),tree_components=sorted(components,reverse=True),packed_images=[i.name for i in images],
    light_endpoints=endpoints,loop_vertex_error=loop_error,wind_tip_motion_m=motion,root_motion_m=root_error)))
