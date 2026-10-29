float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb;
  float l = luma(col);
  float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  // Céu cinza: claro, sem cor e no alto do quadro.
  float skyMask = smoothstep(0.5, 0.8, l) * (1.0 - smoothstep(0.12, 0.3, chroma)) * smoothstep(0.35, 0.75, uv.y);
  vec3 blue = vec3(0.42, 0.64, 1.0);
  vec3 skyCol = blue * (l / luma(blue)) * 0.9;
  skyCol = mix(skyCol, vec3(l), smoothstep(0.88, 1.0, l) * 0.7);
  col = mix(col, skyCol, skyMask * sky);
  col *= mix(vec3(1.0), vec3(1.06, 1.02, 0.93), sun * (1.0 - skyMask));
  col = mix(col, sCurve(col, 0.6), sun * 0.6);
  col = saturate(col, 1.0 + sun * 0.4 * (1.0 - chroma));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
