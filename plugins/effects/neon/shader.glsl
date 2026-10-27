float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 effect(vec2 uv) {
  vec2 px = thickness / resolution;
  float tl = luma(getColor(uv + px * vec2(-1.0, 1.0)).rgb);
  float t = luma(getColor(uv + px * vec2(0.0, 1.0)).rgb);
  float tr = luma(getColor(uv + px * vec2(1.0, 1.0)).rgb);
  float l = luma(getColor(uv + px * vec2(-1.0, 0.0)).rgb);
  float r = luma(getColor(uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(getColor(uv + px * vec2(-1.0, -1.0)).rgb);
  float b = luma(getColor(uv + px * vec2(0.0, -1.0)).rgb);
  float br = luma(getColor(uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = clamp(length(vec2(gx, gy)) * 2.0, 0.0, 1.0);
  vec4 c = getColor(uv);
  return vec4(c.rgb * (1.0 - darken) + tint * edge * 1.5, c.a);
}
