vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(k) / resolution;
  vec3 blur = (getColor(uv + vec2(px.x, 0.0)).rgb + getColor(uv - vec2(px.x, 0.0)).rgb + getColor(uv + vec2(0.0, px.y)).rgb + getColor(uv - vec2(0.0, px.y)).rgb) * 0.25;
  vec3 col = c.rgb + (c.rgb - blur) * 1.5;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
