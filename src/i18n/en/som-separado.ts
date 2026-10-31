// Gravar a tela com o som de um programa (ex.: Discord), o microfone e o computador em trilhas separadas
export default {
  'Som de um programa numa trilha separada': 'Put one program’s sound on its own track',
  'Atualizar a lista de programas': 'Refresh the list of programs',
  'Não separar (tudo junto com a tela)': 'Don’t separate (all together with the screen)',
  '{app}, o microfone e o resto do computador vão cada um na sua trilha, para ajustar o volume, cortar ou limpar um sem mexer nos outros.':
    '{app}, the microphone and the rest of the computer each get their own track, so you can adjust the volume, cut or clean one without touching the others.',
  '{app} e o microfone vão cada um na sua trilha. Ligue "som do computador" para gravar também o jogo ou a música, em outra trilha.':
    '{app} and the microphone each get their own track. Turn on "computer audio" to also record the game or music, on another track.',
  'Ex.: escolha o Discord para a voz da chamada ficar numa trilha só dela.': 'E.g. pick Discord so the call’s voices get a track of their own.',
  'O som veio em {n} trilhas separadas.': 'The sound came in {n} separate tracks.',
  '{app} {time}.wav': '{app} {time}.wav',
  'Computador sem {app} {time}.wav': 'Computer without {app} {time}.wav',
  'Microfone {time}.webm': 'Microphone {time}.webm',
  'Computador': 'Computer',
  'Programa': 'Program',
} satisfies Record<string, string>;
