import test from "node:test";
import assert from "node:assert/strict";
import { extractGeometryDefinitions, validateGeometry, applyGeometryVariants, resolveAttachableGeometry } from "../3d/bedrock-parser.js";

const modern = {"minecraft:geometry":[{description:{identifier:"geometry.test"},bones:[{name:"root",pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[8,16,8],uv:[0,0]}]}]}]};
test("extracts modern geometry",()=>assert.equal(extractGeometryDefinitions(modern).length,1));
test("extracts legacy geometry.* definitions",()=>assert.equal(extractGeometryDefinitions({"geometry.legacy":{bones:[{name:"root"}]}})[0].description.identifier,"geometry.legacy"));
test("validates a basic bone and cube",()=>assert.equal(validateGeometry(modern["minecraft:geometry"][0]).valid,true));
test("rejects unrelated JSON",()=>assert.throws(()=>extractGeometryDefinitions({elements:[]})));
test("reports invalid cube dimensions",()=>{const g=structuredClone(modern["minecraft:geometry"][0]);g.bones[0].cubes[0].size=[-1,16,8];assert.equal(validateGeometry(g).valid,false);});
test("applies generic reset and inflate patches",()=>{const base=extractGeometryDefinitions(modern)[0];const data={"geometry.variant":{bones:[{name:"root",inflate:1},{name:"gone",reset:true}]}};const out=applyGeometryVariants(base,data,["geometry.variant"]);assert.equal(out.bones[0].cubes[0].inflate,1);});
test("resolves attachable geometry reference",()=>{const a={"minecraft:attachable":{description:{identifier:"item.test",geometry:{default:"geometry.test"}}}};const out=resolveAttachableGeometry(a,modern);assert.equal(out.geometryRef,"geometry.test");});


test("resolves legacy geometry inheritance from base through armor variants",()=>{
  const data={
    "geometry.player.armor.base":{texturewidth:64,textureheight:32,bones:[
      {name:"body",cubes:[{origin:[-4,12,-2],size:[8,12,4],uv:[16,16]}]},
      {name:"head",cubes:[{origin:[-4,24,-4],size:[8,8,8],uv:[0,0]}]},
      {name:"hat",neverRender:true,cubes:[{origin:[-4,24,-4],size:[8,8,8],uv:[32,0],inflate:.5}]},
      {name:"rightArm",cubes:[{origin:[-8,12,-2],size:[4,12,4],uv:[40,16]}]}
    ]},
    "geometry.player.armor1:geometry.player.armor.base":{bones:[
      {name:"head",inflate:1},{name:"hat",inflate:1.5,neverRender:false},{name:"body",inflate:1.01},{name:"rightArm",inflate:1}
    ]},
    "geometry.player.armor.helmet:geometry.player.armor1":{bones:[
      {name:"body",reset:true},{name:"rightArm",reset:true}
    ]}
  };
  const attach={"minecraft:attachable":{description:{identifier:"minecraft:test.player",geometry:{default:"geometry.player.armor.helmet"}}}};
  const out=resolveAttachableGeometry(attach,data);
  assert.deepEqual(out.inheritance,["geometry.player.armor.base","geometry.player.armor1","geometry.player.armor.helmet"]);
  assert.deepEqual(out.geometry.bones.map(b=>b.name),["head","hat"]);
  assert.equal(out.geometry.bones[0].cubes[0].inflate,1);
  assert.equal(out.geometry.bones[1].cubes[0].inflate,2);
  assert.equal(out.geometry.bones[1].neverRender,false);
});
