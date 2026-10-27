vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float a = atan(p.y, p.x);
  float s = sin(progress * PI);
  float rays = pow(abs(sin(a * 9.0 + progress * 6.0)), 18.0) + pow(abs(sin(a * 5.0 - progress * 4.0)), 24.0);
  float fall = exp(-length(p) * (3.0 - 2.0 * s));
  vec4 col = mix(getFromColor(uv), getToColor(uv), smoothstep(0.45, 0.55, progress));
  vec3 light = tint * (rays * fall * 1.5 + pow(s, 6.0) * 1.2) * s;
  return vec4(col.rgb + light, 1.0);
}
