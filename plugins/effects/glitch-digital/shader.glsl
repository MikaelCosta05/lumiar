float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float t = floor(time * rate);
  vec2 block = floor(uv * vec2(ratio, 1.0) * blocks);
  float h = hash(block + t);
  float hit = step(1.0 - amount * 0.5, h);
  vec2 shift = (hash2(block * 1.3 + t) - 0.5) * 0.2 * amount * hit;
  vec4 c = getColor(uv + shift);
  if (h > 1.0 - amount * 0.12) c.rgb = c.gbr;
  float line = step(0.985, hash(vec2(floor(uv.y * 200.0), t)));
  c.rgb = mix(c.rgb, vec3(1.0) - c.rgb, line * amount);
  return c;
}
