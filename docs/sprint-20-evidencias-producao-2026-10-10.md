# Sprint 20 — Evidências e Banco de Produção

**Importante:** [x] significa implementação ou observação confirmada, não certificação total. A execução matemática independente ainda não existe.

- [x] 01. Conferir agregação final dos 20 shards
- [ ] 02. Verificar SHA dos artefatos agregados
- [ ] 03. Recontar decisões únicas por cenário e mão
- [ ] 04. Identificar filtro abaixo de 1.500 no catálogo original
- [ ] 05. Conciliar 162 filtros originais com 32 novos
- [x] 06. Rejeitar chaves duplicadas no catálogo
- [x] 07. Rejeitar cobertura com filtros desconhecidos
- [x] 08. Rejeitar contagens negativas ou não inteiras
- [x] 09. Gerar fila de déficits priorizada
- [x] 10. Exportar fila e relatório como artefatos CI
- [ ] 11. Validar origem matemática de cada solve
- [ ] 12. Implementar reexecução independente de solver
- [ ] 13. Conferir exploitability e tolerâncias
- [ ] 14. Vincular replay aos hashes dos bancos
- [ ] 15. Verificar 1.500 decisões por cada um dos 194 filtros
- [ ] 16. Verificar meta 2.000 por filtro
- [ ] 17. Implementar motores para 32 cenários adicionais
- [ ] 18. Verificar storage e tabelas do Supabase
- [ ] 19. Testar escrita e leitura de banco em staging
- [ ] 20. Publicar produção somente após certificação e paridade

## Evidências
- 20 shards e agregação: sucesso, execução https://github.com/SkyareCom/stackup.holdem-grinder.evo/actions/runs/38016049445
- Agregação registrou 289482 decisões únicas, 527 nós e 30 falhas de solve.
- Auditoria na branch do solver: 161/162 filtros >=1500; 144/162 >=2000.
- Auditoria da branch visual: 52/194 filtros com déficit, antes de incorporar o novo banco agregado.
- Replay independente: **ausente**; publicação no Supabase: **não comprovada**.

## Proibição
Não alterar Academy, não efetuar merge em main, não declarar spots matematicamente certificados sem replay independente.
