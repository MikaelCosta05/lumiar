import { layoutProject, type Project, type TimelineLayout } from '../project/model';
import {
  coveredBy,
  entryAt,
  evictionFor,
  nextEntryAfter,
  prerenderFingerprint,
  PRERENDER_MEMORY_LIMIT,
  type PrerenderSpan,
  type Span,
} from '../project/prerender';

/** Um trecho pré-renderizado: o vídeo pronto (só a imagem), guardado na memória. */
export interface PrerenderEntry extends PrerenderSpan {
  /** Impressão digital do projeto no trecho quando foi renderizado */
  fingerprint: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  fps: number;
}

/** Como a régua mostra cada trecho: verde quando vale, apagado quando o projeto mudou ali. */
export interface PrerenderView extends Span {
  id: string;
  valid: boolean;
}

/**
 * Os trechos pré-renderizados da sessão (não vão para o arquivo do projeto). A cada mudança no projeto
 * o player chama check(), que confere quais trechos ainda valem; os desatualizados ficam guardados
 * (desfazer pode trazê-los de volta), mas não são usados e são os primeiros a sair quando falta memória.
 */
class PrerenderCache {
  private entries: PrerenderEntry[] = [];
  private readonly valid = new Map<string, boolean>();
  private project: Project | null = null;
  private timeline: TimelineLayout | null = null;
  private view: PrerenderView[] = [];
  private readonly listeners = new Set<() => void>();

  /** Para o useSyncExternalStore (a barra da régua e o menu). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getView = (): PrerenderView[] => this.view;

  get count(): number {
    return this.entries.length;
  }

  /** Memória ocupada por todos os trechos (bytes). */
  get bytes(): number {
    return this.entries.reduce((sum, e) => sum + e.bytes, 0);
  }

  /** O projeto mudou: confere quais trechos ainda valem. */
  check(project: Project, timeline: TimelineLayout = layoutProject(project)): void {
    if (project === this.project) return;
    this.project = project;
    this.timeline = timeline;
    for (const entry of this.entries) this.validate(entry);
    this.publish();
  }

  /**
   * Guarda um trecho recém-renderizado. Os que ele cobre por inteiro saem, e os mais antigos
   * (desatualizados primeiro) saem se passar do limite de memória. Devolve quantos saíram por falta de memória.
   */
  add(data: Omit<PrerenderEntry, 'id' | 'url' | 'createdAt'>): { entry: PrerenderEntry; evicted: number } {
    const entry: PrerenderEntry = { ...data, id: crypto.randomUUID(), url: URL.createObjectURL(data.blob), createdAt: Date.now() };
    this.drop(coveredBy(this.entries, entry).map((e) => e.id));
    this.entries.push(entry);
    this.validate(entry);
    const evicted = evictionFor(this.entries, PRERENDER_MEMORY_LIMIT, (e) => !this.valid.get(e.id));
    this.drop(evicted);
    this.publish();
    return { entry, evicted: evicted.length };
  }

  /** Apaga tudo (ou só os trechos com esses ids). */
  clear(ids?: string[]): void {
    this.drop(ids ?? this.entries.map((e) => e.id));
    this.publish();
  }

  /** Trecho válido que cobre o instante t. */
  usableAt(t: number): PrerenderEntry | null {
    return entryAt(this.entries, t, (e) => !!this.valid.get(e.id));
  }

  /** O trecho ainda existe e vale para o projeto atual? */
  isUsable(id: string): boolean {
    return !!this.valid.get(id);
  }

  /** Próximo trecho válido que começa até `within` s depois de t. */
  nextAfter(t: number, within: number): PrerenderEntry | null {
    return nextEntryAfter(this.entries, t, within, (e) => !!this.valid.get(e.id));
  }

  private validate(entry: PrerenderEntry): void {
    const ok = !!this.project && !!this.timeline && prerenderFingerprint(this.project, this.timeline, entry) === entry.fingerprint;
    this.valid.set(entry.id, ok);
  }

  private drop(ids: string[]): void {
    if (!ids.length) return;
    const gone = new Set(ids);
    for (const entry of this.entries) {
      if (!gone.has(entry.id)) continue;
      URL.revokeObjectURL(entry.url);
      this.valid.delete(entry.id);
    }
    this.entries = this.entries.filter((e) => !gone.has(e.id));
  }

  /** Avisa quem mostra os trechos (só quando algo mudou de verdade). */
  private publish(): void {
    const next = this.entries.map((e) => ({ id: e.id, start: e.start, end: e.end, valid: !!this.valid.get(e.id) }));
    const same = next.length === this.view.length && next.every((v, i) => v.id === this.view[i].id && v.valid === this.view[i].valid);
    if (same) return;
    this.view = next;
    this.listeners.forEach((l) => l());
  }
}

export const prerenderCache = new PrerenderCache();
