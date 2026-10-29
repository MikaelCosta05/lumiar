import type { RefObject } from 'react';
import type { Player } from '../preview/player';
import type { EditResult } from '../project/clipboard';
import type { Project, TimelineLayout } from '../project/model';
import type { Selection } from '../ui/selection';
import type { useHistory } from '../ui/useHistory';

export type ProjectHistory = ReturnType<typeof useHistory<Project>>;

/**
 * O que as ferramentas do editor usam do App. É montado a cada render, então as funções criadas
 * a partir dele veem o projeto e a seleção daquele render (como quando moravam dentro do App).
 */
export interface EditorContext {
  history: ProjectHistory;
  project: Project;
  timeline: TimelineLayout;
  setProject: ProjectHistory['update'];
  selection: Selection;
  setSelection: (selection: Selection) => void;
  notify: (text: string, error?: boolean) => void;
  /** Mensagem de "trabalhando…" (null tira). */
  setBusy: (text: string | null) => void;
  /** Aplica uma edição que também troca a seleção (null = não deu, avisa com `fail`). */
  applyEdit: (result: EditResult | null, fail?: string) => void;
  playerRef: RefObject<Player | null>;
  currentTime: () => number;
  /** Cortes na trilha principal levam o resto junto. */
  ripple: boolean;
}
