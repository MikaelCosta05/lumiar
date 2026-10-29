import { ArrowDown, ArrowUp, Timer, X } from 'lucide-react';
import { typingDuration } from '../media/typingRender';
import { CITIES, CITY_REGIONS, findCity } from '../project/maps';
import type { MapRoute, TextClip, Typing, WaveStyle } from '../project/text';
import { Button, IconButton, SectionTitle, Segmented, Slider, SwitchRow } from './kit';
import { t, tc } from '../i18n';

type Update = (update: (clip: TextClip) => TextClip) => void;

/** Ajustes dos textos e elementos especiais: digitação, rota no mapa e ondas de som. */
export function ElementSettings({ clip, onChange }: { clip: TextClip; onChange: Update }) {
  if (clip.shape === 'map' && clip.route) return <MapSettings clip={clip} route={clip.route} onChange={onChange} />;
  if (clip.shape === 'audiowave' && clip.wave) return <WaveSettings wave={clip.wave} onChange={onChange} />;
  if (clip.typing) return <TypingSettings clip={clip} typing={clip.typing} onChange={onChange} />;
  return null;
}

function TypingSettings({ clip, typing, onChange }: { clip: TextClip; typing: Typing; onChange: Update }) {
  const set = (patch: Partial<Typing>) => onChange((c) => ({ ...c, typing: { ...c.typing!, ...patch } }));
  const needed = typingDuration(clip.text, typing.speed);
  return (
    <>
      <SectionTitle>{t('Digitação')}</SectionTitle>
      <div className="space-y-2.5">
        <Segmented
          options={[
            { value: 'code', label: t('Editor de código') },
            { value: 'terminal', label: t('Terminal') },
            { value: 'none', label: t('Só o texto') },
          ]}
          value={typing.frame}
          onChange={(frame) => set({ frame })}
        />
        <div className="flex items-center justify-between text-[11px] text-dim">
          <span>{t('Velocidade')}</span>
          <span className="font-mono">{t('{n} letras/s', { n: typing.speed })}</span>
        </div>
        <Slider label={t('Velocidade da digitação')} value={typing.speed} min={4} max={60} step={1} onChange={(speed) => set({ speed })} />
        <SwitchRow checked={typing.highlight} onChange={(highlight) => set({ highlight })} label={t('Cores de código (palavras-chave, textos, números)')} />
        {Math.abs(needed - clip.duration) > 0.3 && (
          <Button variant="ghost" icon={<Timer size={13} />} className="h-7 w-full text-xs" onClick={() => onChange((c) => ({ ...c, duration: needed }))}>
            {t('Ajustar a duração para digitar tudo ({s}s)', { s: needed.toFixed(1) })}
          </Button>
        )}
      </div>
    </>
  );
}

function MapSettings({ clip, route, onChange }: { clip: TextClip; route: MapRoute; onChange: Update }) {
  const set = (patch: Partial<MapRoute>) => onChange((c) => ({ ...c, route: { ...c.route!, ...patch } }));
  const move = (i: number, d: -1 | 1) => {
    const stops = [...route.stops];
    [stops[i], stops[i + d]] = [stops[i + d], stops[i]];
    set({ stops });
  };
  const options = CITY_REGIONS.map((region) => (
    <optgroup key={region} label={t(region)}>
      {CITIES.filter((c) => c.region === region).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </optgroup>
  ));
  return (
    <>
      <SectionTitle extra={<span className="text-[11px] text-faint">{t('{n} paradas', { n: route.stops.length })}</span>}>{t('Rota no mapa')}</SectionTitle>
      <div className="space-y-1.5">
        {route.stops.map((id, i) => (
          <div key={`${id}-${i}`} className="flex items-center gap-1">
            <span className="w-4 text-center font-mono text-[10px] text-faint">{i + 1}</span>
            <select
              className="field h-7 min-w-0 flex-1 text-xs"
              value={id}
              onChange={(e) => set({ stops: route.stops.map((s, j) => (j === i ? e.target.value : s)) })}
            >
              {!findCity(id) && <option value={id}>{id}</option>}
              {options}
            </select>
            <IconButton label={tc('ordem', 'Subir')} className="size-6" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={12} />
            </IconButton>
            <IconButton label={tc('ordem', 'Descer')} className="size-6" disabled={i === route.stops.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={12} />
            </IconButton>
            <IconButton
              label={t('Tirar parada')}
              className="size-6 hover:!text-danger"
              disabled={route.stops.length <= 2}
              onClick={() => set({ stops: route.stops.filter((_, j) => j !== i) })}
            >
              <X size={12} />
            </IconButton>
          </div>
        ))}
        <select className="field h-8 w-full text-xs" value="" onChange={(e) => e.target.value && set({ stops: [...route.stops, e.target.value] })}>
          <option value="">{t('+ Adicionar uma parada…')}</option>
          {options}
        </select>
      </div>
      <SectionTitle>{t('Viagem')}</SectionTitle>
      <div className="space-y-2.5">
        <Segmented
          options={[
            { value: 'plane', label: t('✈️ Avião') },
            { value: 'car', label: t('🚗 Carro') },
            { value: 'ship', label: t('🚢 Navio') },
            { value: 'none', label: t('Só a linha') },
          ]}
          value={route.vehicle}
          onChange={(vehicle) => set({ vehicle })}
        />
        <Segmented
          options={[
            { value: 'dark', label: t('Escuro') },
            { value: 'light', label: t('Claro') },
            { value: 'paper', label: t('Papel antigo') },
          ]}
          value={route.theme}
          onChange={(theme) => set({ theme })}
        />
        <div className="flex items-center justify-between text-[11px] text-dim">
          <span>{t('Parado no começo e no fim')}</span>
          <span className="font-mono">{(route.pause * clip.duration).toFixed(1)}s</span>
        </div>
        <Slider label={t('Pausa')} value={route.pause} min={0} max={0.35} step={0.01} onChange={(pause) => set({ pause })} />
        <p className="text-[11px] leading-snug text-faint">{t('A cor da linha é a cor do texto (aba Estilo). Deixe o clipe mais longo para a viagem ficar mais lenta.')}</p>
      </div>
    </>
  );
}

function WaveSettings({ wave, onChange }: { wave: WaveStyle; onChange: Update }) {
  const set = (patch: Partial<WaveStyle>) => onChange((c) => ({ ...c, wave: { ...c.wave!, ...patch } }));
  return (
    <>
      <SectionTitle>{t('Ondas de som')}</SectionTitle>
      <div className="space-y-2.5">
        <Segmented
          options={[
            { value: 'mirror', label: t('Espelho') },
            { value: 'bars', label: t('Barras') },
            { value: 'circle', label: t('Círculo') },
            { value: 'line', label: t('Linha') },
          ]}
          value={wave.kind}
          onChange={(kind) => set({ kind })}
        />
        <div className="flex items-center justify-between text-[11px] text-dim">
          <span>{t('Quantidade de barras')}</span>
          <span className="font-mono">{wave.bands}</span>
        </div>
        <Slider label={t('Barras')} value={wave.bands} min={12} max={96} step={4} onChange={(bands) => set({ bands })} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-dim">{t('Cor das pontas')}</span>
          <label className="relative size-6 cursor-pointer rounded-md ring-1 ring-white/20" style={{ background: wave.color2 }}>
            <input type="color" className="sr-only" value={wave.color2} onChange={(e) => set({ color2: e.target.value })} />
          </label>
        </div>
        <p className="text-[11px] leading-snug text-faint">
          {t('Reage a todo o som do projeto (voz, música, efeitos). Ótimo para transformar um podcast só de áudio em vídeo: ponha uma imagem de fundo, as ondas e as legendas.')}
        </p>
      </div>
    </>
  );
}
