import { t } from '../i18n';

export class ShaderError extends Error {}

/** O navegador (ou a placa de vídeo) não oferece WebGL2: o editor não tem como desenhar. */
export class WebGL2Unavailable extends Error {
  constructor() {
    super(t('Seu navegador não suporta WebGL2.'));
  }
}

/** Testa se dá para criar um contexto WebGL2 (num canvas descartável, liberado logo em seguida). */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export interface UniformInfo {
  location: WebGLUniformLocation;
  type: number;
}

export interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Map<string, UniformInfo>;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? t('erro desconhecido');
    gl.deleteShader(shader);
    throw new ShaderError(log);
  }
  return shader;
}

export function compileProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): CompiledProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fs: WebGLShader;
  try {
    fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  } catch (error) {
    gl.deleteShader(vs);
    throw error;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? t('erro desconhecido');
    gl.deleteProgram(program);
    throw new ShaderError(log);
  }

  // Uniforms não usados pelo shader são removidos pelo compilador, então só guardamos os ativos.
  const uniforms = new Map<string, UniformInfo>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    const location = info && gl.getUniformLocation(program, info.name);
    if (info && location) uniforms.set(info.name, { location, type: info.type });
  }
  return { program, uniforms };
}

export function setUniform(
  gl: WebGL2RenderingContext,
  compiled: CompiledProgram,
  name: string,
  value: number | number[],
): void {
  const info = compiled.uniforms.get(name);
  if (!info) return;
  const v = typeof value === 'number' ? [value] : value;
  switch (info.type) {
    case gl.FLOAT:
      gl.uniform1f(info.location, v[0] ?? 0);
      break;
    case gl.FLOAT_VEC2:
      gl.uniform2f(info.location, v[0] ?? 0, v[1] ?? 0);
      break;
    case gl.FLOAT_VEC3:
      gl.uniform3f(info.location, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
      break;
    case gl.FLOAT_VEC4:
      gl.uniform4f(info.location, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
      break;
    case gl.INT:
    case gl.BOOL:
    case gl.SAMPLER_2D:
    case gl.SAMPLER_3D:
    case gl.SAMPLER_2D_ARRAY:
      gl.uniform1i(info.location, Math.round(v[0] ?? 0));
      break;
  }
}

export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createTarget(gl: WebGL2RenderingContext, width: number, height: number): RenderTarget {
  const texture = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer };
}

export function deleteTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}
