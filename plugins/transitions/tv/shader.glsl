vec4 transition(vec2 uv) {
  float p = progress < 0.5 ? progress * 2.0 : (1.0 - progress) * 2.0;
  float sy = max(1.0 - p * 1.6, 0.005);
  float sx = max(1.0 - max(p - 0.6, 0.0) * 2.5, 0.005);
  vec2 q = (uv - 0.5) / vec2(sx, sy) + 0.5;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  vec4 img = progress < 0.5 ? getFromColor(q) : getToColor(q);
  return vec4(mix(img.rgb, vec3(1.0), smoothstep(0.3, 1.0, p)) * inside, 1.0);
}
