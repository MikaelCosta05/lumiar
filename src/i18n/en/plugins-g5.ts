// Efeitos e transições com a pessoa, a profundidade e o terror analógico: nome, descrição e controles.
// (Rótulos que já existem em outros arquivos, como "Brilho da borda" e "Suavidade", ficam lá.)
export default {
  // pessoa-invisivel
  'Pessoa invisível': 'Invisible person',
  'O corpo vira vidro: dá para ver o fundo através da pessoa, torto como numa lente, com a borda cintilando de leve (a IA encontra a pessoa e o que está atrás dela).':
    'The body turns to glass: you see the background through the person, bent like a lens, with a faint shimmer on the edge (the AI finds the person and what is behind them).',
  'Invisibilidade': 'Invisibility',
  'Distorção do vidro': 'Glass distortion',
  'Cintilação': 'Shimmer',
  // olhos-brilhando
  'Olhos brilhando': 'Glowing eyes',
  'Os olhos acendem como os de um bicho no escuro, ou ficam totalmente pretos. Marque onde estão os dois olhos (os pacotes usam o seguir rosto, que deixa o rosto no centro).':
    'The eyes light up like an animal in the dark, or turn completely black. Mark where both eyes are (packs use face follow, which keeps the face in the center).',
  'Modo (0 = brilhando, 1 = totalmente pretos)': 'Mode (0 = glowing, 1 = completely black)',
  'Olho da esquerda': 'Left eye',
  'Olho da direita': 'Right eye',
  'Tamanho dos olhos': 'Eye size',
  'Brilho em volta': 'Glow around',
  // quadro-subliminar
  'Quadro subliminar': 'Subliminal frame',
  'De vez em quando, um quadro diferente pisca por um instante: negativo, contraste estourado, imagem de cabeça para baixo ou o rosto bem de perto. Quase não dá para ver, mas dá para sentir.':
    'Every now and then a different frame flashes for an instant: a negative, blown-out contrast, the picture upside down or the face up close. You can barely see it, but you can feel it.',
  'Piscadas por segundo': 'Flashes per second',
  'Primeira piscada (s)': 'First flash (s)',
  'Irregularidade': 'Irregularity',
  'Duração (quadros)': 'Length (frames)',
  'Tipo (0 = sorteado · 1 negativo · 2 contraste · 3 de cabeça para baixo · 4 de perto)':
    'Type (0 = random · 1 negative · 2 contrast · 3 upside down · 4 close-up)',
  'Onde aproximar (rosto)': 'Where to zoom in (face)',
  'Quanto aproximar': 'Zoom amount',
  'Chiado no quadro': 'Noise on the frame',
  // sombra-atrasada
  'Sombra atrasada': 'Lagging shadow',
  'A sombra da pessoa aparece na parede atrás dela, mas não acompanha direito: se mexe um pouco depois, como se tivesse vontade própria. Funciona tocando.':
    "The person's shadow shows up on the wall behind them, but it doesn't keep up: it moves a moment later, as if it had a will of its own. Works during playback.",
  'Atraso (s)': 'Delay (s)',
  'Deslocar para o lado': 'Shift sideways',
  'Deslocar para cima': 'Shift up',
  'Escuridão': 'Darkness',
  'Sombra difusa': 'Soft shadow',
  'Cor da sombra': 'Shadow color',
  // tela-de-teste
  'Tela de teste da TV': 'TV test screen',
  'As barras coloridas de fim de transmissão e a tela de "sem sinal" com chiado entram e saem por cima da imagem, como TV trocando de canal sozinha.':
    'The end-of-broadcast color bars and the noisy "no signal" screen come and go over the picture, like a TV changing channels on its own.',
  'Mistura': 'Mix',
  'Interferência': 'Interference',
  'Entrar e sair sozinho (0 = sempre na tela)': 'Come and go on its own (0 = always on screen)',
  'Trocas por segundo': 'Switches per second',
  'Quanto tempo no chiado': 'Time on static',
  // pintura-que-se-mexe
  'Pintura que se mexe': 'Moving painting',
  'O vídeo vira uma pintura de pinceladas grossas e redemoinhos, à moda dos pós-impressionistas. As pinceladas seguem o movimento da cena e a tinta parece viva.':
    'The video becomes a painting of thick brushstrokes and swirls, in the post-impressionist style. The strokes follow the motion in the scene and the paint seems alive.',
  'Tamanho da pincelada': 'Brushstroke size',
  'Seguir o movimento': 'Follow the motion',
  'Redemoinhos': 'Swirls',
  'Cores vivas': 'Vivid colors',
  'Relevo da tinta': 'Paint texture',
  // luz-de-estudio
  'Luz de estúdio': 'Studio light',
  'Ilumina a pessoa de novo, depois de gravado: escolha de que lado vem a luz, a cor, a força e se ela é dura ou suave. A IA estima o volume do rosto pela profundidade.':
    'Relights the person after recording: choose which side the light comes from, its color, its strength and whether it is hard or soft. The AI estimates the shape of the face from depth.',
  'De onde vem a luz (graus)': 'Light direction (degrees)',
  'Altura da luz': 'Light height',
  'Força da luz': 'Light strength',
  'Escurecer o outro lado': 'Darken the other side',
  'Escurecer o fundo': 'Darken the background',
  'Só na pessoa': 'Only on the person',
  // passar-pela-pessoa
  'Passar pela pessoa': 'Through the person',
  'A pessoa do clipe atual vira uma janela para o próximo: o corpo dela varre a tela e deixa o próximo clipe por onde passa (a IA encontra a pessoa).':
    "The person in the current clip becomes a window into the next one: their body sweeps across the screen and leaves the next clip wherever it passes (the AI finds the person).",
  'Direção (0 = para a direita, 1 = para a esquerda)': 'Direction (0 = to the right, 1 = to the left)',
  'Abrir para cima e para baixo': 'Open up and down',
  // por-profundidade
  'Por profundidade': 'By depth',
  'O próximo clipe aparece primeiro no fundo, no que está mais longe, e vem avançando até a frente, como uma névoa que atravessa a cena (a IA calcula a profundidade).':
    'The next clip appears first in the background, in what is farthest away, and moves forward to the front, like a mist crossing the scene (the AI works out the depth).',
  'Sentido (0 = do fundo para a frente, 1 = da frente para o fundo)': 'Direction (0 = back to front, 1 = front to back)',
  'Cor da frente': 'Front color',
  'Brilho da frente': 'Front glow',
  // fita-rebobinando
  'Fita rebobinando': 'Rewinding tape',
  'O videocassete volta a fita cada vez mais rápido: a imagem rola, treme e se rasga em faixas de tracking, e no meio do chiado já entra o próximo clipe.':
    'The VCR rewinds the tape faster and faster: the picture rolls, shakes and tears into tracking bars, and in the middle of the static the next clip comes in.',
  'Faixas de tracking': 'Tracking bars',
  'Mostrar o ◀◀ na tela': 'Show ◀◀ on screen',
  // queda-de-sinal
  'Queda de sinal': 'Signal drop',
  'Como TV digital com sinal fraco: a imagem trava, se desmancha em quadradinhos borrados e de cor errada, e quando o sinal volta já está no próximo clipe.':
    'Like digital TV with a weak signal: the picture freezes, breaks into blurry, off-color squares, and when the signal comes back it is already on the next clip.',
  'Tamanho dos blocos (px)': 'Block size (px)',
  'Quantidade de defeitos': 'Amount of glitches',
  'Blocos de cor errada': 'Off-color blocks',
  'Travar a imagem antes': 'Freeze the picture first',
  // entrar-pelo-olho
  'Entrar pelo olho': 'Into the eye',
  'A câmera mergulha num olho até a pupila escura tomar a tela, e o próximo clipe se abre de dentro dela, como uma íris. Marque o olho (os pacotes usam o seguir rosto).':
    'The camera dives into an eye until the dark pupil fills the screen, and the next clip opens from inside it, like an iris. Mark the eye (packs use face follow).',
  'Onde está o olho': 'Where the eye is',
  'Cor da íris': 'Iris color',
  'Íris na abertura': 'Iris on the opening',
} satisfies Record<string, string>;
