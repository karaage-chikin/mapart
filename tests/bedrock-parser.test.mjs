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
