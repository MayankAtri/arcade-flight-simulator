export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export const VEC3_ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const QUAT_IDENTITY: Quat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (v: Vec3, amount: number): Vec3 => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const magnitudeSquared = (v: Vec3): number => dot(v, v);
export const magnitude = (v: Vec3): number => Math.sqrt(magnitudeSquared(v));
export const normalize = (v: Vec3, fallback: Vec3 = VEC3_ZERO): Vec3 => {
  const length = magnitude(v);
  return length > 1e-9 ? scale(v, 1 / length) : { ...fallback };
};
export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const saturate = (value: number): number => clamp(value, 0, 1);
export const smoothstep = (min: number, max: number, value: number): number => {
  const t = saturate((value - min) / Math.max(max - min, 1e-9));
  return t * t * (3 - 2 * t);
};

export const multiplyQuat = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const normalizeQuat = (q: Quat): Quat => {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (length < 1e-9) return { ...QUAT_IDENTITY };
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
};

export const conjugateQuat = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export const rotateVec3 = (q: Quat, v: Vec3): Vec3 => {
  const qv = { x: q.x, y: q.y, z: q.z };
  const uv = cross(qv, v);
  const uuv = cross(qv, uv);
  return add(v, add(scale(uv, 2 * q.w), scale(uuv, 2)));
};

export const quatFromRotationVector = (rotation: Vec3): Quat => {
  const angle = magnitude(rotation);
  if (angle < 1e-9) return { ...QUAT_IDENTITY };
  const half = angle * 0.5;
  const multiplier = Math.sin(half) / angle;
  return normalizeQuat({
    x: rotation.x * multiplier,
    y: rotation.y * multiplier,
    z: rotation.z * multiplier,
    w: Math.cos(half),
  });
};

export const quatFromBasis = (xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quat => {
  const m00 = xAxis.x;
  const m01 = yAxis.x;
  const m02 = zAxis.x;
  const m10 = xAxis.y;
  const m11 = yAxis.y;
  const m12 = zAxis.y;
  const m20 = xAxis.z;
  const m21 = yAxis.z;
  const m22 = zAxis.z;
  const trace = m00 + m11 + m22;
  let q: Quat;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
  }
  return normalizeQuat(q);
};

export const slerpQuat = (from: Quat, to: Quat, t: number): Quat => {
  let target = to;
  let cosine = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;
  if (cosine < 0) {
    target = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
    cosine = -cosine;
  }
  if (cosine > 0.9995) {
    return normalizeQuat({
      x: from.x + (target.x - from.x) * t,
      y: from.y + (target.y - from.y) * t,
      z: from.z + (target.z - from.z) * t,
      w: from.w + (target.w - from.w) * t,
    });
  }
  const theta = Math.acos(clamp(cosine, -1, 1));
  const sinTheta = Math.sin(theta);
  const a = Math.sin((1 - t) * theta) / sinTheta;
  const b = Math.sin(t * theta) / sinTheta;
  return normalizeQuat({
    x: from.x * a + target.x * b,
    y: from.y * a + target.y * b,
    z: from.z * a + target.z * b,
    w: from.w * a + target.w * b,
  });
};
