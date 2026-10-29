import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import { compileProgram } from '../engine/gl';
import { VERTEX_SHADER } from '../engine/shaders';
import { t } from '../i18n';

export type ParallaxMotion = 'zoom' | 'slide' | 'orbit';

export const PARALLAX_MOTIONS: { id: ParallaxMotion; label: string }[] = [
  { id: 'zoom', label: t('Entrar na foto') },
  { id: 'slide', label: t('Deslizar de lado') },
  { id: 'orbit', label: t('Girar em volta') },
];

/**
 * A partir do mapa de profundidade, cada ponto da foto anda mais ou menos conforme a distância: o que
 * está perto se mexe mais que o fundo, como uma câmera de verdade passando pela cena.
 * (Busca inversa: para cada pixel da saída, acha de onde ele veio, em algumas iterações.)
 */
const PARALLAX_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uShift;
uniform float uZoom;
uniform float uFocus;
void main() {
  vec2 uv = (vUv - 0.5) / uZoom + 0.5;
  vec2 p = uv;
  for (int i = 0; i < 8; i++) {
    float d = texture(uDepth, p).r;
    p = uv - uShift * (d - uFocus);
  }
  outColor = texture(uColor, clamp(p, 0.001, 0.999));
}`;

/** Gera o vídeo da foto 3D (sem som), do tamanho da foto (até 1920 px). */
export async function makeParallax(
  photo: ImageBitmap,
  depth: { data: Uint8Array; width: number; height: number },
  options: { duration: number; motion: ParallaxMotion; strength: number; name: string },
  onProgress?: (fraction: number) => void,
): Promise<File> {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const scale = Math.min(1, 1920 / Math.max(photo.width, photo.height));
  const width = even(photo.width * scale);
  const height = even(photo.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) throw new Error(t('A placa de vídeo não está disponível.'));
  const program = compileProgram(gl, VERTEX_SHADER, PARALLAX_FRAGMENT);
  gl.useProgram(program.program);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, width, height);

  const texture = (unit: number, upload: () => void) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    upload();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  texture(0, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo));
  // Profundidade suavizada um pouco (bordas duras viram rasgos na imagem).
  const blurred = document.createElement('canvas');
  blurred.width = depth.width;
  blurred.height = depth.height;
  const bctx = blurred.getContext('2d')!;
  const raw = new ImageData(depth.width, depth.height);
  for (let i = 0; i < depth.data.length; i++) {
    raw.data[i * 4] = raw.data[i * 4 + 1] = raw.data[i * 4 + 2] = depth.data[i];
    raw.data[i * 4 + 3] = 255;
  }
  const tmp = document.createElement('canvas');
  tmp.width = depth.width;
  tmp.height = depth.height;
  tmp.getContext('2d')!.putImageData(raw, 0, 0);
  bctx.filter = `blur(${Math.max(1, depth.width / 160)}px)`;
  bctx.drawImage(tmp, 0, 0);
  texture(1, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurred));
  gl.uniform1i(gl.getUniformLocation(program.program, 'uColor'), 0);
  gl.uniform1i(gl.getUniformLocation(program.program, 'uDepth'), 1);
  const uShift = gl.getUniformLocation(program.program, 'uShift');
  const uZoom = gl.getUniformLocation(program.program, 'uZoom');
  gl.uniform1f(gl.getUniformLocation(program.program, 'uFocus'), 0.35);

  const avc = await canEncodeVideo('avc', { width, height }).catch(() => false);
  const output = new Output({ format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: avc ? 'avc' : 'vp9', bitrate: QUALITY_HIGH });
  const fps = 30;
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const frames = Math.max(2, Math.round(options.duration * fps));
  const s = 0.045 * options.strength;
  for (let i = 0; i < frames; i++) {
    const p = i / (frames - 1);
    const ease = p * p * (3 - 2 * p);
    let shift: [number, number] = [0, 0];
    let zoom = 1.08;
    if (options.motion === 'zoom') {
      zoom = 1.06 + 0.12 * ease;
      shift = [0, s * 0.6 * ease];
    } else if (options.motion === 'slide') {
      shift = [s * (ease * 2 - 1), 0];
      zoom = 1.1;
    } else {
      const a = ease * Math.PI * 1.4 - Math.PI * 0.7;
      shift = [Math.sin(a) * s, Math.cos(a) * s * 0.5];
      zoom = 1.1;
    }
    gl.uniform2f(uShift, shift[0], shift[1]);
    gl.uniform1f(uZoom, zoom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    await source.add(i / fps, 1 / fps);
    onProgress?.(i / frames);
  }
  source.close();
  await output.finalize();
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  const buffer = (output.target as BufferTarget).buffer!;
  return new File([buffer], `${options.name}.${avc ? 'mp4' : 'webm'}`, { type: avc ? 'video/mp4' : 'video/webm' });
}
