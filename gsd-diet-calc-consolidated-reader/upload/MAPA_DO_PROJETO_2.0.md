# Mapa do Projeto 2.0 — Verificação Direta no Repositório
### `github.com/HansChucrute14/Hans-GSD-Raw-Calculator` @ `c932a21` (2026-07-25)

Clonei o repo, instalei `pulp==3.3.2` + CBC + `jsonschema`, e rodei o solver de verdade. Não confiei nos 4 documentos — reverifiquei cada achado Crítico contra o código e os dados ao vivo. Resultado: **quase tudo bate byte a byte**. Achei **1 correção real** nos documentos e **1 escalada de gravidade** que eles subestimaram.

---

## 1. O que os documentos acertaram (confirmado ao vivo, não por leitura)

| Achado | Como verifiquei | Resultado |
|---|---|---|
| C1 — `nutrient_results` fake | Rodei `solve_cascade()` de verdade com 2 seleções | `arginine_g`: `value=0`, `status="adequate"`, `target_min=None` — confirmado com dado real, não só grep de código |
| C2 — antagonismos moles | `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` | `60` — bate exato com o doc |
| C5 — banco falha o próprio schema | `jsonschema.Draft202012Validator` ao vivo | **21 erros**, exatamente como reportado |
| C7 — `_shared.py` ausente | Tentei `import gsd.validation.pipeline.orchestrator` | `ModuleNotFoundError` real (o doc só tinha inferido isso estaticamente, sem `pydantic` disponível) |
| C8 — `objective_weights.json` morto | `grep -c objective_weights src/gsd/solver.py` | `0` |
| C9 — schema órfão | Validei `lp_parameters_data.json` contra `lp_parameters.schema.json` | 3 erros, campos esperados (`breed`/`domains`) não batem com os reais |
| B-i (amendment) — Nível 1 inatingível | Rodei a cascata completa com a seleção de referência (5 ingredientes) E uma seleção ampla (10 ingredientes) | **Ambas** pararam em `cascade_level=2` / `solver_status="suboptimal"` — nenhuma chegou no Nível 1. Confirmado com execução real do CBC, não hipótese |
| L5 — prints de debug no solver | Saída do solve real | Sim, 40+ linhas de `[DEBUG]` poluindo stdout em produção |
| H14 — teste de timeout é stub | Li o corpo do teste | Confirmado: comentário próprio diz *"Hard to test without mocking; document expected behavior"* e só chama `audit_test_result` com um dict fixo — nunca invoca o solver |

**Conclusão prática:** os documentos de planejamento são uma base confiável. Isso não é comum — geralmente relatórios gerados por IA têm 1-2 alucinações. Aqui não achei nenhuma no núcleo dos achados Críticos.

---

## 2. A correção real — Task B12 (arginina) está baseada em evidência errada

O `ROADMAP_G1_AMENDMENT.md` (seção B-iv) afirma que `arginine_g` está **mal posicionado** — como chave de topo em `bromatological_profile`, fora de `bp["nutrients"]` — e por isso o Lys:Arg seria inavaliável.

**Verifiquei diretamente no JSON e no código, e isso não é verdade hoje:**
- `arginine_g` já está em `bp["nutrients"]` para **todos** os 28 ingredientes (não achei nenhuma ocorrência de chave de topo).
- `arginine_g` já está em `NUTRIENT_REGISTRY` (`lp_parameters_data.json:20`).
- `arginine_g` já tem constraint própria de mínimo AAFCO em `constraints.json` (`arginine_g >= 2.5`).
- Rodei `build_matrix()` de verdade: `arginine_g` chega na matriz do LP com valor correto e não-zero (ex.: `beef_muscle_raw → 6.86`, `chicken_muscle_raw → 11.94`, energy-normalized).
- A constraint Lys:Arg (`1.0*arginine_g <= lysine_g <= 1.4*arginine_g`) **é construída com o valor certo** — o LP em si enxerga a arginina corretamente.

**O que realmente está quebrado:** só a camada de *relatório* (`nutrient_results`), porque `arginine_g` não está entre os 17 alvos do cenário (`scenarios.json`), então `targets_per_day.get(nid, 0)` cai no default `0` — que é exatamente o mecanismo do **C1**, não um problema específico de arginina.

**Implicação para o mapa:** a Task B12 do amendment (relocar `arginine_g` para dentro de `bp["nutrients"]`) está **resolvendo um problema que já não existe** — ela deveria ser reescrita para "confirmar que B1 (fix do C1) também corrige a exibição de arginina" em vez de "mover a chave". Isso não muda a saúde do sistema (o LP já respeita Lys:Arg internamente), só evita que alguém gaste tempo numa correção desnecessária.

---

## 3. A escalada real — C7 não é "um subsistema não importa", é "o CI está vermelho hoje"

Os documentos descrevem C7 como *"o pacote de validação (~6.4k LOC) não pode ser importado"* — soa como um subsistema isolado quebrado.

**O que rodar de verdade mostrou:** `pytest tests/ -v` — exatamente o comando que `ci.yml` executa no job `test` — **falha na fase de coleta**, não só na execução:

```
ERROR tests/test_validation_phase5.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
191 tests collected, 1 error in 1.96s
```

Isso significa que, com a configuração atual de CI, **o job de testes inteiro provavelmente está falhando (vermelho) agora**, não apenas "faltando cobertura" na validação. `_shared.py` deixou de ser um problema de buildability isolado — é o que está quebrando o pipeline de CI como um todo hoje. Isso eleva a prioridade de **B5** de "restaurar import" para "destravar o CI inteiro", e é coerente com o mapa 1.0 já ter colocado B5 entre os itens que podem começar imediatamente — só reforça que é o mais urgente dos que não dependem do gate G3.

---

## 4. O resto do mapa 1.0 continua de pé

Nada aqui muda a leitura estrutural que já fiz: núcleo LP correto, 3 padrões estruturais reais (contratos que existem só de nome, namespace de nutrientes fragmentado, Nível 1 inatingível — este último agora **confirmado por execução real**, não só pelos 5 casos de teste do amendment), G1/G2 resolvidos, G3 pendente de veterinário. A única mudança de conteúdo é: **descartar/reescrever B12** e **subir a prioridade de B5** de "importante" para "está quebrando o CI agora".
