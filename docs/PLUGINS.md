# Criando efeitos, transições e filtros

Tudo o que aparece nas bibliotecas do Lumiar é um plugin: uma pasta dentro de `plugins/` com um
`plugin.json` (nome e controles) e um `shader.glsl` (o que acontece com cada pixel, rodando na placa de vídeo).
Não precisa mexer em mais nada do código: com o `npm run dev` aberto, a pasta nova aparece na hora.

## Criando um efeito

Crie a pasta `plugins/effects/meu-efeito/` com dois arquivos. Ele aparece no editor
automaticamente, sem mexer em código. Se o editor estiver aberto, a página recarrega sozinha.

**plugin.json**: nome e parâmetros (os controles são gerados a partir daqui)

```json
{
  "name": "Meu efeito",
  "description": "O que ele faz.",
  "category": "Estilizar",
  "params": [
    { "id": "amount", "label": "Intensidade", "type": "float", "default": 0.5, "min": 0, "max": 1 },
    { "id": "tint", "label": "Cor", "type": "color", "default": "#ff0080" },
    { "id": "center", "label": "Centro", "type": "vec2", "default": [0.5, 0.5], "min": 0, "max": 1 }
  ]
}
```

A miniatura da biblioteca é gerada pelo próprio shader. Se os valores padrão não deixam o efeito
visível, adicione `"preview": { "amount": 0.9 }` ao plugin.json: esses valores só valem para a miniatura.

A miniatura aparece sobre uma mídia de exemplo escolhida pela categoria (a maioria fica com uma pessoa falando;
efeitos com o tempo, com uma pessoa se mexendo; céu, clima e profundidade, com uma paisagem). Para escolher outra,
use `"previewMedia"`: `"pessoa"`, `"movimento"`, `"silhueta"` (terror, VHS), `"retrato"` (foto de rosto),
`"paisagem"`, `"cidade"` (noite) ou `"drone"`. As regras ficam em `src/ui/previewMedia.ts`.

**shader.glsl**: recebe a coordenada `uv` (0 a 1) e devolve a cor do pixel

```glsl
vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  return vec4(mix(c.rgb, tint, amount), c.a);
}
```

Disponível dentro de um efeito:

| Nome | Tipo | O que é |
|---|---|---|
| `getColor(uv)` | função | cor da imagem nessa posição |
| `time` | float | segundos desde o início do clipe |
| `duration` | float | duração do clipe |
| `ratio` | float | largura / altura |
| `resolution` | vec2 | tamanho do quadro em pixels |
| `PI` | constante | 3.14159… |
| seus parâmetros | float / vec2 / vec3 (cor) | pelo `id` do plugin.json |

### A pessoa, a profundidade e o passado

Um efeito também pode usar o que a IA e o motor calculam. Basta chamar a função no código: o Lumiar percebe
e só calcula o que o efeito usa (a pessoa e a profundidade custam processamento).

| Nome | O que devolve |
|---|---|
| `getPerson(uv)` | onde está a pessoa: 1 = pessoa, 0 = fundo (a mesma IA do "remover o fundo") |
| `getBackground(uv)` | o fundo sem a pessoa: o que estava atrás dela (visto antes ou preenchido em volta) |
| `getDepth(uv)` | profundidade: 1 = perto, 0 = longe (baixa um modelo na primeira vez; até ficar pronto, uma estimativa simples) |
| `getPast(uv, segundos)` | o quadro de até ~1 s atrás; no alfa, onde a pessoa estava naquele instante |
| `getMotion(uv)` | quanto a imagem andou desde o quadro anterior nesse ponto (em uv) |
| `vec4 state(vec2 uv)` | escreva esta função para guardar uma imagem de um quadro para o outro |
| `getPrevious(uv)` | o que `state` devolveu: dentro de `state`, o do quadro anterior; dentro de `effect`, o deste quadro |
| `firstFrame()` | verdadeiro no começo do clipe ou depois de pular no tempo (ainda não há passado) |

Exemplo, um efeito que deixa a pessoa colorida e o fundo em preto e branco:

```glsl
vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 gray = vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114)));
  return vec4(mix(gray, c.rgb, getPerson(uv)), c.a);
}
```

E um rastro que nunca se apaga (o `state` guarda a pintura, o `effect` mostra):

```glsl
vec4 state(vec2 uv) {
  if (firstFrame()) return getColor(uv);
  return max(getPrevious(uv) * 0.98, getColor(uv));
}

vec4 effect(vec2 uv) {
  return getPrevious(uv);
}
```

Efeitos com passado dependem da ordem dos quadros. Tocando, o motor recebe um quadro depois do outro. Pausado (ou ao
soltar o cursor depois de arrastar), o preview mostra primeiro só o instante atual e, em seguida, calcula por trás
o trecho anterior (cerca de 1 s; numa transição, desde o começo dela) e mostra o quadro igual ao da exportação. Por
isso `firstFrame()` também é verdadeiro no começo desse trecho.

### A biblioteca pronta (funções `lm…`)

Todo filtro, efeito e transição já recebe uma biblioteca de funções testadas (o código está em
`src/engine/glslLib.ts`). O que o plugin não usa é descartado pelo compilador, então ela não pesa. Use-a no lugar
dos truques comuns que deixam o resultado com cara de amador:

| Para | Use | Em vez de |
|---|---|---|
| Acaso | `lmHash(p)`, `lmHash2`, `lmHash3`, `lmCellHash(floor)`; `lmIGN(gl_FragCoord.xy)` para girar amostras e fazer dither | `fract(sin(dot(p, …)) * 43758.5)`, que faz listras e muda de placa para placa |
| Texturas orgânicas | `lmNoise(vec2/vec3)`, `lmFbm(p, oitavas)`, `lmCurl(p, t)` | acaso por pixel |
| Grão de filme | `lmFilmGrain(cor, uv, intensidade, tamanho, time)`: mais forte nos meios-tons, 24 quadros de grão por segundo | ruído branco somado |
| Desfoque | `lmGaussianBlur(uv, raio)`, `lmDiskBlur` (lente), `lmMotionBlur(uv, direção, n)`, `lmZoomBlur(uv, centro, quanto, n)` | grade de amostras, que deixa cópias fantasmas |
| Brilho largo | `lmBloom(uv, limiar, raio)`: devolve a luz extra (luz linear), em vários níveis de detalhe, sem blocos | laço enorme de amostras |
| Aberração cromática | `lmChromatic(uv, centro, quanto)`: espectro contínuo, crescendo para a borda | três cópias deslocadas |
| Cor | `lmLuma` (Rec.709), `lmToLinear`/`lmToSrgb`, `lmSaturate`, `lmHueRotate` (Oklab), `lmWhiteBalance`, `lmSoftClip`, `lmTonemap` | `dot(c, vec3(0.299, 0.587, 0.114))`, girar matiz em HSV |
| Misturas | `lmScreen`, `lmOverlay`, `lmSoftLight`, `lmColorDodge`, `lmAddLight` (soma de luz em luz linear) | somar e cortar em 1 |
| Formas | `lmCentered(uv)` (círculo é círculo), `lmRotate`, `lmSdCircle`/`lmSdBox`/`lmSdRoundBox`/`lmSdSegment` + `lmFill(distância)` (borda sem serrilhado), `lmStep`, `lmVignette` | `step`, `length(uv - 0.5)` |
| Tamanhos | `lmPx(n)` / `lmPxUv(n)`: n pixels de um vídeo 1080p, iguais em qualquer resolução e na miniatura | pixels de `resolution` |
| Animação | `lmEaseInOutCubic`, `lmEaseOutExpo`, `lmEaseInOutQuint`, `lmEaseOutBack`, `lmSpring`, `lmBell`, `lmPulse`… | movimento linear |

Nas transições, as funções que leem a imagem existem para os dois clipes, com `From` e `To` no nome:
`lmMotionBlurFrom(uv, direção, n)`, `lmZoomBlurTo(…)`, `lmBloomFrom(…)` etc. `getColorLod(uv, nível)` (e
`getFromColorLod`/`getToColorLod`) lê a imagem num nível de detalhe (0 = nítida, cada +1 = metade da resolução).

As imagens entre um efeito e outro são de 16 bits, e a saída tem dither: degradês não fazem degraus. A cor que o
plugin devolve continua sendo cortada entre 0 e 1.

Para ver um plugin em alta resolução e comparar versões, há uma bancada (só para quem desenvolve):

```
npx electron scripts/bench/run.cjs --ids effects/meu-efeito --out pasta [--ai] [--size 1920x1080] [--timing]
npx electron scripts/bench/compare.cjs pasta-antes pasta-depois
```

**Teste visual** (comparar antes e depois sem ser a olho). Antes de mexer, grave a referência; depois de mexer,
compare:

```
npm run visual:ref                               # referência de tudo em .tmp-visual/referencia (uns minutos)
npm run visual                                   # desenha de novo e compara
npm run visual -- --ids effects/desfoque,packs/  # só esses (ids ou prefixos; vale para os dois comandos)
```

Cada plugin é desenhado a 480x270, nos mesmos instantes da bancada (efeitos e filtros em 0,5, 1,5 e 2,5 s,
transições em 25%, 50% e 75%, pacotes em 4 pontos do bloco), com a pessoa e a profundidade da IA, e salvo em PNG
(sem o ruído do JPEG). Os quadros do vídeo de exemplo são decodificados um a um, sem buscar no `<video>` (a busca às
vezes entrega o quadro vizinho): duas rodadas seguidas na mesma máquina dão diferença zero, inclusive nos efeitos
com memória, nos de ruído e nos de IA. A referência fica fora do git porque cada placa de vídeo desenha um pouco
diferente: gere a sua antes de mexer. `visual:ref` com `--ids` troca só esses na referência.

Um pixel conta como mudado quando um canal muda mais de 6 (de 255); um quadro mudou quando mais de 0,15% dos pixels
mudaram ou a diferença média passou de 0,5 (pega o que mudou pouco na imagem toda). Para comparar, um desfoque de 6
para 9 px (o que acontece ao trocar a referência de tamanho de 720p para 1080p) muda 1,3% dos pixels. A lista sai
no terminal do mais diferente para o menos (erros, plugins que sumiram, os que mudaram, os sem referência), e
`.tmp-visual/relatorio.html` mostra referência | atual | diferença de cada quadro que mudou (clique na atual para
piscar com a referência; na diferença, o que mudou fica em magenta). O comando sai com erro se algo mudou. A lógica
(métrica, limites, ordem, relatório) fica em `scripts/bench/visualDiff.ts`, com testes ao lado. `--todos` lista
também os iguais; `--param effects/desfoque:radius=9` troca um valor só nessa rodada (para conferir que acusa);
`--pasta outra` usa outra pasta no lugar de `.tmp-visual`.

## Compartilhando efeitos (.lumiarfx)

Os efeitos feitos no **Editor de efeitos** ficam só neste computador, em Efeitos → "Meus efeitos". Para mandar
para alguém (ou levar para outro computador), use um arquivo `.lumiarfx`:

- **Exportar um efeito**: no editor, abra o efeito e clique em **Exportar**.
- **Exportar todos**: botão de baixar ao lado de "Meus efeitos" no editor, ou no topo da aba Efeitos.
- **Importar**: botão de enviar nos mesmos lugares. Os efeitos entram em "Meus efeitos" na hora.

Na importação, cada efeito é conferido (campos, tipos, tamanho) e o shader é compilado como no editor; o que não
compila fica de fora, com o motivo no aviso. Nada é sobrescrito: se já existe um efeito com o mesmo id, ele entra
com id novo; com o mesmo nome, vira "Nome (2)"; se é igualzinho a um que já está lá, é pulado.

O arquivo é um JSON simples (o id é mantido quando não colide, para projetos que usam o efeito continuarem achando):

```json
{
  "format": "lumiar-efeitos",
  "version": 1,
  "effects": [
    {
      "id": "user/onda-colorida-1a2b3c",
      "name": "Onda colorida",
      "description": "A imagem ondula e ganha um brilho de cor que passa.",
      "params": [{ "id": "forca", "label": "Força da onda", "type": "float", "default": 0.5, "min": 0, "max": 1 }],
      "glsl": "vec4 effect(vec2 uv) { … }"
    }
  ]
}
```

Limites: até 100 efeitos por arquivo, 32 parâmetros por efeito e 64 KB de código por shader.

Para mostrar o seu efeito para todo mundo, mande para a [galeria da comunidade](GALERIA.md).

## Criando uma transição

Mesma ideia, em `plugins/transitions/minha-transicao/`. O formato é o mesmo do
[gl-transitions](https://gl-transitions.com), então dá para adaptar as mais de 100 transições de lá:

```glsl
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
```

Disponível: `getFromColor(uv)`, `getToColor(uv)`, `progress` (0 → 1), `ratio`, `resolution`, `PI` e os parâmetros.
Também: `getFromPerson(uv)` e `getToPerson(uv)` (onde está a pessoa em cada clipe), `getFromDepth(uv)` e
`getToDepth(uv)` (a profundidade de cada clipe, 1 = perto), `getMotion(uv)` (movimento do
próximo clipe) e `state` / `getPrevious` / `firstFrame()`, como nos efeitos.

## Criando um filtro

Em `plugins/filters/meu-filtro/`. O filtro recebe a cor já pronta e devolve a cor nova; o editor
mistura com o original pela **intensidade** que o usuário escolhe (por isso não crie um parâmetro `intensity`).

```glsl
vec4 applyFilter(vec4 color, vec2 uv) {
  float l = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  return vec4(vec3(l), color.a); // preto e branco
}
```

Disponível: tudo que um efeito tem (`getColor`, `time`, `ratio`, `getPerson`, `getDepth`, a biblioteca `lm…`) mais
`intensity`.

Se o shader tiver erro, o editor mostra a mensagem com a **linha do seu `shader.glsl`**.
Cuidado com palavras reservadas do GLSL como nome de variável (`active`, `input`, `output`, `filter`, `sample`…)
e com `smoothstep(a, b, x)` quando `a == b` (resultado indefinido — por isso as "suavidades" têm mínimo maior que 0).

