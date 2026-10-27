float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

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

vec4 transition(vec2 uv) {
  vec4 v = voronoi(uv * vec2(ratio, 1.0) * pieces);
  float edge = v.y - v.x;
  float delay = hash(v.zw) * 0.5;
  float t = clamp((progress - delay) / 0.5, 0.0, 1.0);
  if (edge < t * 1.5) return getToColor(uv);
  vec3 from = getFromColor(uv + vec2(0.0, t * t * 0.3)).rgb;
  float crack = (1.0 - smoothstep(0.0, 0.04, edge)) * smoothstep(0.0, 0.15, progress) * (1.0 - t);
  return vec4(from + crack, 1.0);
}
