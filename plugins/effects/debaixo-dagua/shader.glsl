vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// x = distância até o ponto mais próximo, y = até o segundo, zw = célula
vec4 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + hash2(n + g) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = n + g;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec4(sqrt(d1), sqrt(d2), id);
}

vec4 effect(vec2 uv) {
  vec2 w = vec2(sin(uv.y * 15.0 + time * 2.0), cos(uv.x * 12.0 + time * 1.7)) * 0.004 * strength;
  vec3 c = getColor(uv + w).rgb;
  c = c * vec3(0.6, 0.85, 1.0) + vec3(0.0, 0.05, 0.12);
  vec4 v = voronoi(uv * vec2(ratio, 1.0) * 5.0 + vec2(time * 0.3, time * 0.2));
  float caustic = 1.0 - smoothstep(0.0, 0.12, v.y - v.x);
  c += vec3(0.6, 0.9, 1.0) * caustic * 0.25 * strength * smoothstep(0.2, 1.0, uv.y + 0.3);
  return vec4(c, 1.0);
}
