vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  vec2 o1 = vec2(0.12, 0.0) * s * strength;
  vec2 o2 = vec2(-0.06, 0.1) * s * strength;
  vec2 o3 = vec2(-0.06, -0.1) * s * strength;
  vec3 a = vec3(getFromColor(uv + o1).r, getFromColor(uv + o2).g, getFromColor(uv + o3).b);
  vec3 b = vec3(getToColor(uv - o1).r, getToColor(uv - o2).g, getToColor(uv - o3).b);
  return vec4(mix(a, b, smoothstep(0.4, 0.6, progress)), 1.0);
}
