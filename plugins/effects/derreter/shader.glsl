float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float drip(float col) {
  float r = hash(vec2(col, 2.0));
  return amount * (0.3 + 0.7 * r) * (0.5 + 0.5 * sin(time * speed + r * 6.2831));
}

vec4 effect(vec2 uv) {
  float col = floor(uv.x * columns);
  float d = mix(drip(col), drip(col + 1.0), smoothstep(0.7, 1.0, fract(uv.x * columns)));
  return getColor(vec2(uv.x, uv.y + d * 0.3));
}
