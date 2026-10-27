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
  vec2 aspect = vec2(ratio, 1.0);
  vec4 v = voronoi(uv * aspect * cells);
  vec2 center = (v.zw + hash2(v.zw)) / cells / aspect;
  vec3 c = getColor(center).rgb;
  c = mix(c, c * c * 1.6, 0.3);
  c *= 1.15 - 0.35 * v.x;
  float lead = smoothstep(0.02, 0.07, v.y - v.x);
  return vec4(c * lead, 1.0);
}
