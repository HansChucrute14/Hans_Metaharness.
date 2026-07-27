# Mapa do Projeto — Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
### Visão de cima, unificando SYSTEMATIC_REVIEW_REPORT + REMEDIATION_PLAN + EXECUTIVE_REMEDIATION_ROADMAP + ROADMAP_G1_AMENDMENT

---

## 0. A frase que resume tudo

> **Hoje o sistema pode dizer `SAFE_TO_FEED` para uma dieta com Ca:Mg 631% fora do range, e não existe nenhum jeito de o usuário perceber isso.**

Essa frase amarra os dois achados mais graves (saída fake + constraint "dura" que na verdade é mole) e é o motivo pelo qual **nenhum diet gerado hoje deve ser dado ao cachorro**. Isso não é retórica de review — é o estado real do código em 2026-07-25.

---

## 1. Onde as coisas realmente estão (não onde os docs dizem que estão)

- **Nada foi corrigido ainda.** Os 4 documentos são 100% planejamento (`PLANNING ONLY`, nenhum arquivo do repo foi tocado). Você tem um review (Fase 0) e uma roadmap executável (Fases 1-4) prontos, mas zero execução.
- Os documentos **são consistentes entre si** — não há contradição real entre eles, só refinamento progressivo (Review → Plan → Roadmap → Amendment corrige 2 pontos do Roadmap).
- **3 dos 3 gates de decisão já têm resposta:**
  - **G1** (antagonismos minerais duros vs moles) → **resolvido: DURO** no Nível 1.
  - **G2** (`objective_weights.json` usado ou lixo) → **resolvido: DELETAR** (0 referências reais no solver).
  - **G3** (valores numéricos de segurança: teto de Ca/P, curva de energia de crescimento, SULs) → **ainda pendente**, e depende de fonte primária (AAFCO/NRC/FEDIAF) + revisão de um nutricionista veterinário. Esse é o único gate que não se resolve só com engenharia.

---

## 2. O que é estrutural vs. o que é só um valor errado

Isso é a pergunta central que você fez, então vale separar com cuidado — nem tudo "Crítico" é estrutural.

### Estrutural (padrão arquitetural que se repete, não um bug isolado)
O achado transversal mais importante do review é: **"coisas 'duras' são moles, e coisas 'validadas' não validam nada"** — um padrão que se repete em pelo menos 4 lugares independentes:
- `nutrient_results` é hardcoded (`"adequate"` sempre) — o contrato de saída existe só de nome.
- Antagonismos minerais são "hard" na config mas soltos no solver — o contrato de constraint existe só de nome.
- O schema de 44KB (`lp_parameters.schema.json`) não valida nenhum arquivo real.
- O banco de ingredientes falha o próprio schema (21 erros) e não há gate de CI.

Isso **não é 4 bugs**, é **1 causa estrutural**: o projeto não tem um mecanismo que force "o que o código diz que faz" a bater com "o que o código faz". É a ausência de um princípio de design (contratos verificados), não uma falha pontual — e é por isso que reaparece toda vez que alguém adiciona uma feature nova.

A segunda coisa genuinamente estrutural: **não existe namespace canônico de nutrientes.** Há 3 esquemas de nomenclatura conflitantes, 0% de overlap entre os mapas FDC/COFID e o banco, e um typo passa despercebido pelo schema. Isso é modelo de dados, não bug — dá pra remendar (é o que a roadmap propõe: registro canônico único), mas é a peça mais próxima de precisar de um redesenho real dentro do projeto.

Terceiro: **o Nível 1 (`SAFE_TO_FEED`) é estruturalmente inatingível** — em todas as seleções testadas (5 seleções × 2 cenários), o solver nunca chega no nível "ótimo". Isso pode ser sintoma de uma constraint específica mal calibrada, ou pode ser algo mais profundo na cascata de 3 níveis. Ainda não foi diagnosticado (task B11, no amendment) — é a maior incógnita estrutural aberta hoje.

### Não-estrutural (fix pontual, mesmo quando "Crítico")
- Teto absoluto de cálcio ausente → adicionar uma constraint.
- `k = 1.2×RER` errado/invertido → trocar a fórmula por uma tabela por idade.
- `validators/_shared.py` sumiu → restaurar um arquivo.
- Schema do banco desatualizado → corrigir os 21 erros.
- `objective_weights.json` órfão → deletar (G2 já resolveu).

Esses são graves (safety-critical), mas são **correções cirúrgicas**, não redesenho.

---

## 3. Precisa reescrever alguma coisa do zero?

**Não.** O veredito dos 5 revisores + a verificação empírica do PuLP foi clara: **o núcleo matemático (cascata lexicográfica fix-optimum, Big-M por ingrediente, desvios normalizados, RER, Atwater modificado, AAFCO per-1000kcal) está correto e deve ser mantido.** Os defeitos estão nas **costuras** — wiring config↔solver, dado↔schema, solução↔output — não no motor.

A única peça que chega perto de "precisar ser refeita" (não reescrita, mas redesenhada) é o **registro de nutrientes**: hoje são 3 namespaces competindo; a correção certa é um registro canônico único (`id + unit + basis`) que todo o resto passa a referenciar — já planejado como Task B7.

Tudo que os próprios documentos já marcaram como **refactor especulativo foi propositalmente adiado** (god module `solver.py` de 1661 linhas, separar `core.py`, consolidar o modelo de tipos, 42% do código sendo geração de documentação) — correto: nenhuma dessas coisas ameaça segurança ou corretude hoje, então YAGNI se aplica e ficam no backlog.

---

## 4. O mapa único — sequência unificada

**Bloqueadores (podem começar já, não dependem do gate G3):**
| Task | O que é | Por quê primeiro |
|---|---|---|
| B0 | Freeze de segurança (`DO_NOT_FEED` forçado enquanto os defeitos vivem) | Contenção imediata, reversível |
| B5 | Restaurar `_shared.py` | Sem isso o pipeline de validação nem importa |
| B6 | Gate de schema no CI | Impede que o drift de dados volte a acontecer |
| B11 | Diagnosticar por que o Nível 1 é inatingível | Informa se B3/B4 realmente resolvem o problema raiz |
| B2a | Endurecer antagonismos minerais no Nível 1 | G1 já resolvido = DURO; não depende de mais nada |
| G2 | Deletar `objective_weights.json` | Resolvido; remove config morta/enganosa |

**Corrente crítica de segurança real (a que hoje protege o cachorro, já que o Nível 1 está inatingível):**
| Task | O que é |
|---|---|
| B1 | Corrigir `nutrient_results` hardcoded (parar de mentir "adequate") |
| B2b | Recomendação escalada por severidade (631% de excesso ≠ 1.5% de excesso) — **essa é a proteção decisiva** |

**Dependem do gate G3 (verificação com fonte primária + veterinário):**
| Task | O que é |
|---|---|
| B3 | Teto absoluto de Ca/P |
| B4 | Curva de energia de crescimento por idade |
| B2b (limiares) | Os números exatos de severidade |

**Estrutural, mais lento, mas de alto valor:**
| Task | O que é |
|---|---|
| B7 | Registro canônico de nutrientes (namespace único) |
| B12 | Corrigir arginina (bloqueado por B7) — hoje Lys:Arg é inavaliável |
| C5/C9 | Corrigir os 2 schemas quebrados (banco + lp_parameters) |

**Explicitamente descartado ou adiado (não vale o esforço agora):** refatorar `solver.py`, consolidar tipos, cortar geração de docs, mojibake em nomes de exibição, testes por mutação contínua, segundo solver para diff-testing, testes baseados em propriedades — tudo isso já foi passado pelo filtro YAGNI nos próprios documentos e fica no backlog.

---

## 5. O gargalo real

Tudo que não depende de G3 pode começar hoje sem nenhuma decisão pendente sua. **G3 é o único item fora do seu controle de engenharia** — precisa de fontes primárias (AAFCO/NRC/FEDIAF) e idealmente um veterinário (DACVN/ECVCN) antes de qualquer número de segurança (Ca, P, energia de crescimento, limiares de severidade) ir para produção. Enquanto isso, B0/B5/B6/B11/B2a/B1/G2 dão o maior ganho de segurança e verdade por menor esforço, e não esperam por ninguém.
