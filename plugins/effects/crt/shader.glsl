vec4 effect(vec2 uv) {
  vec2 cc = uv - 0.5;
  float dist = dot(cc, cc) * curvature * 0.6;
  vec2 q = uv + cc * (1.0 + dist) * dist;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 col;
  col.r = getColor(q + vec2(0.0012, 0.0)).r;
  col.g = getColor(q).g;
  col.b = getColor(q - vec2(0.0012, 0.0)).b;
  float scan = 1.0 - lines * 0.35 * (0.5 + 0.5 * sin(q.y * resolution.y * PI * 0.5));
  int sub = int(mod(gl_FragCoord.x, 3.0));
  vec3 triad = sub == 0 ? vec3(1.0, 0.8, 0.8) : (sub == 1 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0));
  col *= scan * mix(vec3(1.0), triad, lines);
  vec2 v = q * (1.0 - q);
  col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.25);
  col *= 1.0 + 0.03 * sin(time * 50.0);
  return vec4(col * 1.15, 1.0);
}
