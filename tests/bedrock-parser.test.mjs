import test from "node:test";
import assert from "node:assert/strict";
import { extractGeometryDefinitions, validateGeometry } from "../3d/bedrock-parser.js";

const valid = {
  "minecraft:geometry": [{
    description: { identifier: "geometry.test", texture_width: 16, texture_height: 16 },
    bones: [{ name: "root", pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [8, 16, 8], uv: [0, 0] }] }]
  }]
};

test("extracts Bedrock geometry definitions", () => {
  const definitions = extractGeometryDefinitions(valid);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].description.identifier, "geometry.test");
});

test("validates a basic bone and cube", () => {
  const result = validateGeometry(valid["minecraft:geometry"][0]);
  assert.equal(result.valid, true);
  assert.equal(result.boneCount, 1);
});

test("rejects Java-style or unrelated JSON", () => {
  assert.throws(() => extractGeometryDefinitions({ elements: [] }), /minecraft:geometry/);
});

test("reports invalid cube dimensions", () => {
  const geometry = structuredClone(valid["minecraft:geometry"][0]);
  geometry.bones[0].cubes[0].size = [-1, 16, 8];
  assert.equal(validateGeometry(geometry).valid, false);
});
