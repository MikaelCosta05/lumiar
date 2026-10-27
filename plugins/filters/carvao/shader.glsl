vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(k) / resolution;
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float gx = dot(getColor(uv + vec2(px.x, 0.0)).rgb - getColor(uv - vec2(px.x, 0.0)).rgb, vec3(0.333));
  float gy = dot(getColor(uv + vec2(0.0, px.y)).rgb - getColor(uv - vec2(0.0, px.y)).rgb, vec3(0.333));
  float e = length(vec2(gx, gy)) * 4.0;
  vec3 col = vec3(clamp(l * 0.4 + 0.62 - e, 0.0, 1.0)) * vec3(0.98, 0.96, 0.92);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
