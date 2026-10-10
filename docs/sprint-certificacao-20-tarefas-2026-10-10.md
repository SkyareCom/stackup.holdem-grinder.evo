# Sprint de 20 tarefas — certificação do BANCO DE SPOTS

Status em 2026-10-10. Esta lista distingue trabalho executado de certificação comprovada. Nenhuma tarefa pendente implica spot certificado.

- [x] 01. Conferir status de todos os 20 shards DCFR-SOLVER
- [ ] 02. Reexecutar shard cancelado e obter resultado final — shard `solve (o)` reiniciado; resultado final ainda não comprovado.
- [ ] 03. Executar agregação de artefatos DCFR
- [ ] 04. Auditar falhas de solve por cenário
- [ ] 05. Deduplicar decisões por cenário+mão
- [ ] 06. Validar proveniência e versão de cada solver
- [ ] 07. Validar hash SHA-256 dos bancos comprimidos
- [ ] 08. Conferir contrato de probabilidades e ações
- [ ] 09. Implementar replay independente do solver
- [ ] 10. Emitir relatório assinado por hash do replay
- [ ] 11. Associar certificado ao commit do verificador
- [ ] 12. Verificar 1.500 decisões distintas por filtro
- [ ] 13. Verificar meta de 2.000 por filtro
- [ ] 14. Identificar filtros com déficit e gerar fila
- [ ] 15. Implementar motores dos 32 cenários pendentes
- [ ] 16. Verificar compatibilidade AJUSTES/ADVANCE
- [ ] 17. Testar integração de leitura GRINDER.EVO
- [ ] 18. Preparar publicação atômica no Supabase
- [ ] 19. Validar paridade entre storage e catálogo remoto
- [ ] 20. Liberar produção somente após todos os gates

## Gates obrigatórios

- Auditoria de catálogo 194 cenários: CI aprovado, **não** é replay matemático.
- Pipeline de spots: CI aprovado, **não** prova cobertura de 1.500 por filtro.
- Publicador exige `INDEPENDENT_SOLVER_REPLAY`, `solver_replay.status=PASSED`, `report_sha256`, `verifier_commit`.
- `AUTOMATED_STRICT_CONTRACT` é verificação estrutural, não certificação matemática.
- Produção e Supabase não devem ser liberados antes de prova independente e paridade.
