vec4 transition(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float d = length(p);
  float r = progress * 1.3;
  float s = sin(progress * PI);
  float ring = exp(-pow((d - r) * 10.0, 2.0)) * s;
  vec2 q = uv - normalize(p + 1e-5) / aspect * ring * 0.06 * strength;
  float m = 1.0 - smoothstep(r - 0.05, r, d);
  vec4 col = mix(getFromColor(q), getToColor(q), m);
  return vec4(col.rgb + ring * 0.35 * strength, 1.0);
}
