import {
  compileProgram,
  createTarget,
  createTexture,
  deleteTarget,
  setUniform,
  ShaderError,
  type CompiledProgram,
  type RenderTarget,
} from './gl';
import { hexToRgb } from './color';
import { getPlugin, paramDefault } from './registry';
import {
  BLEND_FRAGMENT,
  buildPluginSource,
  COPY_FRAGMENT,
  FLOW_FRAGMENT,
  formatShaderLog,
  OVERLAY_FRAGMENT,
  PLACE_FRAGMENT,
  SOURCE_FRAGMENT,
  VERTEX_SHADER,
  WARP_FRAGMENT,
} from './shaders';
import type { EffectInstance, FilterInstance, ParamValues, ShaderPlugin } from './types';

/** Enquadramento da câmera virtual (ver project/camera.ts). */
export interface LayerCamera {
  zoom: number;
  x: number;
  y: number;
  /** Graus */
  rotation: number;
  fill: boolean;
}

/** Câmera lenta suave: cria o quadro intermediário entre o anterior e o atual. */
export interface LayerInterpolation {
  mode: 'blend' | 'flow';
  /** 0 = quadro anterior, 1 = quadro atual */
  alpha: number;
  /**
   * Quadro anterior: uma imagem para enviar, 'shift' (o quadro atual que já está na GPU
   * passa a ser o anterior antes de enviar o novo) ou null (mantém o que já está lá).
   */
  previous: TexImageSource | 'shift' | null;
}

export interface LayerInput {
  /** Identifica a mídia; a textura dela fica em cache com essa chave. */
  key: string;
  /** Quadro atual. null = reaproveita o último quadro enviado (vídeo ainda carregando). */
  source: TexImageSource | null;
  width: number;
  height: number;
  /** Tempo desde o início do clipe e duração dele (para efeitos animados). */
  time: number;
  duration: number;
  effects: EffectInstance[];
  /** Aplicado depois dos efeitos (correção de cor). */
  filter: FilterInstance | null;
  camera?: LayerCamera | null;
  interpolation?: LayerInterpolation | null;
  /** A mídia ocupa o quadro todo, sem barras (camadas sobrepostas, posicionadas depois). */
  stretch?: boolean;
  /** Girar (0, 90, 180, 270, horário) e espelhar. width/height já vêm trocados quando gira 90°. */
  turn?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Fundo onde a mídia não cobre a tela */
  background?: { kind: 'black' | 'color' | 'blur'; color: string } | null;
}

/** Onde e como uma camada sobreposta aparece na tela. */
export interface LayerPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blend: 'normal' | 'screen' | 'add' | 'multiply';
  chroma: { color: string; similarity: number; smoothness: number } | null;
  radius: number;
}

export interface PlacedLayer extends LayerInput {
  place: LayerPlacement;
}

export interface TransitionInput {
  pluginId: string;
  params: ParamValues;
  progress: number;
}

/**
 * Pacote de edição: filtro, efeitos e câmera aplicados sobre a imagem já montada
 * (trilha principal + sobreposições), só no trecho em que o bloco está.
 */
export interface AdjustInput {
  /** Tempo desde o início do bloco e duração dele (para efeitos animados). */
  time: number;
  duration: number;
  effects: EffectInstance[];
  filter: FilterInstance | null;
  camera: LayerCamera | null;
  /** 0 a 1: mistura com a imagem sem o pacote (intensidade e entrada/saída suaves). */
  amount: number;
}

export interface FrameInput {
  a: LayerInput | null;
  b: LayerInput | null;
  transition: TransitionInput | null;
  /** Trilhas de vídeo extras, desenhadas por cima da principal na ordem da lista. */
  layers?: PlacedLayer[];
  /** Pacotes de edição, aplicados em ordem depois das camadas e antes dos textos. */
  adjust?: AdjustInput[];
  /** Imagem transparente desenhada por cima de tudo (textos). */
  overlay?: TexImageSource | null;
}

/** O fluxo de movimento é calculado numa imagem 4× menor (bem mais rápido). */
const FLOW_DOWNSCALE = 4;
const SLOT = 3;

/**
 * Pipeline de cada quadro, todo na GPU:
 *   mídia A → câmera/encaixe → (quadro intermediário) → efeitos → filtro ─┐
 *                                                                         ├→ transição → camadas → pacotes → texto → tela
 *   mídia B → câmera/encaixe → (quadro intermediário) → efeitos → filtro ─┘
 * Cada camada usa framebuffers em "ping-pong" para empilhar efeitos.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private width = 0;
  private height = 0;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quad: WebGLBuffer;
  private readonly sourceProgram: CompiledProgram;
  private readonly copyProgram: CompiledProgram;
  private readonly overlayProgram: CompiledProgram;
  private readonly blendProgram: CompiledProgram;
  private readonly flowProgram: CompiledProgram;
  private readonly warpProgram: CompiledProgram;
  private readonly placeProgram: CompiledProgram;
  private overlayTexture: WebGLTexture | null = null;
  private readonly sourceTextures = new Map<string, WebGLTexture>();
  private readonly previousTextures = new Map<string, WebGLTexture>();
  /** Última imagem estática enviada para cada textura (evita reenviar a mesma foto todo quadro). */
  private readonly staticSources = new Map<string, TexImageSource>();
  /** 3 por camada: [A0, A1, A2, B0, B1, B2] */
  private targets: RenderTarget[] = [];
  /** Imagem montada antes dos pacotes de edição (duas, em ping-pong). */
  private compose: RenderTarget[] = [];
  /** Onde a montagem é desenhada: a tela (null) ou compose, quando há pacotes no quadro. */
  private screen: RenderTarget | null = null;
  /** Imagens reduzidas para o fluxo de movimento: [anterior, atual, fluxo] */
  private small: RenderTarget[] = [];
  /** null = shader com erro (não tenta compilar de novo). */
  private readonly plugins = new Map<string, CompiledProgram | null>();

  onShaderError?: (plugin: ShaderPlugin, message: string) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    width: number,
    height: number,
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      // Necessário para capturar o canvas na exportação.
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('Seu navegador não suporta WebGL2.');
    this.gl = gl;

    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sourceProgram = compileProgram(gl, VERTEX_SHADER, SOURCE_FRAGMENT);
    this.copyProgram = compileProgram(gl, VERTEX_SHADER, COPY_FRAGMENT);
    this.overlayProgram = compileProgram(gl, VERTEX_SHADER, OVERLAY_FRAGMENT);
    this.blendProgram = compileProgram(gl, VERTEX_SHADER, BLEND_FRAGMENT);
    this.flowProgram = compileProgram(gl, VERTEX_SHADER, FLOW_FRAGMENT);
    this.warpProgram = compileProgram(gl, VERTEX_SHADER, WARP_FRAGMENT);
    this.placeProgram = compileProgram(gl, VERTEX_SHADER, PLACE_FRAGMENT);
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    const gl = this.gl;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.targets.forEach((t) => deleteTarget(gl, t));
    this.compose.forEach((t) => deleteTarget(gl, t));
    this.small.forEach((t) => deleteTarget(gl, t));
    this.targets = Array.from({ length: SLOT * 2 }, () => createTarget(gl, width, height));
    this.compose = Array.from({ length: 2 }, () => createTarget(gl, width, height));
    this.small = Array.from({ length: 3 }, () => createTarget(gl, this.smallWidth, this.smallHeight));
    for (const t of this.small.slice(0, 2)) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
  }

  private get smallWidth() {
    return Math.max(1, Math.round(this.width / FLOW_DOWNSCALE));
  }

  private get smallHeight() {
    return Math.max(1, Math.round(this.height / FLOW_DOWNSCALE));
  }

  render(frame: FrameInput): void {
    this.gl.bindVertexArray(this.vao);
    const adjust = (frame.adjust ?? []).filter((a) => a.amount > 0.001);
    // Com pacotes, a montagem vai para uma imagem intermediária em vez de direto para a tela.
    this.screen = adjust.length ? this.compose[0] : null;
    this.drawBase(frame);
    // A trilha principal já está desenhada: os alvos podem ser reaproveitados pelas camadas.
    for (const layer of frame.layers ?? []) {
      if (layer.place.opacity <= 0.001 || layer.place.scale <= 0) continue;
      this.drawPlaced(this.renderLayer(layer, 0), layer);
    }
    if (adjust.length) {
      let current = this.compose[0];
      for (const a of adjust) current = this.drawAdjust(a, current, current === this.compose[0] ? this.compose[1] : this.compose[0]);
      this.screen = null;
      this.bindOutput(null);
      this.gl.useProgram(this.copyProgram.program);
      this.bindTexture(0, current.texture);
      setUniform(this.gl, this.copyProgram, 'uTexture', 0);
      this.draw();
    }
    if (frame.overlay) this.drawOverlay(frame.overlay);
  }

  /** Libera as texturas de uma mídia removida do projeto. */
  releaseSource(key: string): void {
    for (const map of [this.sourceTextures, this.previousTextures]) {
      const texture = map.get(key);
      if (texture) this.gl.deleteTexture(texture);
      map.delete(key);
    }
    this.staticSources.delete(key);
  }

  dispose(): void {
    const gl = this.gl;
    this.sourceTextures.forEach((t) => gl.deleteTexture(t));
    this.previousTextures.forEach((t) => gl.deleteTexture(t));
    this.sourceTextures.clear();
    this.previousTextures.clear();
    this.staticSources.clear();
    this.targets.forEach((t) => deleteTarget(gl, t));
    this.compose.forEach((t) => deleteTarget(gl, t));
    this.small.forEach((t) => deleteTarget(gl, t));
    this.targets = [];
    this.compose = [];
    this.small = [];
    this.plugins.forEach((p) => p && gl.deleteProgram(p.program));
    this.plugins.clear();
    for (const p of [this.sourceProgram, this.copyProgram, this.overlayProgram, this.blendProgram, this.flowProgram, this.warpProgram, this.placeProgram]) {
      gl.deleteProgram(p.program);
    }
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quad);
  }

  private drawBase(frame: FrameInput): void {
    const gl = this.gl;
    if (!frame.a) {
      this.bindOutput(this.screen);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    let output = this.renderLayer(frame.a, 0);
    if (frame.b && frame.transition) {
      const b = this.renderLayer(frame.b, SLOT);
      if (this.drawTransition(frame.transition, output, b)) return;
      // Shader da transição com erro: faz um corte seco no meio.
      if (frame.transition.progress >= 0.5) output = b;
    }
    this.bindOutput(this.screen);
    gl.useProgram(this.copyProgram.program);
    this.bindTexture(0, output.texture);
    setUniform(gl, this.copyProgram, 'uTexture', 0);
    this.draw();
  }

  /** Mistura a sobreposição (com transparência) por cima do que já está na tela. */
  private drawOverlay(source: TexImageSource): void {
    const gl = this.gl;
    this.overlayTexture ??= createTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    this.bindOutput(null);
    gl.useProgram(this.overlayProgram.program);
    this.bindTexture(0, this.overlayTexture);
    setUniform(gl, this.overlayProgram, 'uTexture', 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.draw();
    gl.disable(gl.BLEND);
  }

  /** Coloca uma camada já processada no lugar dela, por cima do que está na tela. */
  private drawPlaced(source: RenderTarget, layer: PlacedLayer): void {
    const gl = this.gl;
    const { place } = layer;
    const [fitW, fitH] = this.fitScale(layer.width, layer.height);
    this.bindOutput(this.screen);
    gl.useProgram(this.placeProgram.program);
    this.bindTexture(0, source.texture);
    const p = this.placeProgram;
    setUniform(gl, p, 'uTexture', 0);
    setUniform(gl, p, 'uCenter', [place.x, place.y]);
    setUniform(gl, p, 'uSize', [fitW * place.scale, fitH * place.scale]);
    setUniform(gl, p, 'uAngle', (place.rotation * Math.PI) / 180);
    setUniform(gl, p, 'uRatio', this.width / this.height);
    setUniform(gl, p, 'uOpacity', Math.min(1, Math.max(0, place.opacity)));
    setUniform(gl, p, 'uRadius', Math.min(0.5, Math.max(0, place.radius)));
    setUniform(gl, p, 'uKey', place.chroma ? hexToRgb(place.chroma.color) : [0, 1, 0]);
    setUniform(gl, p, 'uKeyParams', place.chroma ? [place.chroma.similarity, place.chroma.smoothness] : [-1, 0]);
    setUniform(gl, p, 'uPixel', [1 / this.width, 1 / this.height]);
    gl.enable(gl.BLEND);
    // Alfa pré-multiplicado: cada modo é só uma combinação diferente com o fundo.
    if (place.blend === 'screen') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else if (place.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else if (place.blend === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.draw();
    gl.disable(gl.BLEND);
  }

  private renderLayer(layer: LayerInput, base: number): RenderTarget {
    const texture = this.uploadSource(layer);
    const [t0, t1, t2] = this.targets.slice(base, base + SLOT);

    const interp = layer.interpolation;
    const previous = this.previousTextures.get(layer.key);
    if (interp && previous && interp.alpha > 0.001 && interp.alpha < 0.999) {
      // Os dois quadros passam pela mesma câmera e depois viram um quadro intermediário.
      this.drawSource(layer, previous, t1);
      this.drawSource(layer, texture, t2);
      if (interp.mode === 'flow') this.drawFlow(t1, t2, interp.alpha, t0);
      else this.drawBlend(t1, t2, interp.alpha, t0);
    } else if (interp && previous && interp.alpha <= 0.001) {
      // Exatamente no quadro anterior: mostra ele mesmo.
      this.drawSource(layer, previous, t0);
    } else {
      this.drawSource(layer, texture, t0);
    }
    return this.drawLook(layer, t0, t1);
  }

  /** Empilha os efeitos e depois o filtro, alternando entre os dois alvos. Devolve o alvo com o resultado. */
  private drawLook(
    layer: Pick<LayerInput, 'effects' | 'filter' | 'time' | 'duration'>,
    current: RenderTarget,
    spare: RenderTarget,
  ): RenderTarget {
    const gl = this.gl;
    for (const effect of layer.effects) {
      if (!effect.enabled) continue;
      const plugin = getPlugin(effect.pluginId);
      const compiled = plugin && this.getProgram(plugin);
      if (!plugin || !compiled) continue;

      this.bindOutput(spare);
      gl.useProgram(compiled.program);
      this.bindTexture(0, current.texture);
      setUniform(gl, compiled, 'uInput', 0);
      setUniform(gl, compiled, 'time', layer.time);
      setUniform(gl, compiled, 'duration', layer.duration);
      this.setCommonUniforms(compiled);
      this.setParams(compiled, plugin, effect.params);
      this.draw();
      [current, spare] = [spare, current];
    }

    const filter = layer.filter;
    const filterPlugin = filter && filter.intensity > 0 ? getPlugin(filter.pluginId) : undefined;
    const filterProgram = filterPlugin && this.getProgram(filterPlugin);
    if (filter && filterPlugin && filterProgram) {
      this.bindOutput(spare);
      gl.useProgram(filterProgram.program);
      this.bindTexture(0, current.texture);
      setUniform(gl, filterProgram, 'uInput', 0);
      setUniform(gl, filterProgram, 'time', layer.time);
      setUniform(gl, filterProgram, 'duration', layer.duration);
      setUniform(gl, filterProgram, 'intensity', filter.intensity);
      this.setCommonUniforms(filterProgram);
      this.setParams(filterProgram, filterPlugin, filter.params);
      this.draw();
      current = spare;
    }
    return current;
  }

  /**
   * Pacote de edição: câmera (zoom, giro…) → efeitos → filtro sobre a imagem montada,
   * misturado com ela pela intensidade. O resultado vai para `out`.
   */
  private drawAdjust(adjust: AdjustInput, input: RenderTarget, out: RenderTarget): RenderTarget {
    const [t0, t1] = this.targets;
    // A imagem montada já está na orientação do GL (linha 0 embaixo): flipY desfaz a inversão
    // que o shader de origem faz para as mídias.
    const view: LayerInput = {
      key: '',
      source: null,
      width: this.width,
      height: this.height,
      time: adjust.time,
      duration: adjust.duration,
      effects: [],
      filter: null,
      camera: adjust.camera && { ...adjust.camera, fill: false },
      stretch: true,
      flipY: true,
    };
    this.drawSource(view, input.texture, t0);
    const result = this.drawLook(adjust, t0, t1);
    this.drawBlend(input, result, Math.min(1, adjust.amount), out);
    return out;
  }

  /** Desenha a mídia com encaixe e câmera no alvo indicado. */
  private drawSource(layer: LayerInput, texture: WebGLTexture, target: RenderTarget): void {
    const gl = this.gl;
    const cam = layer.camera;
    this.bindOutput(target);
    gl.useProgram(this.sourceProgram.program);
    this.bindTexture(0, texture);
    setUniform(gl, this.sourceProgram, 'uTexture', 0);
    setUniform(gl, this.sourceProgram, 'uScale', layer.stretch ? [1, 1] : this.fitScale(layer.width, layer.height));
    setUniform(gl, this.sourceProgram, 'uRatio', this.width / this.height);
    setUniform(gl, this.sourceProgram, 'uCamera', cam
      ? [cam.x, cam.y, Math.max(0.05, cam.zoom), (cam.rotation * Math.PI) / 180]
      : [0.5, 0.5, 1, 0]);
    setUniform(gl, this.sourceProgram, 'uFill', cam?.fill ? 1 : 0);
    setUniform(gl, this.sourceProgram, 'uTurn', Math.round(((layer.turn ?? 0) % 360) / 90));
    setUniform(gl, this.sourceProgram, 'uFlip', [layer.flipX ? 1 : 0, layer.flipY ? 1 : 0]);
    const bg = layer.stretch ? null : layer.background;
    setUniform(gl, this.sourceProgram, 'uBgMode', bg?.kind === 'blur' ? 2 : bg?.kind === 'color' ? 1 : 0);
    setUniform(gl, this.sourceProgram, 'uBgColor', bg?.kind === 'color' ? hexToRgb(bg.color) : [0, 0, 0]);
    this.draw();
  }

  private drawBlend(a: RenderTarget, b: RenderTarget, alpha: number, target: RenderTarget): void {
    const gl = this.gl;
    this.bindOutput(target);
    gl.useProgram(this.blendProgram.program);
    this.bindTexture(0, a.texture);
    this.bindTexture(1, b.texture);
    setUniform(gl, this.blendProgram, 'uPrev', 0);
    setUniform(gl, this.blendProgram, 'uNext', 1);
    setUniform(gl, this.blendProgram, 'uAlpha', alpha);
    this.draw();
    this.bindTexture(1, null);
  }

  /** Estima o movimento entre os dois quadros (imagem reduzida) e cria o quadro do meio. */
  private drawFlow(a: RenderTarget, b: RenderTarget, alpha: number, target: RenderTarget): void {
    const gl = this.gl;
    const [smallA, smallB, flow] = this.small;
    const texel = [1 / this.smallWidth, 1 / this.smallHeight];

    for (const [src, dst] of [[a, smallA], [b, smallB]] as const) {
      this.bindSmall(dst);
      gl.useProgram(this.copyProgram.program);
      this.bindTexture(0, src.texture);
      setUniform(gl, this.copyProgram, 'uTexture', 0);
      this.draw();
      // Versões borradas (mipmaps) para a busca grossa do movimento.
      gl.bindTexture(gl.TEXTURE_2D, dst.texture);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    this.bindSmall(flow);
    gl.useProgram(this.flowProgram.program);
    this.bindTexture(0, smallA.texture);
    this.bindTexture(1, smallB.texture);
    setUniform(gl, this.flowProgram, 'uPrev', 0);
    setUniform(gl, this.flowProgram, 'uNext', 1);
    setUniform(gl, this.flowProgram, 'uTexel', texel);
    this.draw();

    this.bindOutput(target);
    gl.useProgram(this.warpProgram.program);
    this.bindTexture(0, a.texture);
    this.bindTexture(1, b.texture);
    this.bindTexture(2, flow.texture);
    setUniform(gl, this.warpProgram, 'uPrev', 0);
    setUniform(gl, this.warpProgram, 'uNext', 1);
    setUniform(gl, this.warpProgram, 'uFlow', 2);
    setUniform(gl, this.warpProgram, 'uAlpha', alpha);
    setUniform(gl, this.warpProgram, 'uTexel', texel);
    this.draw();
    this.bindTexture(1, null);
    this.bindTexture(2, null);
  }

  private drawTransition(transition: TransitionInput, from: RenderTarget, to: RenderTarget): boolean {
    const gl = this.gl;
    const plugin = getPlugin(transition.pluginId);
    const compiled = plugin && this.getProgram(plugin);
    if (!plugin || !compiled) return false;

    this.bindOutput(this.screen);
    gl.useProgram(compiled.program);
    this.bindTexture(0, from.texture);
    this.bindTexture(1, to.texture);
    setUniform(gl, compiled, 'uFrom', 0);
    setUniform(gl, compiled, 'uTo', 1);
    setUniform(gl, compiled, 'progress', Math.min(1, Math.max(0, transition.progress)));
    this.setCommonUniforms(compiled);
    this.setParams(compiled, plugin, transition.params);
    this.draw();
    this.bindTexture(1, null);
    return true;
  }

  private ensureTexture(map: Map<string, WebGLTexture>, key: string): WebGLTexture {
    let texture = map.get(key);
    if (!texture) {
      const gl = this.gl;
      texture = createTexture(gl);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      map.set(key, texture);
    }
    return texture;
  }

  private uploadSource(layer: LayerInput): WebGLTexture {
    const gl = this.gl;
    const previous = layer.interpolation?.previous;
    if (previous === 'shift' && layer.source) {
      // O quadro atual vira o anterior trocando as texturas (sem copiar pixels).
      const current = this.ensureTexture(this.sourceTextures, layer.key);
      const old = this.ensureTexture(this.previousTextures, layer.key);
      this.previousTextures.set(layer.key, current);
      this.sourceTextures.set(layer.key, old);
    } else if (previous && previous !== 'shift') {
      gl.bindTexture(gl.TEXTURE_2D, this.ensureTexture(this.previousTextures, layer.key));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, previous);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    const texture = this.ensureTexture(this.sourceTextures, layer.key);
    const isStatic = layer.source instanceof ImageBitmap || layer.source instanceof HTMLImageElement;
    if (layer.source && !(isStatic && this.staticSources.get(layer.key) === layer.source)) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.source);
      gl.generateMipmap(gl.TEXTURE_2D);
      if (isStatic) this.staticSources.set(layer.key, layer.source);
      else this.staticSources.delete(layer.key);
    }
    return texture;
  }

  private getProgram(plugin: ShaderPlugin): CompiledProgram | null {
    const cached = this.plugins.get(plugin.id);
    if (cached !== undefined) return cached;

    const { source, lineOffset } = buildPluginSource(plugin);
    let compiled: CompiledProgram | null = null;
    try {
      compiled = compileProgram(this.gl, VERTEX_SHADER, source);
    } catch (error) {
      const message = error instanceof ShaderError ? formatShaderLog(error.message, lineOffset) : String(error);
      console.error(`[Lumiar] erro no shader "${plugin.id}":\n${message}`);
      this.onShaderError?.(plugin, message);
    }
    this.plugins.set(plugin.id, compiled);
    return compiled;
  }

  private setCommonUniforms(compiled: CompiledProgram): void {
    setUniform(this.gl, compiled, 'ratio', this.width / this.height);
    setUniform(this.gl, compiled, 'resolution', [this.width, this.height]);
  }

  private setParams(compiled: CompiledProgram, plugin: ShaderPlugin, values: ParamValues): void {
    for (const def of plugin.params) {
      setUniform(this.gl, compiled, def.id, values[def.id] ?? paramDefault(def));
    }
  }

  /** Quanto da tela a mídia ocupa para caber inteira (barras pretas no resto). */
  private fitScale(mediaWidth: number, mediaHeight: number): number[] {
    const output = this.width / this.height;
    const media = mediaWidth / mediaHeight || output;
    return media > output ? [1, output / media] : [media / output, 1];
  }

  private bindOutput(target: RenderTarget | null): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target ? target.framebuffer : null);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  private bindSmall(target: RenderTarget): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
    this.gl.viewport(0, 0, this.smallWidth, this.smallHeight);
  }

  private bindTexture(unit: number, texture: WebGLTexture | null): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  }

  private draw(): void {
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
}
