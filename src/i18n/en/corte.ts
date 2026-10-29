// Ferramentas de corte profissionais da timeline: slip, slide e roll.
export default {
  'Ferramenta de corte': 'Edit tool',
  'Seleção': 'Selection',
  'Slip': 'Slip',
  'Slide': 'Slide',
  'Roll': 'Roll',
  'Ferramenta de seleção': 'Selection tool',
  'Ferramenta slip (trocar o trecho dentro do clipe)': 'Slip tool (change the part shown inside the clip)',
  'Ferramenta slide (mover o clipe entre os vizinhos)': 'Slide tool (move the clip between its neighbors)',
  'Ferramenta roll (mover o corte entre dois clipes)': 'Roll tool (move the cut between two clips)',
  'Seleção: mover e cortar pelas bordas': 'Selection: move and trim by the edges',
  'Slip: arraste dentro do clipe para trocar o trecho mostrado, sem mudar o lugar nem o tamanho':
    'Slip: drag inside the clip to change which part is shown, without changing its position or length',
  'Slide: arraste um clipe da trilha principal entre os vizinhos; eles se ajustam e a duração total fica a mesma':
    'Slide: drag a main track clip between its neighbors; they adjust and the total length stays the same',
  'Roll: arraste o corte entre dois clipes; um cresce, o outro diminui e a duração total fica a mesma':
    'Roll: drag the cut between two clips; one gets longer, the other shorter, and the total length stays the same',
  'Entrada {time}': 'In {time}',
  'Saída {time}': 'Out {time}',
  'começa em {time}': 'starts at {time}',
  'corte em {time}': 'cut at {time}',
  'Este clipe não tem o que deslizar (imagens ficam iguais).': 'There is nothing to slip in this clip (images look the same).',
  'O slide precisa de um clipe de cada lado na trilha principal.': 'Slide needs a clip on each side on the main track.',
  'O roll precisa de dois clipes vizinhos na trilha principal.': 'Roll needs two neighboring clips on the main track.',
} satisfies Record<string, string>;
