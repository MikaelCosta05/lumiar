float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

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
  vec2 aspect = vec2(ratio, 1.0);
  vec4 v = voronoi(uv * aspect * pieces);
  vec2 center = (v.zw + hash2(v.zw)) / pieces / aspect;
  float delay = length(center - 0.5) * 0.4;
  float t = clamp((progress - 0.15 - delay) / 0.45, 0.0, 1.0);
  float edge = v.y - v.x;
  float start = smoothstep(0.0, 0.12, progress);
  if (t >= 1.0 || edge < t * 0.9) return getToColor(uv);
  vec2 dir = normalize(center - 0.5 + 1e-4);
  vec2 q = uv - (dir * 0.25 + vec2(0.0, -0.4 * t)) * t;
  vec2 refraction = (hash2(v.zw) - 0.5) * 0.02 * start;
  float crack = (1.0 - smoothstep(0.0, 0.05, edge)) * start * (1.0 - t);
  vec3 col = getFromColor(q + refraction).rgb + crack * 0.8 + (hash(v.zw) - 0.5) * 0.12 * start;
  return vec4(col, 1.0);
}
