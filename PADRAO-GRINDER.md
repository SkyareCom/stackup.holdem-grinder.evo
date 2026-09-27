# Padrão GRINDER

Regras visuais obrigatórias do app GRINDER. Toda tela nova ou alteração segue este documento.

## 1. Fontes
- Bebrush em todo o app. Road Rage somente na palavra "GRINDER".
- Exceções de cor nos ícones do login: Google com o "G" colorido oficial, WhatsApp verde (#25D366), Biometria roxa (#a877ff) e Idioma amarelo (#f5c542). As cores valem nos dois estados; ao clicar, só o card fica azul.
- Peso sempre normal (400), nunca bold.
- O 12px vale mesmo com o tamanho de fonte do celular aumentado: o app mede a ampliação do sistema e compensa no token --fs. Todo texto deve usar var(--fs), nunca 12px fixo.
- Espaço entre letras: títulos/rótulos 1px, descrições 0.5px, faixas de título 2px.
- Título e descrição se diferenciam só pela cor, nunca pelo tamanho.
- Nomes longos quebram uma palavra por linha dentro do card; nunca cortar texto.

## 2. Cores (nenhuma outra cor de destaque é permitida)
- Fundo: degradê vertical do preto #000000 (topo) ao azul-noite #040e2a (base), com o par de ases em relevo ao fundo, bem transparente.
- Texto e ícones: #ffffff
- Texto secundário: #a8a49e
- Azul GRINDER: #155bbd
- Texto ativo: #6fa4ff

## 3. Cards e botões — sempre vidro, só dois estados
NORMAL (não clicado):
- fundo rgba(255,255,255,.06) + backdrop-filter: blur(14px) saturate(140%)
- borda 1px rgba(255,255,255,.38)
- brilho interno: inset 0 1px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(255,255,255,.06)
- título e ícone brancos; descrição #a8a49e

CLICADO / ATIVO:
- fundo rgba(21,91,189,.32) + backdrop-filter: blur(14px) saturate(150%)
- borda 1px #155bbd + halo: inset 0 1px 0 rgba(140,185,255,.35), 0 0 14px rgba(21,91,189,.35)
- título e ícone #6fa4ff; descrição branca

Formas:
- Cantos de 16px em todo botão, card, aba, cabeçalho de seção e caixa de conteúdo.
- Formatos regulares (retângulos arredondados); nada orgânico.
- Card de torre: sempre QUADRADO (proporção 1:1) e sempre em grade de 3 colunas com espaço de 8px, em todas as telas — todos os cards têm exatamente o mesmo tamanho. Ícone de 40px em cima, título embaixo, centralizados. Exceção: grupos com exatamente 4 opções curtas (ex.: Nível do treino) podem usar 4 colunas, com cards quadrados menores e ícone de 32px.
- Botão de linha (login, cabeçalho de seção): ícone à esquerda, título + descrição, seta à direita.
- Faixa de título das telas (HOME, TREINO…): fundo rgba(255,255,255,.08), borda de vidro 1px, cantos retos, girada -1.5°.
- Telas de ajustes (ex.: Ajustes do treino): sem cards de cabeçalho nem gavetas. Cada seção mostra o título em texto simples e os cards de torre direto na tela. Entre uma seção e outra, linha de 1px no azul GRINDER (#155bbd), de ponta a ponta.

## 4. Ícones
- Material Symbols Outlined (peso 400) em TODO o app: rodapé, Voltar/Menu principal, cards, cabeçalhos de seção e botões do login. Nada de ícones de traço desenhados à mão.
- Sempre na cor do texto (branco); clicado/ativo = #6fa4ff.
- Tamanhos: 40px nos cards de torre, 24px no rodapé e nos botões do login, 22px nos botões do cabeçalho.
- O mesmo conceito e o mesmo destino usam sempre o mesmo ícone: Home = home, Alvo = target, Perfil = account_circle, Spots = playing_cards, Ajustes/Treino = settings, Run = monitoring.
- Posições da mesa (UTG, UTG+1, MP, HJ, CO, BTN, SB, BB): ícone próprio de mini mesa oval com 8 assentos, o assento da posição destacado (maior e sólido), os demais apagados, e o botão do dealer como um pontinho na mesa, bem na frente do BTN. Assentos em sentido horário a partir do BTN (embaixo): SB, BB, UTG, UTG+1, MP, HJ, CO. "Todas" = todos os assentos acesos.
- Única exceção: o "G" colorido do Google no botão de login (exigência da marca Google). O WhatsApp aparece em branco.

## Mesa de treino (Spots)
- Mesa oval em pé (formato estádio), em vidro azul GRINDER, ocupando a área de conteúdo.
- Herói sempre fixo no centro de baixo, com avatar em estado ativo (vidro azul, borda #155bbd).
- Número de lugares vem de Ajustes → Jogadores na mesa (2, 3, 6, 8, 9 ou 10), distribuídos por igual no contorno da mesa, em sentido horário a partir do herói, na ordem real da ação.
- Cada jogador: posição dentro do avatar e stack logo abaixo (em BB ou em moeda, conforme Ajustes → Stack exibido em; moeda = $ no cash e fichas no torneio).
- O app é só Texas Hold'em: 2 cartas por jogador. Oponentes com cartas fechadas (verso azul GRINDER); herói com cartas abertas.
- Centro da mesa, de cima para baixo: board (5 espaços), pote e, em all-ins múltiplos, side pots abaixo do pote. Nada pode se sobrepor.
- Botão do dealer (D) branco ao lado do BTN, virado para o centro.
- Cartas abertas usam baralho de 4 cores (♠ preto, ♥ vermelho, ♦ azul, ♣ verde) — exceção à paleta, por legibilidade no poker.

## 5. Estrutura de toda tela interna
1. Cabeçalho: logo StackUp (sempre quadrado, sem distorcer) + STACKUP HOLD'EM + GRINDER (Road Rage, azul GRINDER com efeito vidro)
2. Botões "Voltar" e "Menu principal", com linha divisória 1px rgba(255,255,255,.16) embaixo
3. Faixa de título da tela
4. Conteúdo (grade de cards de torre ou seções expansíveis), margem lateral de 22px
5. Rodapé com 5 abas: Home · Alvo · Spots · Ajustes · Run (fundo rgba(0,0,0,.35) com blur 16px; aba ativa no estado clicado)

## 6. Comportamento
- Todo grupo de opções tem sempre uma opção ativa; nos grupos de múltipla escolha, "Todas" cobre o caso vazio. Exceção: seção inativa (ex.: no modo Cash, Tipo de torneio, Informações do field e Fase do torneio ficam inativas).
- Voltar: subtela → tela principal da seção → Home → sai do app (volta ao login).
- Menu principal: vai direto para Home.
- Toda tela nova já nasce traduzida em Português, Inglês e Espanhol, trocando pelo seletor de idioma.

## 7. Código
Use estes tokens e nunca valores soltos:

```css
:root{
  --font-ui:'Bebrush',sans-serif; --font-brand:'Road Rage',sans-serif;
  --fs:12px; --ls-label:1px; --ls-desc:.5px; --ls-faixa:2px;
  --bg-top:#000; --bg-bottom:#040e2a;
  --ink:#fff; --ink-muted:#a8a49e; --accent:#155bbd; --accent-text:#6fa4ff;
  --glass-fill:rgba(255,255,255,.06); --glass-fill-strong:rgba(255,255,255,.08);
  --glass-border:1px solid rgba(255,255,255,.38);
  --glass-blur:blur(14px) saturate(140%);
  --glass-highlight:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(255,255,255,.06);
  --on-fill:rgba(21,91,189,.32); --on-border:1px solid #155bbd; --on-blur:blur(14px) saturate(150%);
  --on-glow:inset 0 1px 0 rgba(140,185,255,.35),0 0 14px rgba(21,91,189,.35);
  --radius-card:16px; --gap:8px; --icon:40px; --gutter:22px;
}
```

Antes de entregar, confira: todo texto em 12px; nenhuma cor fora da lista; todo botão/card em vidro com borda 1px; clique em vidro azul; cantos de 16px; 3 idiomas; Voltar seguindo a regra.
