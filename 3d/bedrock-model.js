import { extractGeometryDefinitions, validateGeometry, resolveAttachableGeometry } from "./bedrock-parser.js";

const $ = id => document.getElementById(id);
const THREE = window.THREE;
const PALETTE = [
  {id:"white_concrete",name:"白色のコンクリート",hex:"#D1D2D3"},
  {id:"light_gray_concrete",name:"薄灰色のコンクリート",hex:"#7D7D73"},
  {id:"gray_concrete",name:"灰色のコンクリート",hex:"#383B3B"},
  {id:"black_concrete",name:"黒色のコンクリート",hex:"#080A0F"},
  {id:"red_concrete",name:"赤色のコンクリート",hex:"#8E2020"},
  {id:"orange_concrete",name:"橙色のコンクリート",hex:"#E06101"},
  {id:"yellow_concrete",name:"黄色のコンクリート",hex:"#F0AF15"},
  {id:"lime_concrete",name:"黄緑色のコンクリート",hex:"#5E7C16"},
  {id:"green_concrete",name:"緑色のコンクリート",hex:"#495B24"},
  {id:"cyan_concrete",name:"青緑色のコンクリート",hex:"#157788"},
  {id:"light_blue_concrete",name:"空色のコンクリート",hex:"#2489C7"},
  {id:"blue_concrete",name:"青色のコンクリート",hex:"#253192"},
  {id:"purple_concrete",name:"紫色のコンクリート",hex:"#641F9C"},
  {id:"magenta_concrete",name:"赤紫色のコンクリート",hex:"#AB1E9A"},
  {id:"pink_concrete",name:"桃色のコンクリート",hex:"#D5658F"},
  {id:"brown_concrete",name:"茶色のコンクリート",hex:"#603B1F"}
];
const FACE_NAMES = ["east","west","up","down","south","north"];
let renderer, scene, camera, orientation, modelRoot, voxelGroup, activeGeometry = null;
let geometryChoices = [], zipFiles = null, textureObjectUrl = null, textureImage = null, cubeMeshes = [];
let voxels = [], dimensions = {x:0,y:0,z:0}, currentLayer = 1, showingVoxels = false;
let orbit = {drag:false,button:0,x:0,y:0,theta:Math.PI/4,phi:Math.PI/3,radius:7,target:new THREE.Vector3(0,0,0)};
const selectedBlocks = new Set(PALETTE.map(item => item.id));

function setStatus(id,message,type="") { const el=$(id); el.textContent=message; el.className="status"+(type?" "+type:""); }
function number3(value,fallback=0){return Array.isArray(value)?[0,1,2].map(i=>Number(value[i]??fallback)):[fallback,fallback,fallback];}
function parseHex(hex){return new THREE.Color(hex);}
function initPalette(){
  $("palette").innerHTML="";
  for(const block of PALETTE){const label=document.createElement("label");const input=document.createElement("input");input.type="checkbox";input.checked=true;input.value=block.id;input.addEventListener("change",()=>input.checked?selectedBlocks.add(block.id):selectedBlocks.delete(block.id));const sw=document.createElement("span");sw.className="swatch";sw.style.background=block.hex;label.append(input,sw,document.createTextNode(block.name));$("palette").append(label);}
}
function initScene(){
  if(!THREE){setStatus("loadStatus","Three.jsを読み込めませんでした。ネットワークを確認してください。","error");return;}
  const host=$("viewer");scene=new THREE.Scene();scene.background=new THREE.Color(0x11111b);
  camera=new THREE.PerspectiveCamera(45,host.clientWidth/host.clientHeight,0.01,1000);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x444455,2));
  const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(5,9,7);scene.add(light);
  const grid=new THREE.GridHelper(12,24,0x666677,0x333344);scene.add(grid);
  orientation=new THREE.Group();scene.add(orientation);
  const resize=new ResizeObserver(()=>{if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);});resize.observe(host);
  renderer.domElement.addEventListener("pointerdown",event=>{orbit.drag=true;orbit.button=event.button;orbit.x=event.clientX;orbit.y=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener("pointerup",()=>orbit.drag=false);
  renderer.domElement.addEventListener("pointermove",event=>{if(!orbit.drag)return;const dx=event.clientX-orbit.x,dy=event.clientY-orbit.y;orbit.x=event.clientX;orbit.y=event.clientY;if(orbit.button===2){const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);orbit.target.addScaledVector(right,-dx*.008).addScaledVector(up,dy*.008);}else{orbit.theta-=dx*.008;orbit.phi=Math.max(.08,Math.min(Math.PI-.08,orbit.phi+dy*.008));}updateCamera();});
  renderer.domElement.addEventListener("contextmenu",event=>event.preventDefault());
  renderer.domElement.addEventListener("wheel",event=>{event.preventDefault();orbit.radius=Math.max(.5,Math.min(100,orbit.radius*Math.exp(event.deltaY*.001)));updateCamera();},{passive:false});
  updateCamera();animate();
}
function updateCamera(){const s=Math.sin(orbit.phi);camera.position.set(orbit.target.x+orbit.radius*s*Math.sin(orbit.theta),orbit.target.y+orbit.radius*Math.cos(orbit.phi),orbit.target.z+orbit.radius*s*Math.cos(orbit.theta));camera.lookAt(orbit.target);}
function animate(){requestAnimationFrame(animate);if(renderer&&scene&&camera)renderer.render(scene,camera);}
function clearGroup(group){while(group.children.length){const child=group.children.pop();child.traverse?.(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.();});}}
function fitCamera(){
  if(!orientation||!orientation.children.length)return;
  const box=new THREE.Box3().setFromObject(orientation);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());orbit.target.copy(center);orbit.radius=Math.max(2,Math.max(size.x,size.y,size.z)*2.2);updateCamera();
}
function geometryFromJson(data,label){
  const list=extractGeometryDefinitions(data);if(!list.length)throw new Error("minecraft:geometry 内に利用可能なbonesがありません。");
  geometryChoices=list.map((geometry,index)=>({geometry,label:(geometry.description?.identifier||"geometry_"+index)+" ("+index+")"}));
  fillGeometrySelect();chooseGeometry(0);setStatus("loadStatus",label+" を読み込みました。Geometry: "+list.length+"件。","ok");
}
function fillGeometrySelect(){const select=$("geometrySelect");if(select){select.innerHTML="";geometryChoices.forEach((item,index)=>{const option=document.createElement("option");option.value=index;option.textContent=item.label;select.append(option);});}const wrap=$("geometrySelectWrap");if(wrap)wrap.hidden=geometryChoices.length<2;}
function chooseGeometry(index){
  const choice=geometryChoices[index];if(!choice)return;const check=validateGeometry(choice.geometry);if(!check.valid)throw new Error(check.errors.join("\n"));
  activeGeometry=choice.geometry;buildModel(activeGeometry);$("convertBtn").disabled=false;
  setStatus("loadStatus","読み込み成功: "+check.identifier+"\nBone: "+check.boneCount+"\nCube: "+cubeMeshes.length+"\nテクスチャ: "+(textureImage?"あり":"未設定（単色表示）"),"ok");
}
function makeFaceMaterials(cube){
  const color=textureImage?0xffffff:0x9aa3b2;const mats=[];
  const size=number3(cube.size),uv=Array.isArray(cube.uv)?cube.uv:null;
  const faceRects=uv?[
    [uv[0],uv[1]+size[2],size[2],size[1]],
    [uv[0]+size[2]+size[0],uv[1]+size[2],size[2],size[1]],
    [uv[0]+size[2],uv[1],size[0],size[2]],
    [uv[0]+size[2]+size[0],uv[1],size[0],size[2]],
    [uv[0]+size[2],uv[1]+size[2],size[0],size[1]],
    [uv[0]+size[2]+size[0]+size[2],uv[1]+size[2],size[0],size[1]]
  ]:null;
  FACE_NAMES.forEach((face,index)=>{
    const mat=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});
    if(textureImage){
      const texture=new THREE.Texture(textureImage);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      const faceUv=cube.uv&&typeof cube.uv==="object"&&!Array.isArray(cube.uv)?cube.uv[face]:null;
      let rect=faceRects?.[index]||[0,0,textureImage.width,textureImage.height];
      if(faceUv){const pos=faceUv.uv||faceUv,sz=faceUv.uv_size||[faceUv[2]||textureImage.width,faceUv[3]||textureImage.height];rect=[Number(pos[0]||0),Number(pos[1]||0),Number(sz[0]||1),Number(sz[1]||1)];}
      const [u,v,w,h]=rect;texture.offset.set(u/textureImage.width,1-(v+h)/textureImage.height);texture.repeat.set(w/textureImage.width,h/textureImage.height);mat.map=texture;mat.color.set(0xffffff);mat.needsUpdate=true;
    }
    mats.push(mat);
  });
  return mats;
}
function buildModel(geometry){
  clearGroup(orientation);cubeMeshes=[];voxelGroup=null;showingVoxels=false;modelRoot=new THREE.Group();orientation.add(modelRoot);
  const bones=geometry.bones||[],byName=new Map(),children=new Map();
  for(const bone of bones){byName.set(bone.name,bone);children.set(bone.name,[]);}
  for(const bone of bones){if(bone.parent&&children.has(bone.parent))children.get(bone.parent).push(bone);else children.get("__root")?.push(bone);}
  const roots=bones.filter(b=>!b.parent||!byName.has(b.parent));
  function addBone(bone,parentGroup,parentPivot=[0,0,0]){
    const pivot=number3(bone.pivot);const group=new THREE.Group();group.position.set(pivot[0]-parentPivot[0],pivot[1]-parentPivot[1],pivot[2]-parentPivot[2]);if(bone.rotation){const rot=number3(bone.rotation).map(v=>THREE.MathUtils.degToRad(v));group.rotation.set(rot[0],rot[1],rot[2],"ZYX");}parentGroup.add(group);
    for(const cube of bone.cubes||[]){
      const origin=number3(cube.origin),size=number3(cube.size);const inflate=Number(cube.inflate||0);const dims=size.map(v=>Math.max(.001,v+inflate*2));
      const geo=new THREE.BoxGeometry(dims[0],dims[1],dims[2]);const mesh=new THREE.Mesh(geo,makeFaceMaterials(cube));
      const center=origin.map((v,i)=>v+size[i]/2-pivot[i]);mesh.position.set(center[0],center[1],center[2]);
      if(cube.pivot&&cube.rotation){const cp=number3(cube.pivot).map((v,i)=>v-pivot[i]);const pivotGroup=new THREE.Group();pivotGroup.position.set(...cp);pivotGroup.add(mesh);mesh.position.sub(new THREE.Vector3(...cp));const rr=number3(cube.rotation).map(v=>THREE.MathUtils.degToRad(v));pivotGroup.rotation.set(rr[0],rr[1],rr[2],"ZYX");group.add(pivotGroup);}else group.add(mesh);
      mesh.userData.rawSize=dims;mesh.userData.baseColor=textureImage?averageTextureColor(cube):0x9aa3b2;cubeMeshes.push(mesh);
    }
    for(const child of children.get(bone.name)||[])addBone(child,group,pivot);
  }
  for(const root of roots)addBone(root,modelRoot);
  const rawBox=new THREE.Box3().setFromObject(modelRoot);if(rawBox.isEmpty())throw new Error("モデルにCubeがありません。");
  const center=rawBox.getCenter(new THREE.Vector3());modelRoot.scale.setScalar(1/16);modelRoot.position.set(-center.x/16,-center.y/16,-center.z/16);
  orientation.rotation.set(0,0,0);orientation.scale.setScalar(1);fitCamera();
}
function averageTextureColor(cube){if(!textureImage)return 0x9aa3b2;try{
  const canvas=document.createElement("canvas");canvas.width=textureImage.width;canvas.height=textureImage.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(textureImage,0,0);
  const regions=[];const uv=cube.uv;
  if(uv&&typeof uv==="object"&&!Array.isArray(uv)){for(const value of Object.values(uv)){const pos=value?.uv||value;const size=value?.uv_size||[4,4];if(Array.isArray(pos))regions.push([pos[0],pos[1],size[0]||4,size[1]||4]);}}
  else if(Array.isArray(uv))regions.push([uv[0],uv[1],Math.max(1,Number(cube.size?.[0]||4)),Math.max(1,Number(cube.size?.[1]||4))]);
  if(!regions.length)regions.push([0,0,textureImage.width,textureImage.height]);
  let r=0,g=0,b=0,n=0;
  for(const [x,y,w,h] of regions){const sx=Math.max(0,Math.floor(x)),sy=Math.max(0,Math.floor(y)),ex=Math.min(textureImage.width,Math.ceil(x+w)),ey=Math.min(textureImage.height,Math.ceil(y+h));if(ex<=sx||ey<=sy)continue;const data=ctx.getImageData(sx,sy,ex-sx,ey-sy).data;for(let i=0;i<data.length;i+=4){if(data[i+3]<32)continue;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}
  return n?new THREE.Color(r/n/255,g/n/255,b/n/255).getHex():0x9aa3b2;
}catch{return 0x9aa3b2;}}
function loadTexture(file){
  if(textureObjectUrl)URL.revokeObjectURL(textureObjectUrl);textureObjectUrl=URL.createObjectURL(file);
  return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{textureImage=img;if(activeGeometry)buildModel(activeGeometry);resolve();};img.onerror=()=>reject(new Error("テクスチャ画像を読み込めません。"));img.src=textureObjectUrl;});
}
async function loadZip(file){
  if(!window.JSZip)throw new Error("ZIPライブラリを読み込めませんでした。");
  zipFiles=await JSZip.loadAsync(file);const jsonEntries=Object.values(zipFiles.files).filter(f=>!f.dir&&f.name.toLowerCase().endsWith(".json"));
  const choices=[];
  for(const entry of jsonEntries){try{const data=JSON.parse(await entry.async("text"));for(const geometry of extractGeometryDefinitions(data))choices.push({geometry,label:entry.name+" — "+(geometry.description?.identifier||"geometry")});}catch{}}
  if(!choices.length)throw new Error("ZIP内にminecraft:geometryを含むJSONが見つかりません。");
  geometryChoices=choices;fillGeometrySelect();const png=Object.values(zipFiles.files).find(f=>!f.dir&&f.name.toLowerCase().endsWith(".png")&&/textures\//i.test(f.name))||Object.values(zipFiles.files).find(f=>!f.dir&&f.name.toLowerCase().endsWith(".png"));
  if(png){const blob=await png.async("blob");await loadTexture(new File([blob],png.name,{type:"image/png"}));}
  chooseGeometry(0);setStatus("loadStatus","ZIP読み込み成功。Geometry "+choices.length+"件"+(png?" / PNGテクスチャを1件読み込み":" / PNGテクスチャなし"),"ok");
}
function setOrientationFromControls(){for(const axis of ["x","y","z"]){const v=Number($(axis==="x"?"rx":axis==="y"?"ry":"rz").value);$(axis+"Out").textContent=v+"°";orientation.rotation[axis]=THREE.MathUtils.degToRad(v);}const scale=Number($("scale").value);orientation.scale.setScalar(scale);$("scaleOut").textContent=scale.toFixed(2)+"×";if(voxels.length){voxels=[];dimensions={x:0,y:0,z:0};if(voxelGroup)voxelGroup.visible=false;for(const child of modelRoot.children)child.visible=true;$("blueprintUI").classList.add("hidden");$("blueprintEmpty").classList.remove("hidden");$("blueprintEmpty").textContent="向きまたは倍率が変更されました。新しい設定で再変換してください。";setStatus("convertStatus","設定変更により以前の変換結果を破棄しました。再変換してください。");}}
function rgb(hex){return {r:(hex>>16)&255,g:(hex>>8)&255,b:hex&255};}
function nearestBlock(hex){const c=rgb(hex);let best=null,bestD=Infinity;for(const b of PALETTE){if(!selectedBlocks.has(b.id))continue;const p=parseInt(b.hex.slice(1),16),q=rgb(p);const d=(c.r-q.r)**2+(c.g-q.g)**2+(c.b-q.b)**2;if(d<bestD){bestD=d;best=b;}}return best;}
function voxelize(){
  if(!cubeMeshes.length)throw new Error("変換できるCubeがありません。");if(!selectedBlocks.size)throw new Error("使用するブロックを1種類以上選択してください。");
  orientation.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(orientation);const scale=Number($("scale").value);const cell=Number($("voxelSize").value)/16*scale;const min=box.min.clone().addScalar(-cell*.001),max=box.max.clone().addScalar(cell*.001);
  const nx=Math.max(1,Math.ceil((max.x-min.x)/cell)),ny=Math.max(1,Math.ceil((max.y-min.y)/cell)),nz=Math.max(1,Math.ceil((max.z-min.z)/cell));
  if(nx*ny*nz>180000)throw new Error("変換範囲が大きすぎます（最大180,000マス）。倍率またはブロック単位を大きくしてください。");
  if(nx*ny*nz*cubeMeshes.length>12000000)throw new Error("モデルが複雑なため、この設定では処理量が大きすぎます。ブロック単位を大きくしてください。");
  const records=[];
  for(const mesh of cubeMeshes){mesh.updateWorldMatrix(true,false);const inv=mesh.matrixWorld.clone().invert();const half=mesh.userData.rawSize.map(v=>v/2);records.push({mesh,inv,half,color:mesh.userData.baseColor||0x9aa3b2});}
  const out=[];const solid=$("fillMode").value==="solid";
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const point=new THREE.Vector3(min.x+(x+.5)*cell,min.y+(y+.5)*cell,min.z+(z+.5)*cell);let chosen=null;
    for(const rec of records){const local=point.clone().applyMatrix4(rec.inv);if(Math.abs(local.x)>rec.half[0]+1e-5||Math.abs(local.y)>rec.half[1]+1e-5||Math.abs(local.z)>rec.half[2]+1e-5)continue;
      if(!solid){const edge=Math.min(rec.half[0]-Math.abs(local.x),rec.half[1]-Math.abs(local.y),rec.half[2]-Math.abs(local.z));if(edge>Number($("voxelSize").value)/2)continue;}
      chosen=rec;break;
    }
    if(chosen){const block=nearestBlock(chosen.color);if(block)out.push({x,y,z,block:block.id,hex:block.hex});}
  }
  if(!out.length)throw new Error("ブロックが生成されませんでした。倍率・ブロック単位を変更してください。");
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const v of out){minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);minZ=Math.min(minZ,v.z);maxZ=Math.max(maxZ,v.z);}
  const compact=out.map(v=>({...v,x:v.x-minX,y:v.y-minY,z:v.z-minZ}));dimensions={x:maxX-minX+1,y:maxY-minY+1,z:maxZ-minZ+1};return compact;
}
function renderVoxelPreview(){
  if(voxelGroup){orientation.remove(voxelGroup);voxelGroup.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.();});}
  voxelGroup=new THREE.Group();orientation.add(voxelGroup);
  const grouped=new Map();for(const v of voxels){if(!grouped.has(v.block))grouped.set(v.block,[]);grouped.get(v.block).push(v);}
  const cell=Number($("voxelSize").value)/16;const geo=new THREE.BoxGeometry(cell*.98,cell*.98,cell*.98);
  for(const [id,items] of grouped){const block=PALETTE.find(b=>b.id===id);const mat=new THREE.MeshLambertMaterial({color:block.hex});const inst=new THREE.InstancedMesh(geo,mat,items.length);const dummy=new THREE.Object3D();for(let i=0;i<items.length;i++){const v=items[i];dummy.position.set((v.x-(dimensions.x-1)/2)*cell,(v.y-(dimensions.y-1)/2)*cell,(v.z-(dimensions.z-1)/2)*cell);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);}voxelGroup.add(inst);}
  for(const child of modelRoot.children)child.visible=false;showingVoxels=true;
}
function updateBlueprint(){
  $("dimX").textContent=dimensions.x;$("dimY").textContent=dimensions.y;$("dimZ").textContent=dimensions.z;
  $("blueprintEmpty").classList.add("hidden");$("blueprintUI").classList.remove("hidden");const slider=$("layer");slider.max=dimensions.y;slider.value=Math.min(currentLayer,dimensions.y);currentLayer=Number(slider.value);renderLayer();
}
function materialCounts(items){const counts=new Map();for(const item of items)counts.set(item.block,(counts.get(item.block)||0)+1);return [...counts.entries()].sort((a,b)=>b[1]-a[1]);}
function renderMaterialList(container,items){const counts=materialCounts(items);container.innerHTML=counts.map(([id,count])=>{const b=PALETTE.find(p=>p.id===id);return "<div style='display:flex;justify-content:space-between;gap:8px;margin:4px 0'><span>"+b.name+"</span><b>"+count.toLocaleString()+"個</b></div>";}).join("")||"ブロックなし";}
function renderLayer(){
  if(!voxels.length)return;const layerIndex=currentLayer-1;const items=voxels.filter(v=>v.y===layerIndex);$("layerOut").textContent=currentLayer+" / "+dimensions.y;
  const canvas=$("layerCanvas"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#171722";ctx.fillRect(0,0,canvas.width,canvas.height);
  const pad=20,cell=Math.min((canvas.width-pad*2)/dimensions.x,(canvas.height-pad*2)/dimensions.z);const ox=(canvas.width-dimensions.x*cell)/2,oy=(canvas.height-dimensions.z*cell)/2;
  for(const v of items){ctx.fillStyle=v.hex;ctx.fillRect(ox+v.x*cell,oy+(dimensions.z-1-v.z)*cell,Math.max(1,cell-.5),Math.max(1,cell-.5));}
  ctx.strokeStyle="#ffffff22";ctx.lineWidth=1;for(let x=0;x<=dimensions.x;x++){ctx.beginPath();ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+dimensions.z*cell);ctx.stroke();}for(let z=0;z<=dimensions.z;z++){ctx.beginPath();ctx.moveTo(ox,oy+z*cell);ctx.lineTo(ox+dimensions.x*cell,oy+z*cell);ctx.stroke();}
  renderMaterialList($("layerMaterials"),items);renderMaterialList($("allMaterials"),voxels);$("prevLayer").disabled=currentLayer<=1;$("nextLayer").disabled=currentLayer>=dimensions.y;
}
async function handleZip(file){try{setStatus("loadStatus","ZIPを解析しています…");await loadZip(file);}catch(error){setStatus("loadStatus",error.message||String(error),"error");}}

const ITEM_CATALOG = [
 {id:"turtle_helmet",name:"カメの甲羅",category:"wearable",iconTexture:"https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/items/turtle_helmet.png",available:true,attachable:"https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/attachables/turtle_shell_helmet.player.json",geometry:"https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/models/entity/player_armor.json",texture:"https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/models/armor/turtle_1.png",geometryKey:"default",visibleBones:["head","hat"]},
 {id:"elytra",name:"エリトラ",category:"wearable",iconTexture:"",available:false,reason:"公式サンプルに対応Geometryが含まれていません"}
];
let selectedCatalogItem="turtle_helmet",activeItemCategory="all";
function populateItemCatalog(filter=""){
 const grid=$("itemGrid");if(!grid)return;grid.innerHTML="";
 const q=filter.trim().toLowerCase();
 const items=ITEM_CATALOG.filter(x=>(activeItemCategory==="all"||x.category===activeItemCategory)&&(x.name+" "+x.id).toLowerCase().includes(q));
 for(const item of items){
  const button=document.createElement("button");button.type="button";button.className="item-card"+(selectedCatalogItem===item.id?" selected":"");button.disabled=!item.available;button.title=item.available?item.name:item.reason;
  const icon=document.createElement("span");icon.className="item-icon";if(item.iconTexture){const image=document.createElement("img");image.src=item.iconTexture;image.alt=item.name+"のテクスチャ";image.loading="lazy";image.decoding="async";icon.append(image);}else{icon.textContent="";}
  const name=document.createElement("span");name.textContent=item.name;
  const note=document.createElement("small");note.textContent=item.available?"対応済み":"準備中";
  button.append(icon,name,note);
  button.addEventListener("click",()=>{selectedCatalogItem=item.id;populateItemCatalog($("itemSearch").value);$("loadItem").disabled=false;});
  grid.append(button);
 }
 $("itemCount").textContent="表示 "+items.length+"件 / 読み込み対応 "+ITEM_CATALOG.filter(x=>x.available).length+"件";
 $("loadItem").disabled=!ITEM_CATALOG.some(x=>x.id===selectedCatalogItem&&x.available);
}
async function loadCatalogItem(){
 const item=ITEM_CATALOG.find(x=>x.id===selectedCatalogItem&&x.available);if(!item)throw new Error("読み込めるアイテムを選択してください。");
 setStatus("loadStatus",item.name+" のAttachable・Geometry・テクスチャを取得しています…");
 const [a,g,t]=await Promise.all([fetch(item.attachable),fetch(item.geometry),fetch(item.texture)]);
 if(!a.ok||!g.ok||!t.ok)throw new Error("公式モデルデータの取得に失敗しました。HTTP "+[a.status,g.status,t.status].join("/"));
 const [attachData,geoData,textureBlob]=await Promise.all([a.json(),g.json(),t.blob()]);
 const resolved=resolveAttachableGeometry(attachData,geoData,item.geometryKey||"default");
 let geometry=resolved.geometry;
 if(item.visibleBones?.length)geometry={...geometry,bones:geometry.bones.filter(b=>item.visibleBones.includes(b.name))};
 if(!geometry.bones.some(b=>!b.neverRender&&(b.cubes||[]).length))throw new Error("表示可能なCubeがありません。");
 geometryChoices=[{geometry,label:item.name}];textureImage=null;activeGeometry=null;
 const file=new File([textureBlob],item.id+".png",{type:"image/png"});
 await loadTexture(file);chooseGeometry(0);fitCamera();
 setStatus("loadStatus",item.name+" を読み込みました。\nAttachable: "+resolved.attachable.identifier+"\nGeometry: "+resolved.geometryRef+"\nBone: "+geometry.bones.length+" / Cube: "+cubeMeshes.length,"ok");
}
$("itemSearch").addEventListener("input",e=>populateItemCatalog(e.target.value));
$("itemCategories").addEventListener("click",e=>{const button=e.target.closest("[data-item-category]");if(!button)return;activeItemCategory=button.dataset.itemCategory;$("itemCategories").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===button));populateItemCatalog($("itemSearch").value);});
$("loadItem").addEventListener("click",async()=>{try{await loadCatalogItem();}catch(error){setStatus("loadStatus",error.message||String(error),"error");}});
populateItemCatalog();
for(const id of ["rx","ry","rz","scale"])$(id).addEventListener("input",setOrientationFromControls);
$("resetView").addEventListener("click",()=>{if(modelRoot)for(const child of modelRoot.children)child.visible=true;if(voxelGroup)voxelGroup.visible=false;showingVoxels=false;orientation.rotation.set(0,0,0);orientation.scale.setScalar(1);for(const id of ["rx","ry","rz"])$(id).value=0;$("scale").value=1;setOrientationFromControls();fitCamera();});
$("fitView").addEventListener("click",fitCamera);
$("convertBtn").addEventListener("click",()=>{try{setStatus("convertStatus","3D形状をブロックに変換しています…");voxels=voxelize();renderVoxelPreview();currentLayer=1;updateBlueprint();setStatus("convertStatus","変換完了: "+voxels.length.toLocaleString()+"ブロック\n内部構造: "+($("fillMode").value==="solid"?"内部まで充填":"表面のみ"),"ok");}catch(error){setStatus("convertStatus",error.message||String(error),"error");}});
$("layer").addEventListener("input",e=>{currentLayer=Number(e.target.value);renderLayer();});
$("prevLayer").addEventListener("click",()=>{if(currentLayer>1){currentLayer--;$("layer").value=currentLayer;renderLayer();}});
$("nextLayer").addEventListener("click",()=>{if(currentLayer<dimensions.y){currentLayer++;$("layer").value=currentLayer;renderLayer();}});
$("saveLayer").addEventListener("click",()=>{const a=document.createElement("a");a.download="3d-blueprint-layer-"+currentLayer+".png";a.href=$("layerCanvas").toDataURL("image/png");a.click();});
initPalette();initScene();
