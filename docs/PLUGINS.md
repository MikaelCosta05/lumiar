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

Efeitos com passado dependem da ordem dos quadros: tocando, eles funcionam; pausado, mostram só o instante atual.

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

Disponível: tudo que um efeito tem (`getColor`, `time`, `ratio`…) mais `intensity`.

Se o shader tiver erro, o editor mostra a mensagem com a **linha do seu `shader.glsl`**.
Cuidado com palavras reservadas do GLSL como nome de variável (`active`, `input`, `output`, `filter`, `sample`…)
e com `smoothstep(a, b, x)` quando `a == b` (resultado indefinido — por isso as "suavidades" têm mínimo maior que 0).

