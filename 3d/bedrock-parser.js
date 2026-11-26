export function extractGeometryDefinitions(data) {
  if (!data || typeof data !== "object") throw new TypeError("JSONのルートがオブジェクトではありません。");
  const list = data["minecraft:geometry"];
  if (!Array.isArray(list)) throw new Error("minecraft:geometry 配列が見つかりません。統合版のGeometry JSONを選択してください。");
  return list.filter(item => item && typeof item === "object" && Array.isArray(item.bones));
}

export function validateGeometry(geometry) {
  const errors = [];
  const description = geometry?.description;
  if (!Array.isArray(geometry?.bones) || geometry.bones.length === 0) errors.push("bones がありません。");
  const names = new Set();
  for (const bone of geometry?.bones || []) {
    if (!bone || typeof bone.name !== "string" || !bone.name) errors.push("name のないBoneがあります。");
    else if (names.has(bone.name)) errors.push("Bone名が重複しています: " + bone.name);
    else names.add(bone.name);
    if (bone.cubes != null && !Array.isArray(bone.cubes)) errors.push("Bone " + (bone.name || "?") + " の cubes が配列ではありません。");
    for (const cube of bone.cubes || []) {
      if (!Array.isArray(cube.origin) || cube.origin.length !== 3 || !Array.isArray(cube.size) || cube.size.length !== 3) {
        errors.push("Bone " + bone.name + " に origin / size が不正なCubeがあります。");
        continue;
      }
      if (cube.size.some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) errors.push("Bone " + bone.name + " に不正なCubeサイズがあります。");
    }
  }
  return { valid: errors.length === 0, errors, identifier: description?.identifier || "unknown", boneCount: geometry?.bones?.length || 0 };
}
