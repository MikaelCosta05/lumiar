float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  vec2 u = uv;
  u.x += sin(u.y * 30.0 + time * 4.0) * 0.002 * wobble;
  u.x += (rand(vec2(floor(u.y * 240.0), floor(time * 24.0))) - 0.5) * 0.004 * wobble;

  vec3 col;
  col.r = getColor(u + vec2(bleed, 0.0)).r;
  col.g = getColor(u).g;
  col.b = getColor(u - vec2(bleed, 0.0)).b;

  float scan = sin(uv.y * resolution.y * 1.5) * 0.5 + 0.5;
  col *= 1.0 - lines * 0.25 * scan;

  float grain = rand(uv * resolution + fract(time) * 100.0);
  col += (grain - 0.5) * noise * 0.25;

  // Faixa de "tracking" que desce pela tela
  float bandY = 1.0 - fract(time * 0.12);
  float band = 1.0 - smoothstep(0.0, 0.03, abs(uv.y - bandY));
  col += band * noise * 0.35 * rand(vec2(uv.x * 200.0, time));

  col *= vec3(1.05, 0.98, 1.08);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
