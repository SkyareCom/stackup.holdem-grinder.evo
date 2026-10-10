# Sprint de 20 tarefas — certificação real de spots

**Objetivo:** 194 filtros com pelo menos 1.500 decisões distintas certificadas matematicamente. Nenhum status de pipeline equivale, por si só, à certificação.

- [x] 1. Validar CI do pipeline no HEAD
- [x] 2. Ler reprovação do gate de certificação
- [x] 3. Confirmar 194 filtros do catálogo
- [x] 4. Identificar 52 filtros deficitários
- [x] 5. Gerar fila priorizada por decisões faltantes
- [x] 6. Separar déficit de motor e déficit de solve
- [x] 7. Rejeitar registros de cobertura inválidos
- [x] 8. Rejeitar contagens e flags inconsistentes
- [ ] 9. Identificar 32 motores ausentes com IDs
- [ ] 10. Atualizar cobertura com artefato DCFR agregado
- [ ] 11. Identificar último filtro original abaixo de 1500
- [ ] 12. Executar solve direcionado ao último filtro original
- [ ] 13. Auditar decisões únicas por chave cenário+mão
- [ ] 14. Conferir proveniência e versão do solver
- [ ] 15. Implementar replay independente com entradas reproduzíveis
- [ ] 16. Verificar tolerância numérica de EV/exploitability
- [ ] 17. Certificar ≥1500 por cada filtro após replay
- [ ] 18. Certificar ≥2000 por filtro como meta ampliada
- [ ] 19. Executar staging, paridade e leitura Supabase
- [ ] 20. Liberar produção somente após gate matemático e paridade

## Evidências observadas
- Pipeline no commit 1e1e4e4: sucesso, run 38036195070.
- Gate no mesmo commit: falha esperada, run 38036195069; 194 filtros, 52 déficits, replay ausente.
- DCFR 20 shards + agregação: sucesso, run 38016049445; 289482 decisões únicas, 161/162 filtros >=1500 na branch do solver.
- A contagem de 52 é da branch visual e ainda não reflete automaticamente a agregação do outro branch.

## Bloqueios
- 32 cenários estendidos precisam de motores e solves verificáveis.
- Falta replay matemático independente e publicação validada no Supabase.
- Não mexer no Academy; não merge em main; não inventar certificado.
