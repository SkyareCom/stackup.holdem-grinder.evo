# Instruções para agentes (Codex, Claude, etc.)

Este repositório é o app GRINDER (StackUp Hold'em).

1. Antes de qualquer mudança visual, leia e siga **PADRAO-GRINDER.md**. Ele é obrigatório.
2. Use apenas os tokens de **grinder-tokens.css**. Nunca crie cores, tamanhos de fonte ou raios fora dele.
3. Regras que mais quebram:
   - todo texto em 12px (exceto o bloco da marca);
   - Bebrush em tudo, Road Rage só em "GRINDER";
   - todo botão/card em vidro, borda 1px; clicado = vidro azul #155bbd, título #6fa4ff;
   - cantos de 16px; cards de torre em grade de 3 colunas;
   - toda tela nova em PT, EN e ES;
   - Voltar: subtela → seção → Home → sai do app.
4. O app é um arquivo único: `index.html` (fontes, logo e imagens embutidos em base64). Publicado via GitHub Pages a partir da branch main.
