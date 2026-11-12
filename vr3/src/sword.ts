import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, DynamicDrawUsage, EquirectangularReflectionMapping, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PMREMGenerator, RepeatWrapping, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3, type World } from '@iwsdk/core';

function canvasTexture(kind: 'cloth'|'ivory'|'steel') {
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d')!;
  g.fillStyle=kind==='cloth'?'#743d50':kind==='ivory'?'#c7a48a':'#bac0d9';g.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=kind==='ivory'?7:3){
    g.strokeStyle=kind==='steel'?'#d4d6e31c':'#40253422';g.lineWidth=1;g.beginPath();g.moveTo(0,i);g.lineTo(256,i+(kind==='cloth'?12:0));g.stroke();
    if(kind==='cloth'){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.stroke();}
    if(kind==='ivory')for(let j=0;j<256;j+=7){g.fillStyle='#fff4d96b';g.beginPath();g.ellipse(j+(i%2)*3,i,2,1.5,0,0,7);g.fill();}
  }
  if(kind==='steel'){g.strokeStyle='#f5e7eaa0';g.lineWidth=3;g.beginPath();for(let y=0;y<=256;y++)g.lineTo(42+Math.sin(y*.14)*6,y);g.stroke();}
  const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;if(kind==='cloth')t.wrapT=RepeatWrapping;return t;
}

// How the katana sits in the hand. The model is built handle-centred with the blade along +Y and
// the cutting edge on -X. WebXR's grip space has -Z running through the closed fist from little
// finger to thumb and -Y towards the knuckles, so the blade is laid along -Z with the edge leading.
// Seated play: the fist sits right under the guard, so the sword turns about the hand like a real one,
// and the reach comes from a longer blade rather than from a gap between hand and hilt.
// Set from the Sword controls (remembered on this device) or the address bar: ?reach=0.045&tilt=24&blade=1.25.
// reach: metres from the middle of the fist to the guard; .045 puts the index finger against it.
// tilt: degrees the blade leans from the fist's axis towards the knuckles.
// blade: blade length as a multiple of the modelled .72 m.
// turn: degrees the blade is angled across the body, to the left, rather than straight ahead of the fist.
// (2026-11-11, on the headset with controllers: 3 cm, a 58 cm blade and a 28 degree lean felt good, with the blade angled a bit to the left.)
// (2026-11-11, later: "make the kyoto sword a bit more like the position of the haunted sword": upright, lean -15 and turn 8, as the knight's.)
export const SWORD_HOLD_DEFAULT={reach:.03,tilt:-15,turn:8,blade:.8};
export type SwordHold=typeof SWORD_HOLD_DEFAULT;
const HOLD_KEYS=['reach','tilt','turn','blade'] as const;
// (saved under a new name since the upright default, so a lean saved before it does not hide it)
const remembered=(key:string)=>{try{return localStorage.getItem('vr3.hold2.'+key);}catch{return null;}};
const tune=(key:keyof SwordHold)=>{for(const raw of [new URLSearchParams(location.search).get(key),remembered(key)]){const v=parseFloat(raw??'');if(Number.isFinite(v))return v;}return SWORD_HOLD_DEFAULT[key];};
export const swordHold:SwordHold={reach:tune('reach'),tilt:tune('tilt'),turn:tune('turn'),blade:tune('blade')};
const GUARD_Y=.137,BLADE_BASE_Y=.15;
// Which way round the model's X axis carries the blade to the player's left in the right hand.
const TURN_SIGN=1;
export const BLADE_LENGTH=.72;
const hold=new Matrix4(),holdBasis=new Matrix4().makeBasis(new Vector3(0,1,0),new Vector3(0,0,-1),new Vector3(-1,0,0)),holdShift=new Matrix4(),holdTurn=new Matrix4();
export function setSwordHold(next:Partial<SwordHold>,remember=true){
  Object.assign(swordHold,next);
  // The turn is about the blade's own edge-to-spine line, at the fist: it tips the blade sideways without changing the lean.
  hold.makeRotationX(-swordHold.tilt*Math.PI/180).multiply(holdBasis).multiply(holdTurn.makeRotationX(TURN_SIGN*swordHold.turn*Math.PI/180)).multiply(holdShift.makeTranslation(0,swordHold.reach-GUARD_Y,0));
  if(remember)try{for(const key of HOLD_KEYS)localStorage.setItem('vr3.hold2.'+key,String(swordHold[key]));}catch{/* private window: keep it for this visit only */}
}
setSwordHold({},false);

export function createSword(world:World) {
  const root=new Group();root.name='Sakura katana — right grip';
  const model=new Group();root.add(model);
  // Small reflection environment used by this prop only, not the painted world.
  const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d')!;
  const grad=ctx.createLinearGradient(0,0,0,128);grad.addColorStop(0,'#838cbd');grad.addColorStop(.4,'#e5c7d2');grad.addColorStop(.55,'#35314d');grad.addColorStop(1,'#947458');ctx.fillStyle=grad;ctx.fillRect(0,0,256,128);ctx.fillStyle='#ffe0aa';ctx.fillRect(45,35,17,42);ctx.fillStyle='#d9e3ff';ctx.fillRect(180,16,9,52);
  const reflection=new CanvasTexture(c);reflection.colorSpace=SRGBColorSpace;reflection.mapping=EquirectangularReflectionMapping;
  const pmrem=new PMREMGenerator(world.renderer);const env=pmrem.fromEquirectangular(reflection);pmrem.dispose();reflection.dispose();
  const steel=new MeshStandardMaterial({color:'#c6cce3',map:canvasTexture('steel'),metalness:.76,roughness:.28,envMap:env.texture,envMapIntensity:.9});
  const edge=new MeshStandardMaterial({color:'#f0e5e9',metalness:.85,roughness:.18,envMap:env.texture,envMapIntensity:1.15});
  const brass=new MeshStandardMaterial({color:'#b99051',metalness:.7,roughness:.4,envMap:env.texture});
  const dark=new MeshStandardMaterial({color:'#513746',roughness:.8});
  const cloth=new MeshStandardMaterial({color:'#ffffff',map:canvasTexture('cloth'),roughness:.88,envMap:env.texture,envMapIntensity:.45});
  const ivory=new MeshStandardMaterial({map:canvasTexture('ivory'),roughness:.73,envMap:env.texture,envMapIntensity:.4});
  // Faceted curved blade, with a distinct beveled edge and sharpened silhouette.
  const vertices:number[]=[],uvs:number[]=[];const geometry=new BufferGeometry();
  const rings=36;
  function point(t:number,k:number):[number,number,number] {
    const center=t*t*(.106+.023*t);
    const half=.019*(1-.22*t);
    // Continue the spine through the tip as the cutting edge sweeps up to meet it.
    const nose=Math.pow(Math.max(0,(t-.88)/.12),1.55);
    const across=[-1,-.43,1,-.43][k];
    return [center+half*(across+(1-across)*nose),.15+t*.72,[0,.0034,0,-.0034][k]*(1-nose)];
  }
  // Batch by material for two draws and map both faces from edge to spine.
  for(let mat=0;mat<2;mat++){
    const start=vertices.length/3;
    for(let k=0;k<4;k++){
      if((k===0||k===3?1:0)!==mat)continue;
      const other=(k+1)%4;
      const add=(t:number,side:number)=>{vertices.push(...point(t,side));uvs.push(side===0?0:side===2?1:.22,t);};
      for(let j=0;j<rings;j++){
        const t=j/rings,next=(j+1)/rings;
        if(j<rings-1){add(t,k);add(next,other);add(next,k);}
        add(t,k);add(t,other);add(next,other);
      }
    }
    geometry.addGroup(start,vertices.length/3-start,mat);
  }
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
  const blade=new Mesh(geometry,[steel,edge]);blade.name='Curved beveled satin blade';model.add(blade);
  function cylinder(radius:number,length:number,y:number,mat:MeshStandardMaterial,flatten=1){const mesh=new Mesh(new CylinderGeometry(radius,radius,length,16),mat);mesh.position.y=y;mesh.scale.z=flatten;model.add(mesh);return mesh;}
  cylinder(.019,.235,0,ivory,.78);
  // (the collar at the top of the handle runs right up under the guard: it stopped 8 mm short, which showed as a gap in VR)
  cylinder(.023,.018,-.124,brass,.82);cylinder(.022,.034,.117,dark,.82);
  cylinder(.049,.008,.137,brass,.80);cylinder(.043,.009,.137,dark,.80);
  cylinder(.021,.027,.1525,brass,.35);
  // Two continuous crossed ribbons, actual geometry over the textured rayskin.
  const wrapPos:number[]=[],wrapUV:number[]=[];
  // Subdivide across the ribbons so they hug the oval grip instead of sinking into it.
  for(const direction of [-1,1]){
    const ring=(u:number,v:number)=>{const a=u*Math.PI*2*6*direction+v*.78;wrapPos.push(Math.cos(a)*(.0205+direction*.00035),-.109+u*.212,Math.sin(a)*(.0165+direction*.00035));wrapUV.push((v+1)/2,u*6);};
    for(let i=0;i<144;i++)for(let j=0;j<4;j++){
      const a=i/144,b=(i+1)/144,v=-1+j/2,w=v+.5;
      ring(a,v);ring(b,v);ring(b,w);ring(a,v);ring(b,w);ring(a,w);
    }
  }
  const wrapGeo=new BufferGeometry();wrapGeo.setAttribute('position',new Float32BufferAttribute(wrapPos,3));wrapGeo.setAttribute('uv',new Float32BufferAttribute(wrapUV,2));wrapGeo.computeVertexNormals();cloth.side=DoubleSide;model.add(new Mesh(wrapGeo,cloth));
  // Blossom relief on the guard face; 25 petals in one draw.
  const blossoms=new InstancedMesh(new SphereGeometry(1,6,4),brass,25);const dummy=new Object3D();
  for(let i=0;i<25;i++){const flower=Math.floor(i/5),petal=i%5,angle=flower*Math.PI*2/5,p=petal*Math.PI*2/5;dummy.position.set(Math.cos(angle)*.032+Math.cos(p)*.004,.143,Math.sin(angle)*.025+Math.sin(p)*.004);dummy.scale.set(.0035,.0017,.005);dummy.rotation.y=-p;dummy.updateMatrix();blossoms.setMatrixAt(i,dummy.matrix);}model.add(blossoms);
  // Light ribbon uses a fixed pool of world-space samples; no frame allocations.
  const count=20,base=Array.from({length:count},()=>new Vector3()),tip=Array.from({length:count},()=>new Vector3());
  const births=new Float32Array(count).fill(-10),strengths=new Float32Array(count);
  const pos=new Float32Array((count-1)*18),fade=new Float32Array((count-1)*6);
  const trailGeo=new BufferGeometry();trailGeo.setAttribute('position',new BufferAttribute(pos,3).setUsage(DynamicDrawUsage));trailGeo.setAttribute('opacity',new BufferAttribute(fade,1).setUsage(DynamicDrawUsage));
  const trailMat=new ShaderMaterial({transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,vertexShader:'attribute float opacity;varying float alpha;void main(){alpha=opacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float alpha;void main(){gl_FragColor=vec4(.84,.64,1.,alpha);}' });
  const trail=new Mesh(trailGeo,trailMat);trail.name='Velocity-driven sakura swing ribbon';trail.frustumCulled=false;
  world.createTransformEntity(root);world.createTransformEntity(trail);
  const currentBase=new Vector3(),currentTip=new Vector3(),lastTip=new Vector3();
  const trailStartModel=new Vector3(...point(.15,0)),bladeTipModel=new Vector3(...point(1,2)),trailStart=new Vector3(),bladeTip=new Vector3();
  let bladeScale=0;
  // Stretch the blade from its base at the guard; the trail's two ends follow.
  function fitBlade(){
    if(bladeScale===swordHold.blade)return;bladeScale=swordHold.blade;
    blade.scale.y=bladeScale;blade.position.y=BLADE_BASE_Y*(1-bladeScale);
    for(const [from,to] of [[trailStartModel,trailStart],[bladeTipModel,bladeTip]])to.copy(from).setY(BLADE_BASE_Y+(from.y-BLADE_BASE_Y)*bladeScale);
  }
  fitBlade();
  let clock=0,tracked=false,swingTime=-1,activeSamples=0;
  function clearTrail(){births.fill(-10);strengths.fill(0);tracked=false;activeSamples=0;trail.visible=false;}
  function previewSwing(){if(!world.renderer.xr.isPresenting)swingTime=0;}
  function update(dt:number,frame:XRFrame|undefined,motion:boolean,night:number){
    clock+=dt;let valid=false;fitBlade();
    if(world.renderer.xr.isPresenting){
      const session=world.renderer.xr.getSession(),space=world.renderer.xr.getReferenceSpace();
      if(frame&&space&&session)for(const source of session.inputSources){if(source.handedness==='right'&&source.gripSpace){const pose=frame.getPose(source.gripSpace,space);if(pose){root.matrixAutoUpdate=false;root.matrix.fromArray(pose.transform.matrix).multiply(hold);root.matrix.premultiply(world.player.matrixWorld);root.matrixWorldNeedsUpdate=true;valid=true;}break;}}
    }else{
      root.matrixAutoUpdate=true;world.camera.getWorldPosition(root.position);root.position.add(currentBase.set(.32,-.30,-.65).applyQuaternion(world.camera.quaternion));root.quaternion.copy(world.camera.quaternion);root.rotateX(-.35);root.rotateZ(-.22);
      if(swingTime>=0){swingTime+=dt;const phase=Math.min(swingTime/.65,1);root.rotateZ(Math.sin(phase*Math.PI)*1.9);root.rotateX(-Math.sin(phase*Math.PI)*.45);if(phase===1)swingTime=-1;}
      // The desktop pose is staged, not a tracked hand; show the Sword controls as a shift from the default.
      root.rotateX(-(swordHold.tilt-SWORD_HOLD_DEFAULT.tilt)*Math.PI/180);root.translateY(swordHold.reach-SWORD_HOLD_DEFAULT.reach);
      valid=true;
    }
    root.visible=valid;if(!valid){clearTrail();return;}
    root.updateMatrixWorld(true);currentBase.copy(trailStart).applyMatrix4(root.matrixWorld);currentTip.copy(bladeTip).applyMatrix4(root.matrixWorld);
    const distance=tracked?currentTip.distanceTo(lastTip):0;const speed=dt>.001?distance/dt:0;
    const reset=!tracked||distance>.5||dt>.10||!motion;
    if(reset){clearTrail();}
    lastTip.copy(currentTip);tracked=true;
    for(let i=count-1;i>0;i--){base[i].copy(base[i-1]);tip[i].copy(tip[i-1]);births[i]=births[i-1];strengths[i]=strengths[i-1];}
    base[0].copy(currentBase);tip[0].copy(currentTip);births[0]=clock;strengths[0]=!reset?Math.min(.32,Math.max(0,speed-.65)*.10):0;
    activeSamples=0;
    for(let i=0;i<count-1;i++){
      const a=Math.max(0,1-(clock-births[i])/.18)*Math.min(strengths[i],strengths[i+1]);if(a>.005)activeSamples++;
      for(let v=0;v<6;v++){const p=v===0||v===3?base[i]:v===1?tip[i]:v===2||v===4?tip[i+1]:base[i+1];p.toArray(pos,i*18+v*3);fade[i*6+v]=a*(v===0||v===3||v===5?.12:1);}
    }
    trail.visible=motion&&activeSamples>0;trailGeo.attributes.position.needsUpdate=true;trailGeo.attributes.opacity.needsUpdate=true;
    steel.envMapIntensity=.9-night*.15;
  }
  return {update,previewSwing,clearTrail,diagnostics:()=>({visible:root.visible,trailSegments:activeSamples}),dispose:()=>env.dispose()};
}
