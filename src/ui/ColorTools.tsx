import { FileUp, RotateCcw } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayerMask } from '../engine/renderer';
import { createGrade, gradeIsNeutral, sampleCurve, STRAIGHT, type ColorGrade, type ColorWheel, type CurveChannel, type CurvePoints } from '../project/grade';
import { parseCube, type SavedLut } from '../project/lut';
import type { VideoClip } from '../project/model';
import { LabeledSlider } from './Inspector';
import { Button, cx, IconButton, SectionTitle, Segmented, SwitchRow } from './kit';
import { t, tc } from '../i18n';

// ---------------------------------------------------------------- Remover o fundo

type Matte = NonNullable<VideoClip['matte']>;

/** Remover o fundo sem tela verde (a pessoa é separada do resto pela IA, no computador). */
export function BackgroundSection({
  matte,
  onChange,
  allowCut,
}: {
  matte: VideoClip['matte'];
  onChange: (matte: VideoClip['matte']) => void;
  /** Recortar (fundo transparente) só faz sentido em camadas por cima de outra imagem */
  allowCut: boolean;
}) {
  const mode = matte?.mode ?? 'off';
  const options: { value: Matte['mode'] | 'off'; label: string; title: string }[] = [
    { value: 'off', label: t('Normal'), title: t('Fundo original') },
    { value: 'blur', label: t('Desfocar'), title: t('Desfoca só o fundo, como o modo retrato do celular') },
    { value: 'color', label: t('Cor'), title: t('Troca o fundo por uma cor') },
    ...(allowCut ? [{ value: 'cut' as const, label: tc('fundo', 'Recortar'), title: t('Tira o fundo: a pessoa fica por cima do vídeo de baixo') }] : []),
  ];
  return (
    <>
      <SectionTitle>{t('Fundo (sem tela verde)')}</SectionTitle>
      <Segmented
        options={options}
        value={mode}
        onChange={(value) => onChange(value === 'off' ? undefined : { mode: value, color: matte?.color ?? '#1e7a46' })}
      />
      {mode === 'color' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-dim">
          {t('Cor do fundo')}
          {['#1e7a46', '#ffffff', '#111111', '#2563eb', '#f472b6', '#facc15'].map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => onChange({ mode: 'color', color })}
              className={cx('size-5 rounded ring-1 ring-white/20', matte?.color === color && 'ring-2 ring-accent')}
              style={{ background: color }}
            />
          ))}
          <input type="color" value={matte?.color ?? '#1e7a46'} onChange={(e) => onChange({ mode: 'color', color: e.target.value })} className="size-6 cursor-pointer rounded bg-transparent" />
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-faint">
        {mode === 'off'
          ? allowCut
            ? t('A IA encontra a pessoa em cada quadro. "Recortar" deixa só a pessoa por cima do vídeo de baixo.')
            : t('A IA encontra a pessoa em cada quadro. Para pôr a pessoa por cima de outro vídeo, leve este clipe para uma trilha de cima e use "Recortar".')
          : t('Funciona melhor com uma pessoa bem visível, de corpo inteiro ou da cintura para cima.')}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- Rodas de cor e curvas

function Wheel({ label, wheel, onChange }: { label: string; wheel: ColorWheel; onChange: (wheel: ColorWheel) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: ReactPointerEvent | PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const r = Math.hypot(x, y);
    if (r > 1) {
      x /= r;
      y /= r;
    }
    onChange({ ...wheel, x, y });
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        title={t('Arraste para puxar a cor para esse lado · duplo clique volta ao centro')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onDoubleClick={() => onChange({ ...wheel, x: 0, y: 0 })}
        className="relative aspect-square w-full cursor-crosshair rounded-full ring-1 ring-white/15"
        style={{
          background:
            'radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 70%), conic-gradient(from 90deg, #ff4040, #ff40ff, #4040ff, #40ffff, #40ff40, #ffff40, #ff4040)',
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(wheel.x * 0.5 + 0.5) * 100}%`, top: `${(wheel.y * 0.5 + 0.5) * 100}%` }}
        />
      </div>
      <p className="text-[10px] text-dim">{label}</p>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={wheel.level}
        title={t('Mais escuro ↔ mais claro')}
        onChange={(e) => onChange({ ...wheel, level: Number(e.target.value) })}
        onDoubleClick={() => onChange({ ...wheel, level: 0 })}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

const CHANNEL_COLOR: Record<CurveChannel, string> = { master: '#e5e7eb', r: '#f87171', g: '#4ade80', b: '#60a5fa' };

function CurveEditor({ points, color, onChange }: { points: CurvePoints; color: string; onChange: (points: CurvePoints) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const W = 240;
  const H = 150;
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))];
  };
  const path = Array.from({ length: 61 }, (_, i) => {
    const x = i / 60;
    return `${i ? 'L' : 'M'}${(x * W).toFixed(1)},${((1 - Math.min(1, Math.max(0, sampleCurve(points, x)))) * H).toFixed(1)}`;
  }).join('');
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair touch-none rounded-lg bg-panel-3 ring-1 ring-line"
      onPointerDown={(e) => {
        const [x, y] = at(e);
        // Perto de um ponto: arrasta ele; senão cria um novo.
        const near = points.findIndex(([px, py]) => Math.hypot((px - x) * W, (py - y) * H) < 9);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (near >= 0) setDrag(near);
        else {
          const next = [...points, [x, y] as [number, number]].sort((a, b) => a[0] - b[0]);
          onChange(next);
          setDrag(next.findIndex((p) => p[0] === x));
        }
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        const [x, y] = at(e);
        const next = points.map((p, i): [number, number] => {
          if (i !== drag) return p;
          // As pontas só sobem e descem; os outros pontos ficam entre os vizinhos.
          if (i === 0) return [0, y];
          if (i === points.length - 1) return [1, y];
          return [Math.min(points[i + 1][0] - 0.02, Math.max(points[i - 1][0] + 0.02, x)), y];
        });
        onChange(next);
      }}
      onPointerUp={() => setDrag(null)}
      onDoubleClick={(e) => {
        const [x, y] = at(e);
        const near = points.findIndex(([px, py], i) => i > 0 && i < points.length - 1 && Math.hypot((px - x) * W, (py - y) * H) < 9);
        if (near >= 0) onChange(points.filter((_, i) => i !== near));
      }}
    >
      {[0.25, 0.5, 0.75].map((g) => (
        <g key={g} stroke="rgba(255,255,255,0.08)">
          <line x1={g * W} y1={0} x2={g * W} y2={H} />
          <line x1={0} y1={g * H} x2={W} y2={g * H} />
        </g>
      ))}
      <line x1={0} y1={H} x2={W} y2={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x * W} cy={(1 - y) * H} r={4.5} fill={color} stroke="#000" strokeWidth={1} />
      ))}
    </svg>
  );
}

/** Correção de cor manual: rodas de sombras, meios-tons e altas luzes, saturação e curvas. */
export function GradeSection({ grade, onChange }: { grade: ColorGrade | undefined; onChange: (grade: ColorGrade | undefined) => void }) {
  const g = grade ?? createGrade();
  const [channel, setChannel] = useState<CurveChannel>('master');
  const set = (patch: Partial<ColorGrade>) => {
    const next = { ...g, ...patch };
    onChange(gradeIsNeutral(next) ? undefined : next);
  };
  return (
    <>
      <SectionTitle
        extra={
          grade && (
            <IconButton label={t('Zerar a correção manual')} onClick={() => onChange(undefined)}>
              <RotateCcw size={12} />
            </IconButton>
          )
        }
      >
        {t('Correção manual')}
      </SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        <Wheel label={t('Sombras')} wheel={g.shadows} onChange={(shadows) => set({ shadows })} />
        <Wheel label={t('Meios-tons')} wheel={g.midtones} onChange={(midtones) => set({ midtones })} />
        <Wheel label={t('Altas luzes')} wheel={g.highlights} onChange={(highlights) => set({ highlights })} />
      </div>
      <LabeledSlider
        label={t('Saturação')}
        value={g.saturation}
        display={`${Math.round(g.saturation * 100)}%`}
        min={0}
        max={2}
        step={0.01}
        onChange={(saturation) => set({ saturation })}
      />
      <div className="mb-1.5 mt-3 flex items-center justify-between">
        <span className="text-xs text-dim">{t('Curvas')}</span>
        <Segmented
          value={channel}
          onChange={setChannel}
          options={[
            { value: 'master', label: tc('cor', 'Geral') },
            { value: 'r', label: 'R' },
            { value: 'g', label: 'G' },
            { value: 'b', label: 'B' },
          ]}
        />
      </div>
      <CurveEditor
        points={g.curves[channel]}
        color={CHANNEL_COLOR[channel]}
        onChange={(points) => set({ curves: { ...g.curves, [channel]: points } })}
      />
      <p className="mt-1 text-[11px] leading-snug text-faint">
        {t('Clique na linha para criar um ponto e arraste. Duplo clique apaga o ponto. Um "S" suave dá mais contraste.')}
      </p>
      {g.curves[channel] !== STRAIGHT && g.curves[channel].length > 2 && (
        <button className="mt-1 text-[11px] text-faint hover:text-accent" onClick={() => set({ curves: { ...g.curves, [channel]: STRAIGHT } })}>
          {t('Endireitar esta curva')}
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- LUT

/** LUT 3D (.cube) importada, com intensidade. */
export function LutSection({
  luts,
  lut,
  onChange,
  onImport,
  notify,
}: {
  luts: SavedLut[];
  lut: VideoClip['lut'];
  onChange: (lut: VideoClip['lut']) => void;
  onImport: (lut: SavedLut) => void;
  notify: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <SectionTitle>LUT (.cube)</SectionTitle>
      <div className="flex gap-1.5">
        <select
          className="field h-8 min-w-0 flex-1 text-xs"
          value={lut?.id ?? ''}
          onChange={(e) => onChange(e.target.value ? { id: e.target.value, amount: lut?.amount ?? 1 } : undefined)}
        >
          <option value="">{t('Nenhuma')}</option>
          {luts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.size}³)
            </option>
          ))}
        </select>
        <Button variant="secondary" className="h-8 text-xs" icon={<FileUp size={13} />} onClick={() => fileRef.current?.click()}>
          {t('Importar')}
        </Button>
      </div>
      {lut && (
        <LabeledSlider
          label={t('Intensidade da LUT')}
          value={lut.amount}
          display={`${Math.round(lut.amount * 100)}%`}
          min={0}
          max={1}
          step={0.01}
          onChange={(amount) => onChange({ ...lut, amount })}
        />
      )}
      <p className="mt-1 text-[11px] leading-snug text-faint">
        {t('LUTs são os arquivos de cor que coloristas e fotógrafos vendem e compartilham (Premiere, DaVinci, Final Cut). A LUT fica salva no projeto.')}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".cube"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const saved = parseCube(await file.text(), file.name);
            onImport(saved);
            onChange({ id: saved.id, amount: 1 });
            notify(t('LUT "{name}" importada.', { name: saved.name }));
          } catch (error) {
            notify(error instanceof Error ? error.message : String(error));
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- Forma (máscara) da sobreposição

const SHAPES: { value: LayerMask['shape'] | 'none'; label: string }[] = [
  { value: 'none', label: t('Nenhuma') },
  { value: 'ellipse', label: '◯' },
  { value: 'rect', label: '▢' },
  { value: 'heart', label: '♥' },
  { value: 'star', label: '★' },
  { value: 'diamond', label: '◆' },
  { value: 'path', label: '✎' },
];

/** Recorta a camada numa forma (janela redonda, coração, estrela…). */
export function MaskSection({
  mask,
  onChange,
  onDraw,
}: {
  mask: LayerMask | null | undefined;
  onChange: (mask: LayerMask | null) => void;
  /** Abre o desenho da forma direto no vídeo */
  onDraw?: () => void;
}) {
  const m = mask ?? null;
  const set = (patch: Partial<LayerMask>) => m && onChange({ ...m, ...patch });
  return (
    <>
      <SectionTitle>{t('Forma (máscara)')}</SectionTitle>
      <Segmented
        options={SHAPES.map((s) => ({ value: s.value, label: s.label, title: s.value }))}
        value={m?.shape ?? 'none'}
        onChange={(shape) => {
          if (shape === 'none') return onChange(null);
          const next: LayerMask = { x: 0.5, y: 0.5, width: 0.8, height: 0.8, feather: 0.05, invert: false, ...m, shape };
          // Forma à mão começa vazia: os cliques no vídeo desenham o contorno.
          if (shape === 'path' && !next.points) next.points = [];
          onChange(next);
          if (shape === 'path') onDraw?.();
        }}
      />
      {m?.shape === 'path' && (
        <>
          <p className="mt-2 text-[11px] leading-snug text-faint">
            {m.keys?.length
              ? t('Forma à mão com {n} pontos e {k} keyframe(s): ela acompanha o movimento.', { n: (m.points?.length ?? 0) / 2, k: m.keys.length })
              : t('Forma à mão com {n} pontos.', { n: (m.points?.length ?? 0) / 2 })}
          </p>
          {onDraw && (
            <button className="mt-1.5 h-8 w-full rounded-lg border border-accent/50 bg-accent/10 text-xs text-fg hover:bg-accent/20" onClick={onDraw}>
              {t('✎ Desenhar no vídeo')}
            </button>
          )}
          <LabeledSlider label={t('Borda suave')} value={m.feather} display={`${Math.round(m.feather * 100)}%`} min={0} max={1} step={0.01} onChange={(feather) => set({ feather })} />
          <div className="mt-2">
            <SwitchRow checked={m.invert} onChange={(invert) => set({ invert })} label={t('Inverter (mostrar só o lado de fora)')} />
          </div>
        </>
      )}
      {m && m.shape !== 'path' && (
        <>
          <LabeledSlider label={t('Largura')} value={m.width} display={`${Math.round(m.width * 100)}%`} min={0.05} max={1.5} step={0.01} onChange={(width) => set({ width })} />
          <LabeledSlider label={t('Altura')} value={m.height} display={`${Math.round(m.height * 100)}%`} min={0.05} max={1.5} step={0.01} onChange={(height) => set({ height })} />
          <LabeledSlider label={t('Posição horizontal')} value={m.x} display={`${Math.round(m.x * 100)}%`} min={0} max={1} step={0.01} onChange={(x) => set({ x })} />
          <LabeledSlider label={t('Posição vertical')} value={m.y} display={`${Math.round(m.y * 100)}%`} min={0} max={1} step={0.01} onChange={(y) => set({ y })} />
          <LabeledSlider label={t('Borda suave')} value={m.feather} display={`${Math.round(m.feather * 100)}%`} min={0} max={1} step={0.01} onChange={(feather) => set({ feather })} />
          <div className="mt-2">
            <SwitchRow checked={m.invert} onChange={(invert) => set({ invert })} label={t('Inverter (mostrar só o lado de fora)')} />
          </div>
        </>
      )}
    </>
  );
}
