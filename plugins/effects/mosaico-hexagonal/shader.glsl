vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 p = uv * resolution / (size * k);
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec4 c = getColor((p - g) * size * k / resolution);
  vec2 ag = abs(g);
  float hd = max(dot(ag, normalize(r)), ag.x);
  return vec4(c.rgb * (1.0 - gap * smoothstep(0.42, 0.5, hd)), 1.0);
}
