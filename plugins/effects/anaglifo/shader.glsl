vec4 effect(vec2 uv) {
  vec2 o = vec2(amount, 0.0);
  vec3 left = getColor(uv + o).rgb;
  vec3 right = getColor(uv - o).rgb;
  return vec4(left.r, right.g, right.b, 1.0);
}
