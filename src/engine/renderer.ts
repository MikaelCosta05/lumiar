import {
  compileProgram,
  createTarget,
  createTexture,
  deleteTarget,
  forgetFloatTargets,
  hasFloatTargets,
  setUniform,
  ShaderError,
  WebGL2Unavailable,
  type CompiledProgram,
  type RenderTarget,
} from './gl';
import { hexToRgb } from './color';
import { getPlugin, paramDefault } from './registry';
import {
  BLEND_FRAGMENT,
  buildPluginSource,
  COPY_FRAGMENT,
  FLOW_COARSE_FRAGMENT,
  FLOW_FRAGMENT,
  formatShaderLog,
  HISTORY_FRAGMENT,
  OVERLAY_FRAGMENT,
  PLACE_FRAGMENT,
  PLATE_FRAGMENT,
  MATTE_FRAGMENT,
  COLOR_FRAGMENT,
  pluginInputs,
  PRESENT_FRAGMENT,
  SOURCE_FRAGMENT,
  VERTEX_SHADER,
  WARP_FRAGMENT,
  type PluginInputs,
} from './shaders';
import type { EffectInstance, FilterInstance, ParamValues, ShaderPlugin } from './types';
import { LOD_CALL } from './glslLib';
import { screenToLayerMatrix } from './homography';

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
  /** Máscara da pessoa (mesmo enquadramento da mídia, branco = pessoa): fundo removido e efeitos na pessoa */
  person?: TexImageSource | null;
  /** Mapa de profundidade (mesmo enquadramento da mídia, claro = perto) */
  depth?: TexImageSource | null;
  /** Fundo removido (usa a máscara da pessoa) */
  matte?: LayerMatte | null;
  /** Correção de cor manual e LUT (depois do filtro) */
  color?: LayerColor | null;
  /** Desfoque de movimento da câmera (ver project/motionBlur.ts) */
  motionBlur?: CameraBlur | null;
}

/**
 * Desfoque de movimento: a câmera no começo e no fim da exposição do quadro. A imagem é a média
 * de `samples` vistas espalhadas entre as duas (o borrão segue o movimento e cresce com a velocidade).
 */
export interface CameraBlur {
  from: LayerCamera;
  to: LayerCamera;
  samples: number;
}

/** Desfoque de movimento de uma camada sobreposta que anda na tela (posição, tamanho e giro). */
export interface PlaceBlur {
  from: Pick<LayerPlacement, 'x' | 'y' | 'scale' | 'rotation'>;
  to: Pick<LayerPlacement, 'x' | 'y' | 'scale' | 'rotation'>;
  samples: number;
}

export interface LayerMatte {
  mode: 'cut' | 'blur' | 'color';
  color: string;
}

export interface LayerColor {
  grade: { lift: number[]; gamma: number[]; gain: number[]; saturation: number } | null;
  /** 256×4 bytes: r, g, b e curva geral */
  curves: { key: string; data: Uint8Array } | null;
  lut: { key: string; size: number; data: Uint8Array; amount: number } | null;
}

/** Forma que recorta uma camada sobreposta. */
export interface LayerMask {
  shape: 'ellipse' | 'rect' | 'heart' | 'star' | 'diamond' | 'path';
  /** Forma desenhada à mão: pontos [x, y, x, y, …] dentro da camada (0 a 1, y para baixo), até 32 */
  points?: number[];
  /** Pontos em outros instantes do clipe (a forma acompanha o movimento) */
  keys?: { time: number; points: number[] }[];
  /** Centro e tamanho dentro da camada (0 a 1) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Suavidade da borda (0 a 1) */
  feather: number;
  invert: boolean;
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
  mask?: LayerMask | null;
  /** Tela trocada: a camada é desenhada em perspectiva dentro destes cantos (tela, 0 a 1, y para baixo); x/y/scale/rotation não valem */
  corners?: number[] | null;
}

export interface PlacedLayer extends LayerInput {
  place: LayerPlacement;
  placeBlur?: PlaceBlur | null;
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
  /** Identifica o bloco (efeitos que lembram dos quadros anteriores guardam o estado por ele). */
  key?: string;
  /** Tempo desde o início do bloco e duração dele (para efeitos animados). */
  time: number;
  duration: number;
  effects: EffectInstance[];
  filter: FilterInstance | null;
  camera: LayerCamera | null;
  /** 0 a 1: mistura com a imagem sem o pacote (intensidade e entrada/saída suaves). */
  amount: number;
  /** Desfoque de movimento da câmera do pacote */
  motionBlur?: CameraBlur | null;
  /** Correção de cor manual e LUT do pacote, depois dos efeitos e do filtro (sem = nenhuma passada a mais) */
  color?: LayerColor | null;
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
  /** Textos atrás da pessoa: desenhados logo depois da trilha principal, sumindo onde a pessoa está. */
  behind?: TexImageSource | null;
}

/** O fluxo de movimento é calculado numa imagem 4× menor (bem mais rápido). */
const FLOW_DOWNSCALE = 4;
/** A busca larga do fluxo usa uma grade mais rala ainda (4× de novo): é a parte cara e o movimento muda devagar. */
const FLOW_COARSE = 4;
const SLOT = 3;
/** Quadros guardados para os efeitos com o passado (getPast) e quantos por segundo. */
const HISTORY = 32;
const HISTORY_RATE = 30;
/** Pulo no tempo maior que isso (ou para trás) recomeça os efeitos que lembram do passado. */
const MAX_STEP = 0.5;

/** O que os efeitos de uma camada podem usar além da imagem. */
interface LookContext {
  /** Identifica a camada (o estado de cada efeito fica guardado por camada + efeito) */
  key: string;
  person: RenderTarget | null;
  depth: RenderTarget | null;
}

/** Memória de um efeito entre um quadro e o outro. */
interface EffectState {
  time: number;
  /** Último render em que foi usado (os esquecidos são liberados) */
  used: number;
  state: RenderTarget[] | null;
  read: number;
  plate: RenderTarget[] | null;
  plateRead: number;
  /** Entrada do quadro anterior (para o movimento) */
  last: RenderTarget | null;
  history: { texture: WebGLTexture; framebuffers: WebGLFramebuffer[]; head: number; count: number; pushed: number; rate: number } | null;
}

type StepMode = 'fresh' | 'advance';

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
  // Recriados quando a placa de vídeo devolve o contexto (ver createResources).
  private vao!: WebGLVertexArrayObject;
  private quad!: WebGLBuffer;
  private sourceProgram!: CompiledProgram;
  private copyProgram!: CompiledProgram;
  /** Passa a montagem (16 bits) para a tela com dither, sem faixas nos degradês. */
  private presentProgram!: CompiledProgram;
  private overlayProgram!: CompiledProgram;
  private blendProgram!: CompiledProgram;
  private flowProgram!: CompiledProgram;
  private flowCoarseProgram!: CompiledProgram;
  private warpProgram!: CompiledProgram;
  private placeProgram!: CompiledProgram;
  private matteProgram!: CompiledProgram;
  private colorProgram!: CompiledProgram;
  private historyProgram!: CompiledProgram;
  private plateProgram!: CompiledProgram;
  private readonly matteTextures = new Map<string, WebGLTexture>();
  private readonly depthTextures = new Map<string, WebGLTexture>();
  /** Máscara da pessoa e profundidade já no enquadramento da tela: 0 = clipe A, 1 = clipe B, 2 = camadas */
  private readonly aux = new Map<string, RenderTarget>();
  private readonly effectStates = new Map<string, EffectState>();
  private renderCount = 0;
  /** Pessoa e profundidade da trilha principal no quadro atual (textos atrás da pessoa, pacotes) */
  private basePerson: RenderTarget | null = null;
  private baseDepth: RenderTarget | null = null;
  private blank!: WebGLTexture;
  private blankArray!: WebGLTexture;
  /** Curvas e LUTs já enviadas, pela chave (o conteúdo não muda com a mesma chave). */
  private readonly curveTextures = new Map<string, WebGLTexture>();
  private readonly lutTextures = new Map<string, WebGLTexture>();
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
  /** Imagens reduzidas para o fluxo de movimento: [anterior, atual, fluxo, fluxo grosso] */
  private small: RenderTarget[] = [];
  /** null = shader com erro (não tenta compilar de novo). */
  private readonly plugins = new Map<string, CompiledProgram | null>();
  private readonly sources = new Map<string, string>();

  onShaderError?: (plugin: ShaderPlugin, message: string) => void;
  /** A placa de vídeo tirou o contexto (driver reiniciado, falta de memória…): nada é desenhado até voltar. */
  onContextLost?: () => void;
  /** O contexto voltou: `error` é null quando tudo foi recriado e dá para desenhar de novo. */
  onContextRestored?: (error: unknown) => void;

  /**
   * Fundo transparente (exportar para outro editor): onde não há clipe fica transparente e a transparência das
   * mídias, camadas e textos chega até a saída. As camadas guardam alfa normal (o que os efeitos esperam) e a
   * montagem guarda alfa pré-multiplicado (o que a mistura precisa); a passada final desfaz a pré-multiplicação.
   */
  readonly transparent: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    width: number,
    height: number,
    options: { transparent?: boolean } = {},
  ) {
    this.transparent = !!options.transparent;
    const gl = canvas.getContext('webgl2', {
      alpha: this.transparent,
      antialias: false,
      premultipliedAlpha: false,
      // Necessário para capturar o canvas na exportação.
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new WebGL2Unavailable();
    this.gl = gl;
    this.createResources();
    this.setSize(width, height);
    (canvas as EventTarget).addEventListener('webglcontextlost', this.handleContextLost);
    (canvas as EventTarget).addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private readonly handleContextLost = (e: Event) => {
    // Sem o preventDefault o navegador não devolve o contexto.
    e.preventDefault();
    this.onContextLost?.();
  };

  /**
   * Com o contexto de volta, tudo o que estava na GPU sumiu: as texturas e alvos em cache são
   * esquecidos (sem apagar, já não valem mais) e os programas fixos são compilados de novo.
   * Os shaders dos plugins e as texturas das mídias voltam sozinhos no próximo quadro.
   */
  private readonly handleContextRestored = () => {
    for (const map of [this.sourceTextures, this.previousTextures, this.matteTextures, this.depthTextures, this.curveTextures, this.lutTextures]) map.clear();
    this.staticSources.clear();
    this.plugins.clear();
    this.sources.clear();
    this.aux.clear();
    this.effectStates.clear();
    for (const c of this.contexts) Object.assign(c, { key: '', person: null, depth: null });
    this.basePerson = null;
    this.baseDepth = null;
    this.overlayTexture = null;
    this.targets = [];
    this.compose = [];
    this.small = [];
    this.screen = null;
    forgetFloatTargets(this.gl);
    const { width, height } = this;
    this.width = 0;
    this.height = 0;
    try {
      this.createResources();
      this.setSize(width, height);
      this.onContextRestored?.(null);
    } catch (error) {
      this.onContextRestored?.(error);
    }
  };

  /** Quadrado da tela, programas fixos e texturas vazias. */
  private createResources(): void {
    const gl = this.gl;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sourceProgram = compileProgram(gl, VERTEX_SHADER, SOURCE_FRAGMENT);
    this.copyProgram = compileProgram(gl, VERTEX_SHADER, COPY_FRAGMENT);
    this.presentProgram = compileProgram(gl, VERTEX_SHADER, PRESENT_FRAGMENT);
    this.overlayProgram = compileProgram(gl, VERTEX_SHADER, OVERLAY_FRAGMENT);
    this.blendProgram = compileProgram(gl, VERTEX_SHADER, BLEND_FRAGMENT);
    this.flowProgram = compileProgram(gl, VERTEX_SHADER, FLOW_FRAGMENT);
    this.flowCoarseProgram = compileProgram(gl, VERTEX_SHADER, FLOW_COARSE_FRAGMENT);
    this.warpProgram = compileProgram(gl, VERTEX_SHADER, WARP_FRAGMENT);
    this.placeProgram = compileProgram(gl, VERTEX_SHADER, PLACE_FRAGMENT);
    this.matteProgram = compileProgram(gl, VERTEX_SHADER, MATTE_FRAGMENT);
    this.colorProgram = compileProgram(gl, VERTEX_SHADER, COLOR_FRAGMENT);
    this.historyProgram = compileProgram(gl, VERTEX_SHADER, HISTORY_FRAGMENT);
    this.plateProgram = compileProgram(gl, VERTEX_SHADER, PLATE_FRAGMENT);
    // Texturas vazias para as entradas que o efeito declara mas que não existem agora.
    this.blank = createTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.blankArray = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blankArray);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
    this.aux.forEach((t) => deleteTarget(gl, t));
    this.aux.clear();
    for (const key of [...this.effectStates.keys()]) this.forgetState(key);
    this.targets = Array.from({ length: SLOT * 2 }, () => createTarget(gl, width, height));
    this.compose = Array.from({ length: 2 }, () => createTarget(gl, width, height));
    this.small = Array.from({ length: 3 }, () => createTarget(gl, this.smallWidth, this.smallHeight));
    this.small.push(createTarget(gl, this.coarseWidth, this.coarseHeight));
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

  private get coarseWidth() {
    return Math.max(1, Math.ceil(this.smallWidth / FLOW_COARSE));
  }

  private get coarseHeight() {
    return Math.max(1, Math.ceil(this.smallHeight / FLOW_COARSE));
  }

  /**
   * Desenha o quadro na tela. Com `hidden`, só alimenta a memória dos efeitos (rastro, datamosh, passado…) e a tela
   * continua mostrando o quadro anterior: o preview pausado usa isso para calcular o trecho antes do cursor.
   */
  render(frame: FrameInput, options: { hidden?: boolean } = {}): void {
    // Sem contexto, compilar um shader daria erro (e o plugin ficaria marcado como quebrado).
    if (this.gl.isContextLost()) return;
    this.gl.bindVertexArray(this.vao);
    this.renderCount++;
    const adjust = (frame.adjust ?? []).filter((a) => a.amount > 0.001);
    // Com pacotes (ou com imagens de 16 bits), a montagem vai para uma imagem intermediária em vez de direto
    // para a tela: no fim ela passa para a tela com dither, sem as faixas que os 8 bits fariam nos degradês.
    // Fundo transparente: sempre pela montagem (a mistura pré-multiplicada não pode ir direto para a tela).
    const hidden = !!options.hidden;
    const composing = hidden || adjust.length > 0 || hasFloatTargets(this.gl) || this.transparent;
    this.screen = composing ? this.compose[0] : null;
    this.drawBase(frame);
    if (frame.behind) this.drawOverlay(frame.behind, this.basePerson, true);
    // A trilha principal já está desenhada: os alvos podem ser reaproveitados pelas camadas.
    for (const layer of frame.layers ?? []) {
      if (layer.place.opacity <= 0.001 || layer.place.scale <= 0) continue;
      this.drawPlaced(this.renderLayer(layer, 0, 2), layer);
    }
    let current = this.compose[0];
    for (const a of adjust) current = this.drawAdjust(a, current, current === this.compose[0] ? this.compose[1] : this.compose[0]);
    if (frame.overlay) this.drawOverlay(frame.overlay, null, false, composing ? current : null);
    this.screen = null;
    if (composing && !hidden) {
      this.bindOutput(null);
      this.gl.useProgram(this.presentProgram.program);
      this.bindTexture(0, current.texture);
      setUniform(this.gl, this.presentProgram, 'uTexture', 0);
      setUniform(this.gl, this.presentProgram, 'uTransparent', this.transparent ? 1 : 0);
      this.draw();
    }
    // Efeitos que não aparecem há um tempo liberam a memória.
    for (const [key, st] of this.effectStates) if (this.renderCount - st.used > 240) this.forgetState(key);
  }

  /** Libera as texturas de uma mídia removida do projeto. */
  releaseSource(key: string): void {
    for (const map of [this.sourceTextures, this.previousTextures, this.matteTextures, this.depthTextures]) {
      const texture = map.get(key);
      if (texture) this.gl.deleteTexture(texture);
      map.delete(key);
    }
    this.staticSources.delete(key);
  }

  dispose(): void {
    const gl = this.gl;
    (this.canvas as EventTarget).removeEventListener('webglcontextlost', this.handleContextLost);
    (this.canvas as EventTarget).removeEventListener('webglcontextrestored', this.handleContextRestored);
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
    this.aux.forEach((t) => deleteTarget(gl, t));
    this.aux.clear();
    for (const key of [...this.effectStates.keys()]) this.forgetState(key);
    for (const t of [...this.matteTextures.values(), ...this.depthTextures.values(), ...this.curveTextures.values(), ...this.lutTextures.values(), this.blank, this.blankArray]) {
      gl.deleteTexture(t);
    }
    for (const p of [
      this.sourceProgram,
      this.copyProgram,
      this.overlayProgram,
      this.blendProgram,
      this.flowProgram,
      this.flowCoarseProgram,
      this.warpProgram,
      this.placeProgram,
      this.matteProgram,
      this.colorProgram,
      this.historyProgram,
      this.plateProgram,
    ]) {
      gl.deleteProgram(p.program);
    }
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quad);
  }

  private drawBase(frame: FrameInput): void {
    const gl = this.gl;
    this.basePerson = null;
    this.baseDepth = null;
    if (!frame.a) {
      this.bindOutput(this.screen);
      gl.clearColor(0, 0, 0, this.transparent ? 0 : 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    let output = this.renderLayer(frame.a, 0, 0);
    const from = this.contexts[0];
    this.basePerson = from.person;
    this.baseDepth = from.depth;
    if (frame.b && frame.transition) {
      const b = this.renderLayer(frame.b, SLOT, 1);
      const to = this.contexts[1];
      if (frame.transition.progress >= 0.5) {
        this.basePerson = to.person;
        this.baseDepth = to.depth;
      }
      // Fundo transparente: a transição sai com alfa normal num alvo livre e passa pela cópia pré-multiplicada.
      const spare = this.targets[SLOT * 2 - 1];
      if (this.drawTransition(frame.transition, output, b, from, to, this.transparent ? spare : this.screen)) {
        if (!this.transparent) return;
        output = spare;
      } else if (frame.transition.progress >= 0.5) {
        // Shader da transição com erro: faz um corte seco no meio.
        output = b;
      }
    }
    this.bindOutput(this.screen);
    gl.useProgram(this.copyProgram.program);
    this.bindTexture(0, output.texture);
    setUniform(gl, this.copyProgram, 'uTexture', 0);
    setUniform(gl, this.copyProgram, 'uPremultiply', this.transparent ? 1 : 0);
    this.draw();
    setUniform(gl, this.copyProgram, 'uPremultiply', 0);
  }

  /**
   * Mistura a sobreposição (com transparência) por cima do que já está na tela.
   * Com `mask` (textos atrás da pessoa), vai para a montagem e some onde a pessoa está.
   */
  private drawOverlay(source: TexImageSource, mask: RenderTarget | null, behind: boolean, target: RenderTarget | null = null): void {
    const gl = this.gl;
    this.overlayTexture ??= createTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    this.bindOutput(behind ? this.screen : target);
    gl.useProgram(this.overlayProgram.program);
    this.bindTexture(0, this.overlayTexture);
    this.bindTexture(1, mask?.texture ?? this.blank);
    setUniform(gl, this.overlayProgram, 'uTexture', 0);
    setUniform(gl, this.overlayProgram, 'uMask', 1);
    setUniform(gl, this.overlayProgram, 'uUseMask', mask ? 1 : 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.draw();
    gl.disable(gl.BLEND);
    this.bindTexture(1, null);
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
    // Desfoque de movimento: o shader tira a média das posições entre o começo e o fim da exposição.
    const blur = layer.placeBlur && layer.placeBlur.samples > 1 ? layer.placeBlur : null;
    if (blur) {
      setUniform(gl, p, 'uCenter', [blur.from.x, blur.from.y]);
      setUniform(gl, p, 'uSize', [fitW * blur.from.scale, fitH * blur.from.scale]);
      setUniform(gl, p, 'uAngle', (blur.from.rotation * Math.PI) / 180);
    }
    const end = blur?.to ?? place;
    setUniform(gl, p, 'uCenter2', [end.x, end.y]);
    setUniform(gl, p, 'uSize2', [fitW * end.scale, fitH * end.scale]);
    setUniform(gl, p, 'uAngle2', (end.rotation * Math.PI) / 180);
    setUniform(gl, p, 'uSamples', blur ? Math.min(32, blur.samples) : 1);
    setUniform(gl, p, 'uRatio', this.width / this.height);
    setUniform(gl, p, 'uOpacity', Math.min(1, Math.max(0, place.opacity)));
    setUniform(gl, p, 'uRadius', Math.min(0.5, Math.max(0, place.radius)));
    setUniform(gl, p, 'uKey', place.chroma ? hexToRgb(place.chroma.color) : [0, 1, 0]);
    setUniform(gl, p, 'uKeyParams', place.chroma ? [place.chroma.similarity, place.chroma.smoothness] : [-1, 0]);
    setUniform(gl, p, 'uPixel', [1 / this.width, 1 / this.height]);
    setUniform(gl, p, 'uUseAlpha', this.transparent || layer.matte?.mode === 'cut' ? 1 : 0);
    const mask = place.mask;
    const shapes = { ellipse: 1, rect: 2, heart: 3, star: 4, diamond: 5, path: 6 } as const;
    const path = mask?.shape === 'path' ? (mask.points ?? []).slice(0, 64) : [];
    setUniform(gl, p, 'uMaskShape', mask && (mask.shape !== 'path' || path.length >= 6) ? shapes[mask.shape] : 0);
    if (path.length >= 6) {
      const flat = new Float32Array(64);
      flat.set(path);
      gl.uniform2fv(gl.getUniformLocation(p.program, 'uMaskPath'), flat);
      gl.uniform1i(gl.getUniformLocation(p.program, 'uMaskCount'), path.length / 2);
    }
    setUniform(gl, p, 'uMaskRect', mask ? [mask.x, mask.y, mask.width, mask.height] : [0.5, 0.5, 1, 1]);
    setUniform(gl, p, 'uMaskSoft', mask ? [mask.feather * 0.5, mask.invert ? 1 : 0] : [0, 0]);
    // Tela trocada: cada pixel da tela volta para o ponto da camada pela homografia inversa.
    const pin = place.corners ? screenToLayerMatrix(place.corners) : null;
    setUniform(gl, p, 'uPin', pin ? 1 : 0);
    if (pin) gl.uniformMatrix3fv(gl.getUniformLocation(p.program, 'uPinInverse'), false, pin);
    gl.enable(gl.BLEND);
    // Alfa pré-multiplicado: cada modo é só uma combinação diferente com o fundo.
    if (place.blend === 'screen') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    else if (place.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else if (place.blend === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.draw();
    gl.disable(gl.BLEND);
  }

  /** Pessoa e profundidade de cada camada desenhada por último (0 = A, 1 = B, 2 = camadas). */
  private readonly contexts: LookContext[] = [0, 1, 2].map(() => ({ key: '', person: null, depth: null }));

  private auxTarget(name: string): RenderTarget {
    let target = this.aux.get(name);
    if (!target) {
      target = createTarget(this.gl, this.width, this.height);
      this.aux.set(name, target);
    }
    return target;
  }

  /** Máscara (pessoa ou profundidade) passada pela mesma câmera e encaixe da mídia. */
  private drawAux(layer: LayerInput, textures: Map<string, WebGLTexture>, image: TexImageSource, target: RenderTarget): RenderTarget {
    const gl = this.gl;
    const texture = this.ensureTexture(textures, layer.key);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.drawSource({ ...layer, background: null }, texture, target, false);
    return target;
  }

  private renderLayer(layer: LayerInput, base: number, slot: number): RenderTarget {
    const ctx = this.contexts[slot];
    ctx.key = layer.key;
    ctx.person = layer.person ? this.drawAux(layer, this.matteTextures, layer.person, this.auxTarget(`person${slot}`)) : null;
    ctx.depth = layer.depth ? this.drawAux(layer, this.depthTextures, layer.depth, this.auxTarget(`depth${slot}`)) : null;
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
    let result = this.drawLook(layer, t0, t1, ctx);
    let spare = result === t0 ? t1 : t0;
    if (layer.color && (layer.color.grade || layer.color.curves || layer.color.lut)) {
      this.drawColor(layer.color, result, spare);
      [result, spare] = [spare, result];
    }
    if (layer.matte && ctx.person) {
      this.drawMatte(layer.matte, result, ctx.person, spare);
      result = spare;
    }
    return result;
  }

  private drawMatte(matte: LayerMatte, input: RenderTarget, mask: RenderTarget, out: RenderTarget): void {
    const gl = this.gl;
    const p = this.matteProgram;
    this.bindOutput(out);
    gl.useProgram(p.program);
    this.bindTexture(0, input.texture);
    this.bindTexture(1, mask.texture);
    setUniform(gl, p, 'uTexture', 0);
    setUniform(gl, p, 'uMatte', 1);
    setUniform(gl, p, 'uMode', matte.mode === 'cut' ? 1 : matte.mode === 'blur' ? 2 : 3);
    setUniform(gl, p, 'uColor', hexToRgb(matte.color));
    setUniform(gl, p, 'uPixel', [1 / this.width, 1 / this.height]);
    this.draw();
  }

  private drawColor(color: LayerColor, input: RenderTarget, out: RenderTarget): void {
    const gl = this.gl;
    const p = this.colorProgram;
    this.bindOutput(out);
    gl.useProgram(p.program);
    this.bindTexture(0, input.texture);
    setUniform(gl, p, 'uTexture', 0);
    const grade = color.grade;
    setUniform(gl, p, 'uUseGrade', grade ? 1 : 0);
    setUniform(gl, p, 'uLift', grade?.lift ?? [0, 0, 0]);
    setUniform(gl, p, 'uGamma', grade?.gamma ?? [1, 1, 1]);
    setUniform(gl, p, 'uGain', grade?.gain ?? [1, 1, 1]);
    setUniform(gl, p, 'uSaturation', grade?.saturation ?? 1);
    // Curvas: 256×1, uma por canal (r, g, b) e a geral no alfa.
    let curves: WebGLTexture | null = null;
    if (color.curves) {
      curves = this.curveTextures.get(color.curves.key) ?? null;
      if (!curves) {
        curves = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, curves);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, color.curves.data);
        this.curveTextures.set(color.curves.key, curves);
        if (this.curveTextures.size > 64) {
          const [oldKey, old] = this.curveTextures.entries().next().value!;
          gl.deleteTexture(old);
          this.curveTextures.delete(oldKey);
        }
      }
    }
    this.bindTexture(1, curves);
    setUniform(gl, p, 'uCurves', 1);
    setUniform(gl, p, 'uUseCurves', curves ? 1 : 0);
    // LUT 3D (.cube): vermelho varia primeiro, depois verde, depois azul (igual à textura 3D).
    let lut: WebGLTexture | null = null;
    if (color.lut) {
      lut = this.lutTextures.get(color.lut.key) ?? null;
      if (!lut) {
        const n = color.lut.size;
        lut = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_3D, lut);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, n, n, n, 0, gl.RGB, gl.UNSIGNED_BYTE, color.lut.data);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        this.lutTextures.set(color.lut.key, lut);
      }
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, lut);
    setUniform(gl, p, 'uLut', 2);
    setUniform(gl, p, 'uLutSize', lut ? color.lut!.size : 0);
    setUniform(gl, p, 'uLutAmount', color.lut?.amount ?? 0);
    this.draw();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  /** Empilha os efeitos e depois o filtro, alternando entre os dois alvos. Devolve o alvo com o resultado. */
  private drawLook(
    layer: Pick<LayerInput, 'effects' | 'filter' | 'time' | 'duration'>,
    current: RenderTarget,
    spare: RenderTarget,
    ctx: LookContext,
  ): RenderTarget {
    const gl = this.gl;
    for (const effect of layer.effects) {
      if (!effect.enabled) continue;
      const plugin = getPlugin(effect.pluginId);
      const compiled = plugin && this.getProgram(plugin);
      if (!plugin || !compiled) continue;
      const inputs = pluginInputs(plugin);
      const stateful = inputs.state || inputs.history || inputs.motion || inputs.background;
      const step = stateful ? this.stepState(`${ctx.key}|${effect.uid}`, inputs, layer.time, current, ctx.person) : null;
      const stateProgram = inputs.state ? this.getProgram(plugin, 'state') : null;

      const lod = usesLod(plugin);
      const run = (program: CompiledProgram, target: RenderTarget) => {
        this.bindOutput(target);
        gl.useProgram(program.program);
        this.bindTexture(0, current.texture);
        if (lod) this.buildLevels(current);
        setUniform(gl, program, 'uInput', 0);
        setUniform(gl, program, 'time', layer.time);
        setUniform(gl, program, 'duration', layer.duration);
        this.setCommonUniforms(program);
        this.setParams(program, plugin, effect.params);
        this.bindInputs(program, ctx.person, ctx.depth, step);
        this.draw();
        if (lod) this.dropLevels(current);
      };
      // Primeiro o estado deste quadro (state() lê o do anterior); depois o efeito, que já vê o novo.
      if (step && stateProgram && step.st.state) {
        run(stateProgram, step.st.state[1 - step.st.read]);
        step.st.read = 1 - step.st.read;
      }
      run(compiled, spare);
      if (step) {
        if (step.st.history) this.pushHistory(step.st, layer.time, current, ctx.person, step.mode === 'fresh');
        if (step.st.last) this.copyTarget(current, step.st.last);
      }
      this.unbindInputs();
      [current, spare] = [spare, current];
    }

    const filter = layer.filter;
    const filterPlugin = filter && filter.intensity > 0 ? getPlugin(filter.pluginId) : undefined;
    const filterProgram = filterPlugin && this.getProgram(filterPlugin);
    if (filter && filterPlugin && filterProgram) {
      this.bindOutput(spare);
      gl.useProgram(filterProgram.program);
      this.bindTexture(0, current.texture);
      const lod = usesLod(filterPlugin);
      if (lod) this.buildLevels(current);
      setUniform(gl, filterProgram, 'uInput', 0);
      setUniform(gl, filterProgram, 'time', layer.time);
      setUniform(gl, filterProgram, 'duration', layer.duration);
      setUniform(gl, filterProgram, 'intensity', filter.intensity);
      this.setCommonUniforms(filterProgram);
      this.setParams(filterProgram, filterPlugin, filter.params);
      // Filtros também podem usar a pessoa e a profundidade (pele, névoa, luz de janela…).
      this.bindInputs(filterProgram, ctx.person, ctx.depth, null);
      this.draw();
      this.unbindInputs();
      if (lod) this.dropLevels(current);
      current = spare;
    }
    return current;
  }

  /**
   * Avança a memória de um efeito para o instante `time`: recomeça depois de um pulo no tempo,
   * atualiza o fundo sem a pessoa e calcula o movimento desde o quadro anterior.
   */
  private stepState(key: string, inputs: PluginInputs, time: number, input: RenderTarget, person: RenderTarget | null): { st: EffectState; mode: StepMode } {
    const gl = this.gl;
    let st = this.effectStates.get(key);
    if (!st) {
      st = { time: NaN, used: 0, state: null, read: 0, plate: null, plateRead: 0, last: null, history: null };
      this.effectStates.set(key, st);
    }
    st.used = this.renderCount;
    const dt = time - st.time;
    // Redesenhar o mesmo instante (pausado) também recomeça: o quadro pode ter mudado (vídeo carregou, busca terminou).
    const mode: StepMode = dt > 1e-4 && dt < MAX_STEP ? 'advance' : 'fresh';
    if (inputs.state && !st.state) st.state = [createTarget(gl, this.width, this.height), createTarget(gl, this.width, this.height)];
    if (inputs.background && !st.plate) st.plate = [createTarget(gl, this.width, this.height), createTarget(gl, this.width, this.height)];
    if (inputs.motion && !st.last) st.last = createTarget(gl, this.width, this.height);
    if (inputs.history && !st.history) {
      const [w, h] = this.historySize();
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, HISTORY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const framebuffers = Array.from({ length: HISTORY }, (_, i) => {
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, i);
        return fb;
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      st.history = { texture, framebuffers, head: 0, count: 0, pushed: -Infinity, rate: HISTORY_RATE };
    }
    if (mode === 'fresh') {
      // Sem passado: o estado começa igual à imagem atual.
      if (st.state) st.state.forEach((t) => this.copyTarget(input, t));
      if (st.last) this.copyTarget(input, st.last);
      if (st.history) st.history.count = 0;
    }
    st.time = time;
    if (st.plate) {
      const p = this.plateProgram;
      this.bindOutput(st.plate[1 - st.plateRead]);
      gl.useProgram(p.program);
      this.bindTexture(0, input.texture);
      this.bindTexture(1, st.plate[st.plateRead].texture);
      this.bindTexture(2, person?.texture ?? this.blank);
      setUniform(gl, p, 'uTexture', 0);
      setUniform(gl, p, 'uPrevious', 1);
      setUniform(gl, p, 'uPerson', 2);
      setUniform(gl, p, 'uFresh', mode === 'fresh' ? 1 : 0);
      setUniform(gl, p, 'uPixel', [1 / this.width, 1 / this.height]);
      this.draw();
      this.bindTexture(1, null);
      this.bindTexture(2, null);
      st.plateRead = 1 - st.plateRead;
    }
    if (st.last) this.computeFlow(st.last, input);
    return { st, mode };
  }

  /** Histórico em resolução menor (até 960 px de largura): cabe mais passado na memória. */
  private historySize(): [number, number] {
    const scale = Math.min(1, 960 / this.width);
    return [Math.max(1, Math.round(this.width * scale)), Math.max(1, Math.round(this.height * scale))];
  }

  /** Guarda o quadro (com a pessoa no alfa) no histórico, no máximo 30 vezes por segundo. */
  private pushHistory(st: EffectState, time: number, input: RenderTarget, person: RenderTarget | null, fresh: boolean): void {
    const h = st.history!;
    const gap = time - h.pushed;
    if (!fresh && gap < 1 / HISTORY_RATE - 1e-3) return;
    if (!fresh) h.rate = 1 / Math.max(1 / HISTORY_RATE, gap);
    h.pushed = time;
    const gl = this.gl;
    const [w, hh] = this.historySize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, h.framebuffers[h.head]);
    gl.viewport(0, 0, w, hh);
    const p = this.historyProgram;
    gl.useProgram(p.program);
    this.bindTexture(0, input.texture);
    this.bindTexture(1, person?.texture ?? this.blank);
    setUniform(gl, p, 'uTexture', 0);
    setUniform(gl, p, 'uPerson', 1);
    setUniform(gl, p, 'uHasPerson', person ? 1 : 0);
    this.draw();
    this.bindTexture(1, null);
    h.head = (h.head + 1) % HISTORY;
    h.count = Math.min(HISTORY, h.count + 1);
  }

  /** Liga as entradas extras do efeito (unidades 1 a 6) e os números que as acompanham. */
  private bindInputs(program: CompiledProgram, person: RenderTarget | null, depth: RenderTarget | null, step: { st: EffectState; mode: StepMode } | null): void {
    const gl = this.gl;
    const st = step?.st;
    const stateTarget = st?.state ? st.state[st.read] : null;
    const plate = st?.plate ? st.plate[st.plateRead] : null;
    this.bindTexture(1, person?.texture ?? this.blank);
    this.bindTexture(2, depth?.texture ?? this.blank);
    this.bindTexture(3, stateTarget?.texture ?? this.blank);
    this.bindTexture(4, st?.last ? this.small[2].texture : this.blank);
    this.bindTexture(5, plate?.texture ?? this.blank);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, st?.history?.texture ?? this.blankArray);
    for (const [name, unit] of [['uPerson', 1], ['uDepth', 2], ['uState', 3], ['uMotion', 4], ['uBackground', 5], ['uHistory', 6]] as const) {
      setUniform(gl, program, name, unit);
    }
    setUniform(gl, program, 'uHasPerson', person ? 1 : 0);
    setUniform(gl, program, 'uHasDepth', depth ? 1 : 0);
    setUniform(gl, program, 'uFresh', step?.mode === 'fresh' ? 1 : 0);
    const h = st?.history;
    setUniform(gl, program, 'uHistoryInfo', h ? [h.head, h.count, h.rate] : [0, 0, HISTORY_RATE]);
    setUniform(gl, program, 'uMotionScale', [32 / this.smallWidth, 32 / this.smallHeight]);
  }

  private unbindInputs(): void {
    const gl = this.gl;
    for (let unit = 1; unit <= 5; unit++) this.bindTexture(unit, null);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }

  private copyTarget(from: RenderTarget, to: RenderTarget): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  private forgetState(key: string): void {
    const st = this.effectStates.get(key);
    if (!st) return;
    const gl = this.gl;
    for (const t of [...(st.state ?? []), ...(st.plate ?? []), ...(st.last ? [st.last] : [])]) deleteTarget(gl, t);
    if (st.history) {
      gl.deleteTexture(st.history.texture);
      st.history.framebuffers.forEach((fb) => gl.deleteFramebuffer(fb));
    }
    this.effectStates.delete(key);
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
      motionBlur: adjust.motionBlur,
      stretch: true,
      flipY: true,
    };
    this.drawSource(view, input.texture, t0);
    // O pacote vê a pessoa e a profundidade da trilha principal (já no enquadramento da tela).
    let result = this.drawLook(adjust, t0, t1, { key: adjust.key ?? 'pacote', person: this.basePerson, depth: this.baseDepth });
    // Cor manual como a do clipe: depois dos efeitos e do filtro, ainda com alfa normal (antes da pré-multiplicação).
    const color = adjust.color;
    if (color && (color.grade || color.curves || color.lut)) {
      const spare = result === t0 ? t1 : t0;
      this.drawColor(color, result, spare);
      result = spare;
    }
    if (this.transparent) {
      // A montagem é pré-multiplicada: o resultado dos efeitos (alfa normal) também precisa ser antes da mistura.
      const premultiplied = result === t0 ? t1 : t0;
      this.bindOutput(premultiplied);
      this.gl.useProgram(this.copyProgram.program);
      this.bindTexture(0, result.texture);
      setUniform(this.gl, this.copyProgram, 'uTexture', 0);
      setUniform(this.gl, this.copyProgram, 'uPremultiply', 1);
      this.draw();
      setUniform(this.gl, this.copyProgram, 'uPremultiply', 0);
      result = premultiplied;
    }
    this.drawBlend(input, result, Math.min(1, adjust.amount), out);
    return out;
  }

  /**
   * Desenha a mídia com encaixe e câmera no alvo indicado. `keepAlpha` (fundo transparente): a textura vem
   * pré-multiplicada e a saída leva a transparência dela; máscaras e profundidade (false) não têm transparência.
   */
  private drawSource(layer: LayerInput, texture: WebGLTexture, target: RenderTarget, keepAlpha = this.transparent): void {
    const gl = this.gl;
    const cam = layer.camera;
    this.bindOutput(target);
    gl.useProgram(this.sourceProgram.program);
    this.bindTexture(0, texture);
    setUniform(gl, this.sourceProgram, 'uTexture', 0);
    setUniform(gl, this.sourceProgram, 'uScale', layer.stretch ? [1, 1] : this.fitScale(layer.width, layer.height));
    setUniform(gl, this.sourceProgram, 'uRatio', this.width / this.height);
    const view = (c: LayerCamera | null | undefined) => (c ? [c.x, c.y, Math.max(0.05, c.zoom), (c.rotation * Math.PI) / 180] : [0.5, 0.5, 1, 0]);
    // Desfoque de movimento: média das vistas entre a câmera do começo e a do fim da exposição.
    const blur = cam && layer.motionBlur && layer.motionBlur.samples > 1 ? layer.motionBlur : null;
    setUniform(gl, this.sourceProgram, 'uCamera', view(blur ? blur.from : cam));
    setUniform(gl, this.sourceProgram, 'uCamera2', view(blur ? blur.to : cam));
    setUniform(gl, this.sourceProgram, 'uSamples', blur ? Math.min(32, blur.samples) : 1);
    setUniform(gl, this.sourceProgram, 'uFill', cam?.fill ? 1 : 0);
    setUniform(gl, this.sourceProgram, 'uTurn', Math.round(((layer.turn ?? 0) % 360) / 90));
    setUniform(gl, this.sourceProgram, 'uFlip', [layer.flipX ? 1 : 0, layer.flipY ? 1 : 0]);
    const bg = layer.stretch ? null : layer.background;
    setUniform(gl, this.sourceProgram, 'uBgMode', bg?.kind === 'blur' ? 2 : bg?.kind === 'color' ? 1 : 0);
    setUniform(gl, this.sourceProgram, 'uBgColor', bg?.kind === 'color' ? hexToRgb(bg.color) : [0, 0, 0]);
    setUniform(gl, this.sourceProgram, 'uKeepAlpha', keepAlpha ? 1 : 0);
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
    const flow = this.computeFlow(a, b);
    const texel = [1 / this.smallWidth, 1 / this.smallHeight];
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

  /** Movimento de `a` para `b`, numa imagem 4× menor (fica em small[2]). */
  private computeFlow(a: RenderTarget, b: RenderTarget): RenderTarget {
    const gl = this.gl;
    const [smallA, smallB, flow, coarse] = this.small;
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

    // Busca larga na grade rala; depois cada pixel escolhe entre os vizinhos dela e refina.
    for (const [program, target] of [[this.flowCoarseProgram, coarse], [this.flowProgram, flow]] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target === coarse ? this.coarseWidth : this.smallWidth, target === coarse ? this.coarseHeight : this.smallHeight);
      gl.useProgram(program.program);
      this.bindTexture(0, smallA.texture);
      this.bindTexture(1, smallB.texture);
      this.bindTexture(2, target === flow ? coarse.texture : null);
      setUniform(gl, program, 'uPrev', 0);
      setUniform(gl, program, 'uNext', 1);
      setUniform(gl, program, 'uCoarse', 2);
      setUniform(gl, program, 'uTexel', texel);
      this.draw();
    }
    this.bindTexture(1, null);
    this.bindTexture(2, null);
    return flow;
  }

  private drawTransition(
    transition: TransitionInput,
    from: RenderTarget,
    to: RenderTarget,
    fromCtx: LookContext,
    toCtx: LookContext,
    target: RenderTarget | null = this.screen,
  ): boolean {
    const gl = this.gl;
    const plugin = getPlugin(transition.pluginId);
    const compiled = plugin && this.getProgram(plugin);
    if (!plugin || !compiled) return false;
    const progress = Math.min(1, Math.max(0, transition.progress));
    const inputs = pluginInputs(plugin);
    // Transições com memória (datamosh): o estado anda com o progresso; o movimento é o do próximo clipe.
    const step =
      inputs.state || inputs.motion
        ? this.stepState(`transição|${fromCtx.key}|${toCtx.key}|${plugin.id}`, inputs, progress * 2, to, null)
        : null;
    const stateProgram = inputs.state ? this.getProgram(plugin, 'state') : null;

    const lod = usesLod(plugin);
    const run = (program: CompiledProgram, target: RenderTarget | null) => {
      this.bindOutput(target);
      gl.useProgram(program.program);
      if (lod) {
        this.buildLevels(from);
        this.buildLevels(to);
      }
      this.bindTexture(0, from.texture);
      this.bindTexture(1, to.texture);
      this.bindTexture(2, fromCtx.person?.texture ?? this.blank);
      this.bindTexture(3, toCtx.person?.texture ?? this.blank);
      const st = step?.st;
      this.bindTexture(4, st?.state?.[st.read].texture ?? this.blank);
      this.bindTexture(5, st?.last ? this.small[2].texture : this.blank);
      this.bindTexture(6, fromCtx.depth?.texture ?? this.blank);
      this.bindTexture(7, toCtx.depth?.texture ?? this.blank);
      for (const [name, unit] of [['uFrom', 0], ['uTo', 1], ['uFromPerson', 2], ['uToPerson', 3], ['uState', 4], ['uMotion', 5], ['uFromDepth', 6], ['uToDepth', 7]] as const) {
        setUniform(gl, program, name, unit);
      }
      setUniform(gl, program, 'uHasPerson', [fromCtx.person ? 1 : 0, toCtx.person ? 1 : 0]);
      setUniform(gl, program, 'uHasDepth', [fromCtx.depth ? 1 : 0, toCtx.depth ? 1 : 0]);
      setUniform(gl, program, 'uFresh', step?.mode === 'fresh' ? 1 : 0);
      setUniform(gl, program, 'uMotionScale', [32 / this.smallWidth, 32 / this.smallHeight]);
      setUniform(gl, program, 'progress', progress);
      this.setCommonUniforms(program);
      this.setParams(program, plugin, transition.params);
      this.draw();
      if (lod) {
        this.dropLevels(from);
        this.dropLevels(to);
      }
    };
    // Como nos efeitos: primeiro o estado deste quadro, depois a imagem (que já vê o novo).
    if (step && stateProgram && step.st.state) {
      const st = step.st;
      run(stateProgram, st.state![1 - st.read]);
      st.read = 1 - st.read;
    }
    run(compiled, target);
    if (step?.st.last) this.copyTarget(to, step.st.last);
    for (let unit = 1; unit <= 7; unit++) this.bindTexture(unit, null);
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
    // Fundo transparente: pré-multiplicada no envio, a textura não escurece nas bordas ao reduzir (mipmap).
    if (this.transparent) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
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
    if (this.transparent) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return texture;
  }

  private getProgram(plugin: ShaderPlugin, pass: 'main' | 'state' = 'main'): CompiledProgram | null {
    // Efeitos do editor podem mudar de código com o mesmo id: o programa é refeito quando o código muda.
    const id = pass === 'state' ? `${plugin.id}#estado` : plugin.id;
    const signature = plugin.glsl + plugin.params.map((p) => p.id + p.type).join();
    const cached = this.plugins.get(id);
    if (cached !== undefined && this.sources.get(id) === signature) return cached;
    if (cached) this.gl.deleteProgram(cached.program);
    this.sources.set(id, signature);

    const { source, lineOffset } = buildPluginSource(plugin, pass);
    let compiled: CompiledProgram | null = null;
    try {
      compiled = compileProgram(this.gl, VERTEX_SHADER, source);
    } catch (error) {
      const message = error instanceof ShaderError ? formatShaderLog(error.message, lineOffset) : String(error);
      console.error(`[Lumiar] erro no shader "${plugin.id}":\n${message}`);
      this.onShaderError?.(plugin, message);
    }
    this.plugins.set(id, compiled);
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

  /** Monta o mapa de níveis (mipmaps) de uma imagem para o plugin ler com getColorLod / lmBloom. */
  private buildLevels(target: RenderTarget): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  /** Volta a ler só a imagem nítida (os outros plugins não usam os níveis, que ficam velhos no próximo quadro). */
  private dropLevels(target: RenderTarget): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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

const lodCache = new Map<string, boolean>();

/** O plugin lê a imagem por níveis de detalhe (brilho largo, desfoque grande)? */
function usesLod(plugin: ShaderPlugin): boolean {
  let found = lodCache.get(plugin.glsl);
  if (found === undefined) {
    found = LOD_CALL.test(plugin.glsl.replace(/\/\/.*$/gm, ''));
    lodCache.set(plugin.glsl, found);
  }
  return found;
}
