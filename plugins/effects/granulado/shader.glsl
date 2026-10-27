float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec2 cell = floor(uv * resolution / max(size, 1.0));
  float grain = rand(cell + floor(time * 24.0) * 1.7) - 0.5;
  float flick = 1.0 + (rand(vec2(floor(time * 12.0), 3.0)) - 0.5) * flicker * 0.15;
  return vec4(clamp(c.rgb * flick + grain * amount * 0.3, 0.0, 1.0), c.a);
}
