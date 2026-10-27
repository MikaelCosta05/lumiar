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

## Criando uma transição

Mesma ideia, em `plugins/transitions/minha-transicao/`. O formato é o mesmo do
[gl-transitions](https://gl-transitions.com), então dá para adaptar as mais de 100 transições de lá:

```glsl
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
```

Disponível: `getFromColor(uv)`, `getToColor(uv)`, `progress` (0 → 1), `ratio`, `resolution`, `PI` e os parâmetros.

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

