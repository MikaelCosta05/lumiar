import { useEffect, useRef, type RefObject } from 'react';
import type { Player } from '../preview/player';
import { shortcuts, type ShortcutHandler } from './shortcuts';

export interface KeyActions {
  split: () => void;
  deleteSelection: () => void;
  undo: () => void;
  redo: () => void;
  save: (saveAs?: boolean) => Promise<void>;
  open: () => Promise<void>;
  copy: (cut?: boolean) => void;
  paste: () => void;
  duplicateSelection: () => void;
  markHere: () => void;
  jumpEdit: (direction: 1 | -1) => void;
  toggleVoice: () => void;
  trimToCursor: (edge: 'start' | 'end') => void;
  /** false = não há essa câmera (a tecla segue o caminho normal) */
  cutToCamera: (camera: number) => boolean;
  /** Abre a janela "Atalhos do teclado" */
  showShortcuts?: () => void;
}

/**
 * Atalhos de teclado. Qual tecla faz o quê fica no registro (shortcuts.ts, que a pessoa pode mudar);
 * aqui ficam só o que cada ação do editor faz (a versão mais recente das funções fica num ref).
 * No Mac, Cmd vale como Ctrl. Com a janela de exportação aberta, só salvar e abrir funcionam.
 * Outras partes da interface tratam as próprias ações com useShortcut (shortcuts.ts).
 */
export function useKeyboardShortcuts(actions: KeyActions, playerRef: RefObject<Player | null>, fps: number, exporting: boolean) {
  const keyActions = useRef(actions);
  keyActions.current = actions;
  const state = useRef({ fps, exporting });
  state.current = { fps, exporting };

  useEffect(() => {
    const a = () => keyActions.current;
    /** Ações que mexem no player: sem ele (ainda carregando), a tecla não faz nada. */
    const withPlayer =
      (fn: (player: Player) => void): ShortcutHandler =>
      () => {
        const player = playerRef.current;
        if (!player) return false;
        fn(player);
      };
    const step = (seconds: number) => withPlayer((player) => player.seek(player.currentTime + seconds));
    const frame = () => 1 / state.current.fps;

    const handlers: Record<string, ShortcutHandler> = {
      // Salvar e abrir funcionam até com o foco num campo de texto.
      save: () => void a().save(),
      saveAs: () => void a().save(true),
      open: () => void a().open(),
      undo: withPlayer(() => a().undo()),
      redo: withPlayer(() => a().redo()),
      copy: withPlayer(() => a().copy()),
      cut: withPlayer(() => a().copy(true)),
      paste: withPlayer(() => a().paste()),
      duplicate: withPlayer(() => a().duplicateSelection()),
      delete: withPlayer(() => a().deleteSelection()),
      playPause: withPlayer((player) => player.toggle()),
      split: withPlayer(() => a().split()),
      marker: withPlayer(() => a().markHere()),
      voice: withPlayer(() => a().toggleVoice()),
      // L: toca; de novo, 2× e 4× mais rápido.
      shuttleForward: withPlayer((player) => {
        const rate = player.playbackRate;
        player.shuttle(rate >= 1 ? Math.min(8, rate * 2) : 1);
      }),
      shuttlePause: withPlayer((player) => player.pause()),
      // J: toca para trás; de novo, mais rápido.
      shuttleBack: withPlayer((player) => {
        const rate = player.playbackRate;
        player.shuttle(rate <= -1 ? Math.max(-8, rate * 2) : -1);
      }),
      trimStart: withPlayer(() => a().trimToCursor('start')),
      trimEnd: withPlayer(() => a().trimToCursor('end')),
      prevEdit: withPlayer(() => a().jumpEdit(-1)),
      nextEdit: withPlayer(() => a().jumpEdit(1)),
      frameBack: (e) => step(-frame())(e),
      frameForward: (e) => step(frame())(e),
      secondBack: step(-1),
      secondForward: step(1),
      goStart: withPlayer((player) => player.seek(0)),
      goEnd: withPlayer((player) => player.seek(player.duration)),
      shortcuts: () => {
        const show = a().showShortcuts;
        if (!show) return false;
        show();
      },
    };
    for (let n = 1; n <= 9; n++) handlers[`camera${n}`] = () => !!playerRef.current && a().cutToCamera(n);

    const off = Object.entries(handlers).map(([id, handler]) => shortcuts.on(id, handler));
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing = target instanceof Element && !!target.closest('input, select, textarea');
      shortcuts.dispatch(e, { typing, blocked: state.current.exporting });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      off.forEach((stop) => stop());
    };
  }, []);
}
