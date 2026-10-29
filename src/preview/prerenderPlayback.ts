import type { FrameInput, Renderer } from '../engine/renderer';
import { prerenderCache, type PrerenderEntry } from './prerenderCache';

/** Diferença máxima (s) entre o vídeo pronto e o relógio do player antes de corrigir (a mesma dos clipes). */
const MAX_DRIFT = 0.25;
/** Quanto antes (s) o vídeo do próximo trecho já é posicionado no começo. */
const PREROLL = 1;
/** Quantos vídeos de trechos ficam abertos ao mesmo tempo */
const KEEP_ELEMENTS = 3;

/**
 * Toca os trechos pré-renderizados no lugar da renderização ao vivo. Cada trecho em uso tem um <video>
 * escondido (mudo: o som continua saindo dos clipes, pelo player); quando o quadro dele está no ponto,
 * ele vai inteiro para a tela. Se não estiver (buscando, carregando), o player desenha ao vivo.
 */
export class PrerenderPlayback {
  private readonly elements = new Map<string, HTMLVideoElement>();
  /** Trechos que já mandaram um quadro para a GPU (dá para repetir o último enquanto busca) */
  private readonly shown = new Set<string>();
  private readonly container: HTMLDivElement;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly renderer: Renderer,
    /** Um quadro do vídeo pronto ficou disponível (ou os trechos mudaram): redesenhar. */
    private readonly onChange: () => void,
  ) {
    this.container = document.createElement('div');
    this.container.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    document.body.appendChild(this.container);
    this.unsubscribe = prerenderCache.subscribe(onChange);
  }

  /**
   * O quadro pronto do instante t, ou null para desenhar ao vivo.
   * `rate` é a velocidade enquanto toca (0 = pausado, negativo = para trás, quadro a quadro).
   */
  frame(t: number, rate: number): FrameInput | null {
    const entry = prerenderCache.usableAt(t);
    const upcoming = rate > 0 ? prerenderCache.nextAfter(t, PREROLL) : null;
    this.prune(new Set([entry?.id, upcoming?.id].filter((id): id is string => !!id)));
    if (upcoming && upcoming !== entry) {
      const el = this.element(upcoming);
      if (!el.paused) el.pause();
      if (!el.seeking && el.currentTime > 0.05) el.currentTime = 0;
    }
    if (!entry) return null;

    const el = this.element(entry);
    if (el.error) return null;
    const length = entry.end - entry.start;
    const local = Math.min(Math.max(0, t - entry.start), Math.max(0, length - 0.5 / entry.fps));
    this.follow(el, local, rate);
    const ready =
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !el.seeking && Math.abs(el.currentTime - local) <= (rate > 0 ? MAX_DRIFT * rate : 1 / entry.fps);
    if (!ready) {
      // Arrastando o cursor dentro do trecho: enquanto o quadro novo chega, fica o último pronto (sem renderizar ao vivo).
      return rate <= 0 && el.seeking && this.shown.has(entry.id) ? this.input(entry, null, local) : null;
    }
    this.shown.add(entry.id);
    return this.input(entry, el, local);
  }

  /** Uma camada só, com o quadro pronto (null = repete o último enviado). */
  private input(entry: PrerenderEntry, source: HTMLVideoElement | null, local: number): FrameInput {
    return {
      a: {
        key: `prerender:${entry.id}`,
        source,
        width: entry.width,
        height: entry.height,
        time: local,
        duration: entry.end - entry.start,
        effects: [],
        filter: null,
        // Mesma proporção do projeto: ocupa a tela inteira.
        stretch: true,
        background: null,
      },
      b: null,
      transition: null,
    };
  }

  dispose(): void {
    this.unsubscribe();
    for (const [id, el] of this.elements) this.drop(id, el);
    this.container.remove();
  }

  /** Igual aos clipes do player: tocando para frente acompanha o relógio; parado ou para trás, busca o quadro. */
  private follow(el: HTMLVideoElement, target: number, rate: number): void {
    if (rate > 0) {
      const speed = Math.min(16, rate);
      if (el.playbackRate !== speed) el.playbackRate = speed;
      if (el.paused) {
        if (Math.abs(el.currentTime - target) > 0.1) el.currentTime = target;
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - target) > MAX_DRIFT * speed) {
        el.currentTime = target;
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - target) > 0.001) el.currentTime = target;
    }
  }

  /**
   * Fora de uso, o vídeo pausa; os de trechos que não valem mais saem, e dos outros ficam só os usados
   * por último (cada um segura um decodificador, mas voltar a um trecho recente não precisa carregar de novo).
   */
  private prune(inUse: Set<string>): void {
    for (const [id, el] of this.elements) {
      if (inUse.has(id)) continue;
      if (!prerenderCache.isUsable(id)) this.drop(id, el);
      else if (!el.paused) el.pause();
    }
    for (const [id, el] of this.elements) {
      if (this.elements.size <= KEEP_ELEMENTS) break;
      if (!inUse.has(id)) this.drop(id, el);
    }
  }

  private element(entry: PrerenderEntry): HTMLVideoElement {
    let el = this.elements.get(entry.id);
    if (el) {
      // Mais recente por último (a ordem do Map decide quem sai primeiro).
      this.elements.delete(entry.id);
      this.elements.set(entry.id, el);
      return el;
    }
    el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.src = entry.url;
    el.addEventListener('seeked', this.onChange);
    el.addEventListener('loadeddata', this.onChange);
    this.container.appendChild(el);
    this.elements.set(entry.id, el);
    return el;
  }

  private drop(id: string, el: HTMLVideoElement): void {
    el.pause();
    el.removeEventListener('seeked', this.onChange);
    el.removeEventListener('loadeddata', this.onChange);
    el.removeAttribute('src');
    el.load();
    el.remove();
    this.elements.delete(id);
    this.shown.delete(id);
    this.renderer.releaseSource(`prerender:${id}`);
  }
}
