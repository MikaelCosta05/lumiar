import { ChevronsLeftRight, MousePointer2, MoveHorizontal, SeparatorVertical } from 'lucide-react';
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { registerShortcut, SHORTCUT_GROUPS, useShortcut, useShortcutsVersion, withShortcut } from '../app/shortcuts';
import { assets } from '../media/assets';
import { getMedia, layoutProject, type Project } from '../project/model';
import { applyTrim, TRIM_TOOL_KEYS, type TrimFrame, type TrimResult, type TrimSession, type TrimTool } from '../project/trimTools';
import { t } from '../i18n';
import { formatTime } from './format';
import { IconButton } from './kit';
import { useAssets } from './MediaVisuals';

/**
 * Seletor das ferramentas de corte (seleção, slip, slide e roll), a dica que aparece durante o arrasto e o
 * próprio arrasto. As contas ficam em src/project/trimTools.ts.
 */

type ActiveTool = Exclude<TrimTool, 'select'>;

const TOOLS: { tool: TrimTool; icon: ReactNode; label: () => string }[] = [
  { tool: 'select', icon: <MousePointer2 size={14} />, label: () => t('Seleção: mover e cortar pelas bordas') },
  { tool: 'slip', icon: <ChevronsLeftRight size={14} />, label: () => t('Slip: arraste dentro do clipe para trocar o trecho mostrado, sem mudar o lugar nem o tamanho') },
  { tool: 'slide', icon: <MoveHorizontal size={14} />, label: () => t('Slide: arraste um clipe da trilha principal entre os vizinhos; eles se ajustam e a duração total fica a mesma') },
  { tool: 'roll', icon: <SeparatorVertical size={14} />, label: () => t('Roll: arraste o corte entre dois clipes; um cresce, o outro diminui e a duração total fica a mesma') },
];

const NAMES: Record<TrimTool, () => string> = {
  select: () => t('Seleção'),
  slip: () => t('Slip'),
  slide: () => t('Slide'),
  roll: () => t('Roll'),
};

// Atalhos de uma letra (V, Y, U, N) no registro de atalhos: dá para trocar na janela "Atalhos do teclado".
const SHORTCUT_IDS: Record<TrimTool, string> = {
  select: 'timeline.select',
  slip: 'timeline.slip',
  slide: 'timeline.slide',
  roll: 'timeline.roll',
};
registerShortcut({ id: SHORTCUT_IDS.select, label: t('Ferramenta de seleção'), group: SHORTCUT_GROUPS.timeline, defaults: [TRIM_TOOL_KEYS.select] });
registerShortcut({ id: SHORTCUT_IDS.slip, label: t('Ferramenta slip (trocar o trecho dentro do clipe)'), group: SHORTCUT_GROUPS.timeline, defaults: [TRIM_TOOL_KEYS.slip] });
registerShortcut({ id: SHORTCUT_IDS.slide, label: t('Ferramenta slide (mover o clipe entre os vizinhos)'), group: SHORTCUT_GROUPS.timeline, defaults: [TRIM_TOOL_KEYS.slide] });
registerShortcut({ id: SHORTCUT_IDS.roll, label: t('Ferramenta roll (mover o corte entre dois clipes)'), group: SHORTCUT_GROUPS.timeline, defaults: [TRIM_TOOL_KEYS.roll] });

/** Ferramenta escolhida, trocada pelo seletor ou pelos atalhos. */
export function useTrimTool(): [TrimTool, (tool: TrimTool) => void] {
  const [tool, setTool] = useState<TrimTool>('select');
  useShortcut(SHORTCUT_IDS.select, () => setTool('select'));
  useShortcut(SHORTCUT_IDS.slip, () => setTool('slip'));
  useShortcut(SHORTCUT_IDS.slide, () => setTool('slide'));
  useShortcut(SHORTCUT_IDS.roll, () => setTool('roll'));
  return [tool, setTool];
}

/** Cursor em cima dos clipes com cada ferramenta (undefined = o normal). */
export function trimCursor(tool: TrimTool): string | undefined {
  return tool === 'roll' ? 'col-resize' : tool === 'select' ? undefined : 'ew-resize';
}

export function TrimToolPicker({ tool, onChange }: { tool: TrimTool; onChange: (tool: TrimTool) => void }) {
  // As dicas mostram o atalho atual (a pessoa pode ter trocado).
  useShortcutsVersion();
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-panel-2 p-0.5" role="radiogroup" aria-label={t('Ferramenta de corte')}>
      {TOOLS.map((item) => (
        <IconButton
          key={item.tool}
          role="radio"
          aria-checked={tool === item.tool}
          label={withShortcut(item.label(), SHORTCUT_IDS[item.tool])}
          active={tool === item.tool}
          className="!size-6"
          onClick={() => onChange(item.tool)}
        >
          {item.icon}
        </IconButton>
      ))}
    </div>
  );
}

export interface TrimHintState {
  x: number;
  y: number;
  tool: ActiveTool;
  result: TrimResult | null;
  /** Quando a ferramenta não vale para o clipe clicado */
  message?: string;
}

/** Miniatura mais perto do instante (as da faixa de miniaturas; numa imagem, a própria). */
function frameUrl(project: Project, frame: TrimFrame): string | null {
  const media = getMedia(project, frame.mediaId);
  if (!media) return null;
  const strip = assets.filmstrips.get(media.id);
  if (media.kind === 'image' || !strip || strip.urls.length === 0) return media.thumbnail;
  let best = 0;
  for (let i = 1; i < strip.times.length; i++) {
    if (Math.abs(strip.times[i] - frame.time) < Math.abs(strip.times[best] - frame.time)) best = i;
  }
  return strip.urls[best];
}

function Still({ project, frame }: { project: Project; frame: TrimFrame }) {
  const media = getMedia(project, frame.mediaId);
  const url = frameUrl(project, frame);
  const aspect = media?.width && media.height ? media.width / media.height : 16 / 9;
  const width = 112;
  const height = Math.round(Math.min(84, Math.max(40, width / aspect)));
  return (
    <div className="flex flex-col items-center gap-1">
      {media?.kind === 'audio' ? null : (
        <div className="rounded bg-black bg-cover bg-center ring-1 ring-white/10" style={{ width, height, backgroundImage: url ? `url(${url})` : undefined }} />
      )}
      <span className="font-mono text-[10px] text-dim">
        {frame.edge === 'in' ? t('Entrada {time}', { time: formatTime(frame.time) }) : t('Saída {time}', { time: formatTime(frame.time) })}
      </span>
    </div>
  );
}

/** Dica perto do mouse: os novos pontos de entrada e saída e os quadros dos dois lados. */
export function TrimHint({ hint, project }: { hint: TrimHintState; project: Project }) {
  useAssets();
  const { result } = hint;
  const sign = result && result.delta >= 0 ? '+' : '−';
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-panel-2/95 px-2.5 py-2 shadow-2xl shadow-black/50 backdrop-blur-sm"
      style={{ left: hint.x, top: hint.y - 18 }}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-fg">{NAMES[hint.tool]()}</span>
        {result && <span className="font-mono text-accent">{`${sign}${Math.abs(result.delta).toFixed(2)} s`}</span>}
        {result?.at !== undefined && (
          <span className="text-faint">
            {hint.tool === 'slide' ? t('começa em {time}', { time: formatTime(result.at) }) : t('corte em {time}', { time: formatTime(result.at) })}
          </span>
        )}
      </div>
      {hint.message ? (
        <p className="max-w-56 text-[11px] text-dim">{hint.message}</p>
      ) : (
        result && (
          <div className="flex gap-2">
            <Still project={project} frame={result.left} />
            <Still project={project} frame={result.right} />
          </div>
        )
      )}
    </div>
  );
}

const UNAVAILABLE: Record<ActiveTool, () => string> = {
  slip: () => t('Este clipe não tem o que deslizar (imagens ficam iguais).'),
  slide: () => t('O slide precisa de um clipe de cada lado na trilha principal.'),
  roll: () => t('O roll precisa de dois clipes vizinhos na trilha principal.'),
};

/**
 * Arrasto do slip, slide ou roll. Tudo é recalculado a partir do começo do arrasto, então soltar onde começou
 * devolve o clipe como estava. `snap` é o ímã da timeline (null = sem ponto perto).
 */
export function startTrimDrag(
  e: ReactPointerEvent,
  options: {
    tool: ActiveTool;
    session: TrimSession | null;
    pxPerSecond: number;
    onEdit: (update: (project: Project) => Project) => void;
    onHint: (hint: TrimHintState | null) => void;
    snap: (time: number) => number | null;
    onSnapLine: (time: number | null) => void;
  },
) {
  e.stopPropagation();
  e.preventDefault();
  const { tool, session, pxPerSecond, onEdit, onHint, snap, onSnapLine } = options;
  const x0 = e.clientX;
  if (!session) {
    onHint({ x: e.clientX, y: e.clientY, tool, result: null, message: UNAVAILABLE[tool]() });
  } else {
    onHint({ x: e.clientX, y: e.clientY, tool, result: applyTrim(session.base, session, 0) });
  }
  // Pontos que andam com o arrasto e podem grudar no ímã: as bordas do clipe (slide) ou o corte (roll).
  const anchors: number[] = [];
  if (session && tool !== 'slip') {
    const clips = layoutProject(session.base).clips;
    const i = clips.findIndex((l) => l.clip.id === session.clipId);
    if (tool === 'slide' && clips[i]) anchors.push(clips[i].start, clips[i].start + clips[i].length);
    if (tool === 'roll' && clips[i + 1]) anchors.push(clips[i + 1].start);
  }
  let amount = 0;
  let moved = false;
  let keepAlive = 0;
  const apply = () => onEdit((p) => (session && applyTrim(p, session, amount)?.project) || p);
  const move = (ev: PointerEvent) => {
    if (!session) return;
    const raw = (ev.clientX - x0) / pxPerSecond;
    let delta = raw;
    let line: number | null = null;
    for (const a of anchors) {
      const s = snap(a + raw);
      if (s !== null && (line === null || Math.abs(s - a - raw) < Math.abs(delta - raw))) {
        line = s;
        delta = s - a;
      }
    }
    amount = delta;
    const result = applyTrim(session.base, session, amount);
    // A linha do ímã só aparece se o limite do clipe deixou chegar até ela.
    onSnapLine(line !== null && result && Math.abs(result.delta - amount) < 1e-6 ? line : null);
    onHint({ x: ev.clientX, y: ev.clientY, tool, result });
    apply();
    if (!moved) {
      moved = true;
      // O histórico junta mudanças com menos de 600 ms entre elas: reaplicar de tempos em tempos (mesmo com o
      // mouse parado) faz o arrasto inteiro virar um passo só no desfazer.
      keepAlive = window.setInterval(apply, 400);
    }
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.clearInterval(keepAlive);
    onSnapLine(null);
    onHint(null);
    document.body.style.cursor = '';
  };
  document.body.style.cursor = session ? (trimCursor(tool) ?? '') : 'not-allowed';
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
