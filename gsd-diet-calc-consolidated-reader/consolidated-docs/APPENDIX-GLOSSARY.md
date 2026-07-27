# APPENDIX — Glossary

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Role:** A standalone reference appendix defining the domain acronyms and terms used throughout the consolidated documentation set (Parts 1–4 and the companion appendices). The documents assume the reader is simultaneously an LP/OR specialist, a canine nutritionist, a JSON Schema expert, a validation engineer, and a Python typing specialist; this glossary is the minimal navigability aid for a reader who is not all of those at once.

**How to use this glossary.** Terms are grouped by domain (nutrition, regulatory, LP/OR, other) and alphabetized within each group. Where a term has both a full name and a common abbreviation, both are given. Terms appearing only in the codebase (function names, module names, JSON field names) are not included here; they are defined inline in Part 1 at first mention.

---

## §1. Nutrition and Physiology

| Term | Definition |
|---|---|
| **AAFCO** | Association of American Feed Control Officials. The U.S. model-regulation body whose nutrient profiles govern pet food labeling. The system is configured against the AAFCO Large Breed Growth profile. See also `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §2.1 for AAFCO's regulatory status. |
| **DER** | Daily Energy Requirement. The energy a dog needs per day, derived from RER multiplied by an activity/life-stage factor k. The system's `SCENARIO_K_MAP` (Part 1 §4, finding B1) maps k values to scenario labels. |
| **DOD** | Developmental Orthopedic Disease. Skeletal pathology (osteochondrosis, hypertrophic osteodystrophy) driven by excess calcium and energy during growth; the breed-specific risk the Large Breed Growth profile is designed to mitigate. Central to finding B2 (no absolute calcium maximum). |
| **FEDIAF** | European Pet Food Industry Federation. The European counterpart to AAFCO; publishes nutritional guidelines for complete and complementary pet food. |
| **NRC** | National Research Council (*Nutrient Requirements of Dogs and Cats*). The primary scientific reference for canine nutrient requirements; the source of the safe-upper-limit tables the system's SULs are derived from. Findings B6–B10 (Part 1 §4) flag SULs that need re-verification against NRC (2006). |
| **RER** | Resting Energy Requirement. The energy a dog needs at rest: RER = 70 × BW^0.75 (metabolic body weight scaling). The system's growth-energy model (finding B1) applies a flat k = 1.2 × RER, which is the adult-maintenance range. |
| **SUL** | Safe Upper Limit. The maximum intake of a nutrient not expected to cause adverse effects; distinct from the minimum requirement. The system's `toxicological_limits.json` carries 8 SULs (Part 1 §4). |

---

## §2. Regulatory and Veterinary

| Term | Definition |
|---|---|
| **AVMA** | American Veterinary Medical Association. Issued a 2012 policy discouraging the feeding of raw animal-source protein to cats and dogs on public-health grounds. See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §1.1. |
| **DACVN** | Diplomate, American College of Veterinary Nutrition. Board-certified veterinary nutritionist (U.S. credential). The system's safety non-negotiable (Part 1 §1, Part 2 §1) requires DACVN sign-off before any diet is fed. |
| **DCM** | Dilated Cardiomyopathy. A heart muscle disease; the FDA is investigating a possible link between certain diets (including some raw diets) and DCM in dogs. Distinct from the taurine-deficiency DCM concern noted in Part 1 §4 finding B15. See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §1.2. |
| **ECVCN** | European College of Veterinary Comparative Nutrition. Board-certified veterinary nutritionist (European credential); the European counterpart to DACVN. |
| **FDA** | U.S. Food and Drug Administration. Federal agency with jurisdiction over feed safety and adulteration; investigating diet-associated DCM. See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §1.2. |
| **MAPA** | Ministério da Agricultura, Pecuária e Abastecimento (Brazilian Ministry of Agriculture, Livestock, and Food Supply). Brazil's pet-food regulatory authority. See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §2.3. |

---

## §3. LP / OR and Solver

| Term | Definition |
|---|---|
| **CBC** | COIN-OR Branch and Cut. The open-source MILP solver backend used by PuLP; the system runs CBC with `randomSeed=12345`, `threads=1` for determinism (Part 1 §3). |
| **GP** | Goal Programming. An LP variant where multiple objectives are pursued in priority order (preemptive/lexicographic GP); the system uses a three-level cascade with lexicographic stage ordering. Finding A1 (Part 1 §3) is that the stage order is inverted. |
| **IIS** | Irreducible Infeasible Subset. The minimal set of constraints that, taken together, are infeasible; used to diagnose why an LP has no feasible solution. Task B11 (Part 2 §9.4) uses IIS analysis to diagnose Level-1 unreachability. |
| **LP** | Linear Programming. The mathematical optimization framework the solver is built on. |
| **MILP** | Mixed-Integer Linear Programming. LP with both continuous and integer variables; the system uses MILP for the clinical-floor constraint (binary inclusion flags). |
| **PuLP** | The Python LP modeling library (v3.3.2) the system uses to build and solve LP/MILP problems via the CBC backend. |

---

## §4. Other

| Term | Definition |
|---|---|
| **GSD** | German Shepherd Dog. The breed the system is configured for. |

---

*End of Appendix. This is a reference document; it defines terms and does not propose changes to the software.*
