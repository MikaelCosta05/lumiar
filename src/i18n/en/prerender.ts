// Pré-renderizar trecho (menu da timeline, progresso e avisos).
export default {
  'Pré-renderizando {from} – {to}': 'Pre-rendering {from} – {to}',
  'Pré-renderização pronta: {from} – {to} agora toca sem engasgos ({size}).': 'Pre-render ready: {from} – {to} now plays smoothly ({size}).',
  '{n} pré-renderização(ões) mais antiga(s) apagada(s) para não passar de {limit} de memória.': '{n} older pre-render(s) deleted to stay under {limit} of memory.',
  'Pré-renderização cancelada.': 'Pre-render canceled.',
  'Não foi possível pré-renderizar o trecho: {error}': 'Could not pre-render this section: {error}',
  'Não há nada para pré-renderizar neste ponto da timeline.': 'There is nothing to pre-render at this point of the timeline.',
  'Trecho na fila de pré-renderização.': 'Section added to the pre-render queue.',
  'Pré-renderizações apagadas: o preview volta a renderizar ao vivo.': 'Pre-renders deleted: the preview renders live again.',
  'Pré-renderizar este trecho': 'Pre-render this section',
  'Apagar pré-renderizações ({size})': 'Delete pre-renders ({size})',
  '+{n} na fila': '+{n} queued',
  'Cancelar a pré-renderização': 'Cancel the pre-render',
} satisfies Record<string, string>;
