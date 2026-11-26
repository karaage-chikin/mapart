export function extractGeometryDefinitions(data) {
  if (!data || typeof data !== "object") throw new TypeError("JSONのルートがオブジェクトではありません。");
  const modern = data["minecraft:geometry"];
  if (Array.isArray(modern)) return modern.filter(item => item && typeof item === "object" && Array.isArray(item.bones));
  // Bedrock legacy geometry files store identifiers as object keys.
  const legacy = Object.entries(data).filter(([key, value]) => key.startsWith("geometry.") && value && typeof value === "object" && Array.isArray(value.bones));
  if (legacy.length) return legacy.map(([identifier, value]) => ({
    description: { ...(value.description || {}), identifier: value.description?.identifier || identifier },
    bones: value.bones
  }));
  throw new Error("minecraft:geometry または旧形式の geometry.* 定義が見つかりません。");
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
      if (cube.uv != null && !Array.isArray(cube.uv) && (typeof cube.uv !== "object" || Array.isArray(cube.uv))) errors.push("Bone " + bone.name + " に不正なUVがあります。");
    }
  }
  return { valid: errors.length === 0, errors, identifier: description?.identifier || "unknown", boneCount: geometry?.bones?.length || 0 };
}

export function cloneGeometry(geometry) {
  return JSON.parse(JSON.stringify(geometry));
}

/** Apply Bedrock geometry variant patches by identifier, preserving unmentioned bone properties. */
export function applyGeometryVariants(baseGeometry, geometryData, identifiers = []) {
  const result = cloneGeometry(baseGeometry);
  const definitions = extractGeometryDefinitions(geometryData);
  for (const identifier of identifiers) {
    const patch = definitions.find(item => item.description?.identifier === identifier);
    if (!patch) continue;
    for (const change of patch.bones || []) {
      const index = result.bones.findIndex(bone => bone.name === change.name);
      if (change.reset) {
        if (index >= 0) result.bones.splice(index, 1);
        continue;
      }
      if (index < 0) {
        result.bones.push(cloneGeometry({bones:[change]}).bones[0]);
        continue;
      }
      const target = result.bones[index];
      if (change.cubes) target.cubes = cloneGeometry({bones:[{name:"patch",cubes:change.cubes}]}).bones[0].cubes;
      for (const [key, value] of Object.entries(change)) {
        if (key === "name" || key === "cubes" || key === "reset") continue;
        if (key === "inflate" && Number.isFinite(Number(value))) {
          target.cubes = (target.cubes || []).map(cube => ({...cube, inflate:Number(cube.inflate || 0) + Number(value)}));
        } else target[key] = value;
      }
    }
  }
  return result;
}

export function resolveAttachableGeometry(attachableData, geometryData, preferredKey = "default") {
  const desc = attachableData?.["minecraft:attachable"]?.description;
  const geometryRef = desc?.geometry?.[preferredKey] || desc?.geometry?.default;
  if (!geometryRef) throw new Error("AttachableにGeometry参照がありません。");
  const definitions = extractGeometryDefinitions(geometryData);
  const base = definitions.find(item => item.description?.identifier === geometryRef);
  if (!base) throw new Error("参照Geometry " + geometryRef + " が見つかりません。");
  const variants = Object.keys(geometryData).filter(key => key.startsWith("geometry.") && key !== geometryRef);
  const resolved = applyGeometryVariants(base, geometryData, variants);
  resolved.description = {...(resolved.description || {}), identifier: desc.identifier + " / " + geometryRef};
  return { geometry: resolved, geometryRef, attachable: desc };
}
