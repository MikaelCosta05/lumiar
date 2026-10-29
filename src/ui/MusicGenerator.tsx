import { ChevronDown, Dices, LoaderCircle, Play, Plus, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { generateMusic, MUSIC_STYLE_NAMES } from '../media/generatedMusic';
import { MUSIC_STYLE_SPECS, styleSpec, type MusicOptions, type MusicStyle } from '../media/musicGen';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, Slider } from './kit';

export interface MusicGeneratorProps {
  /** Onde a música entra e quanto dura (o trecho selecionado ou o vídeo inteiro) */
  range: { start: number; duration: number; selected: boolean };
  onAdd: (options: MusicOptions, start: number) => Promise<void>;
}

const DESCRIPTIONS: Record<MusicStyle, string> = {
  lofi: t('Piano elétrico, bateria preguiçosa e chiado de vinil.'),
  tensao: t('Cordas pulsando, relógio e coração acelerando.'),
  epico: t('Cordas, tambores e metais graves de trailer.'),
  terror: t('Drones graves, metal raspando e fita lenta.'),
  alegre: t('Ukulele, palmas e sininhos para vlog.'),
  eletronico: t('Bumbo reto, sintetizador bombeando e arpejo.'),
};

/** Um só player para ouvir antes. */
let player: HTMLAudioElement | null = null;

/** "Gerar música" na aba Sons: estilo, duração, andamento, intensidade e variação, com botão de ouvir. */
export function MusicGenerator({ range, onAdd }: MusicGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<MusicStyle>('lofi');
  const [bpm, setBpm] = useState(styleSpec('lofi').bpm);
  const [intensity, setIntensity] = useState(0.6);
  const [seed, setSeed] = useState(1);
  // A duração segue o vídeo/trecho até a pessoa digitar outra.
  const [custom, setCustom] = useState<number | null>(null);
  const duration = Math.max(2, Math.min(900, custom ?? range.duration));
  const [progress, setProgress] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [adding, setAdding] = useState(false);
  const urlRef = useRef<string | null>(null);

  const spec = styleSpec(style);
  const options: MusicOptions = { style, duration, bpm, intensity, seed };

  const stop = () => {
    player?.pause();
    player = null;
    setPlaying(false);
  };
  useEffect(
    () => () => {
      stop();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );
  // Mudou alguma opção: o que está tocando já não é essa música.
  useEffect(stop, [style, duration, bpm, intensity, seed]);

  const listen = async () => {
    if (playing) {
      stop();
      return;
    }
    try {
      setProgress(0);
      const music = await generateMusic(options, setProgress);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(music.file);
      player?.pause();
      const audio = new Audio(urlRef.current);
      player = audio;
      audio.onended = () => setPlaying(false);
      setPlaying(true);
      void audio.play().catch(() => setPlaying(false));
    } finally {
      setProgress(null);
    }
  };

  const add = async () => {
    stop();
    setAdding(true);
    try {
      await onAdd(options, range.start);
    } finally {
      setAdding(false);
    }
  };

  const busy = progress !== null || adding;
  return (
    <div className="rounded-lg border border-line bg-panel-2">
      <button className="flex w-full items-center gap-2 px-2.5 py-2 text-left" onClick={() => setOpen((o) => !o)}>
        <Sparkles size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block whitespace-nowrap text-xs font-semibold text-fg">{t('Gerar música')}</span>
          <span className="block truncate text-[10px] text-faint">{t('sem direitos autorais')}</span>
        </span>
        <ChevronDown size={14} className={cx('text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line px-2.5 pb-2.5 pt-2">
          <div className="grid grid-cols-2 gap-1">
            {MUSIC_STYLE_SPECS.map((s) => (
              <button
                key={s.id}
                title={DESCRIPTIONS[s.id]}
                disabled={busy}
                onClick={() => {
                  setStyle(s.id);
                  setBpm(s.bpm);
                }}
                className={cx(
                  'rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                  style === s.id ? 'bg-accent/20 text-fg ring-1 ring-accent/60' : 'bg-panel-3 text-dim hover:text-fg',
                )}
              >
                {MUSIC_STYLE_NAMES[s.id]}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-faint">{DESCRIPTIONS[style]}</p>

          <label className="flex items-center gap-2 text-[11px] text-dim">
            <span className="w-20 shrink-0">{t('Duração')}</span>
            <input
              type="number"
              className="field h-7 w-20 text-xs"
              min={2}
              max={900}
              step={0.1}
              value={Number(duration.toFixed(2))}
              disabled={busy}
              onChange={(e) => setCustom(Number(e.target.value) || null)}
            />
            <span className="text-faint">s</span>
            {custom !== null && (
              <button className="ml-auto text-[10px] text-accent hover:underline" onClick={() => setCustom(null)}>
                {range.selected ? t('do trecho') : t('do vídeo')}
              </button>
            )}
          </label>
          <p className="-mt-1.5 text-[10px] text-faint">
            {range.selected
              ? t('Trecho selecionado: {from} a {to}', { from: formatTime(range.start), to: formatTime(range.start + duration) })
              : t('Começa em {from} e termina junto com o vídeo.', { from: formatTime(range.start) })}
          </p>

          <div className="flex items-center gap-2 text-[11px] text-dim">
            <span className="w-20 shrink-0">{t('Andamento')}</span>
            <Slider value={bpm} min={spec.minBpm} max={spec.maxBpm} step={1} onChange={setBpm} label={t('Andamento')} className="flex-1" />
            <span className="w-14 text-right font-mono text-[10px] text-faint">{bpm} BPM</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-dim">
            <span className="w-20 shrink-0">{t('Intensidade')}</span>
            <Slider value={intensity} min={0} max={1} step={0.05} onChange={setIntensity} label={t('Intensidade')} className="flex-1" />
            <span className="w-14 text-right font-mono text-[10px] text-faint">{Math.round(intensity * 100)}%</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-dim">
            <span className="w-20 shrink-0">{t('Variação')}</span>
            <span className="font-mono text-[10px] text-faint">#{seed}</span>
            <button
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-panel-3 px-2 py-1 text-[11px] text-dim hover:text-fg disabled:opacity-40"
              disabled={busy}
              title={t('Outra melodia, outros acordes e outro ritmo no mesmo estilo')}
              onClick={() => setSeed((s) => s + 1 + Math.floor(Math.random() * 97))}
            >
              <Dices size={12} />
              {t('Gerar outra')}
            </button>
          </div>

          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              className="h-8 min-w-[76px] px-2.5 text-xs"
              disabled={adding}
              icon={progress !== null ? <LoaderCircle size={13} className="animate-spin" /> : playing ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              onClick={() => void listen()}
            >
              {progress !== null ? `${Math.round(progress * 100)}%` : playing ? t('Parar') : t('Ouvir')}
            </Button>
            <Button
              variant="primary"
              className="h-8 flex-1 whitespace-nowrap px-2 text-xs"
              disabled={busy}
              icon={adding ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />}
              onClick={() => void add()}
            >
              {t('Pôr na timeline')}
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-faint">
            {t('Composta na hora pelo próprio Lumiar, sem internet e sem trechos de músicas de ninguém. Vai para a trilha de música, que abaixa sozinha quando alguém fala.')}
          </p>
        </div>
      )}
    </div>
  );
}
