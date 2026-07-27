# APPENDIX — Public-Health and Regulatory Dimensions

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Role:** A standalone reference appendix to the four-part consolidated documentation set. The consolidated diagnosis (Part 1), treatment (Part 2), and synthesis (Part 3) address the system's software defects: the LP solver, the nutrition model, the data layer, the validation pipeline, the output contract, and the test suite. This appendix acknowledges two dimensions that the system touches but the software-defects diagnosis does not cover: the public-health dimension of recommending raw meat-based diets, and the regulatory dimension of compliance beyond AAFCO. They are recorded here so that a reader does not mistake their absence from Parts 1–3 for their absence from the project's responsibility.

**How to use this appendix.** §1 acknowledges the raw-diet public-health dimension. §2 acknowledges the regulatory dimension. §3 states the relationship to the consolidation's scope. This appendix is an acknowledgment, not a treatment; it points to authoritative sources rather than substituting for them.

---

## §1. The Raw-Diet Public-Health Dimension

The system's declared job (Part 1 §1.1) is to formulate a raw canine diet that satisfies the AAFCO Large Breed Growth profile for a German Shepherd. Raw meat-based diets — however nutritionally balanced — carry a public-health dimension that cooked diets do not, and this dimension is independent of whether the LP solver is correct.

### 1.1 AVMA policy

The American Veterinary Medical Association (AVMA) House of Delegates approved a policy in 2012 discouraging the feeding of raw or undercooked animal-source protein to cats and dogs. The policy was developed in response to public-health risks: raw meat-based diets have been documented to shed pathogens (*Salmonella*, *Listeria monocytogenes*, *Escherichia coli*) in the animal's feces, contaminating the household environment and posing particular risk to immunocompromised humans, young children, and the elderly. The AVMA policy is a position statement, not a regulation; it does not ban raw diets, but it formally acknowledges the public-health risk.

### 1.2 FDA DCM investigation

The U.S. Food and Drug Administration (FDA) has been investigating a possible link between certain diets — including grain-free formulations and some raw diets — and dilated cardiomyopathy (DCM) in dogs, including in breeds not genetically predisposed to the disease. The investigation began in 2018 and remains ongoing; the FDA has stated that the link is not yet conclusive but has flagged specific diet categories as warranting further study. This is distinct from the taurine-deficiency DCM concern noted in Part 1 §4 finding B15, which is a nutritional question; the FDA investigation is a diet-association question.

### 1.3 Zoonotic risk

Raw meat — whether human-grade or pet-grade — carries pathogens that can cause illness in both the dog and the humans handling the food, the food bowls, and the feces. *Salmonella*, *Listeria*, and *E. coli* have all been isolated from raw pet food; documented outbreaks of human illness linked to raw pet food exist. Freezing does not eliminate the risk. Safe-handling protocols (dedicated utensils, surface disinfection, hand hygiene) reduce but do not eliminate the residual risk.

### 1.4 Why this matters for this system

The system recommends raw meat-based diets for German Shepherds. The software-defects diagnosis (Part 1) addresses whether the diet the solver produces is nutritionally correct; it does not address whether feeding raw is an appropriate recommendation in the first place, or what public-health caveats should accompany the recommendation. A deployment that surfaces diet recommendations to end users must acknowledge the AVMA policy, the FDA DCM investigation, and the zoonotic-risk handling protocols — or explicitly mark them as out-of-scope for the deployment context.

---

## §2. The Regulatory Dimension Beyond AAFCO

The system is configured against the AAFCO Large Breed Growth nutrient profile. AAFCO is the nutrient standard the system's correctness is measured against in Part 1, but AAFCO is not the totality of the regulatory regime that governs pet food.

### 2.1 AAFCO's regulatory status

The Association of American Feed Control Officials (AAFCO) is a voluntary membership association of local, state, and federal agencies charged by law with regulating the production, labeling, distribution, and sale of animal feed. AAFCO establishes model regulations, ingredient definitions, and nutrient profiles. AAFCO is **not itself a law**: AAFCO model regulations take effect only when individual state feed control officials adopt them into state law. The U.S. regulatory regime for pet food is therefore fragmented: the FDA has federal jurisdiction over feed safety and adulteration; state feed control officials enforce labeling and registration (typically by adopting AAFCO model bills); and the AAFCO model-bill process is the mechanism by which the two layers coordinate. Compliance with AAFCO nutrient profiles is necessary but not sufficient for legal sale in any given U.S. state.

### 2.2 EU Regulation (EC) 767/2009

The European Union regulates pet food marketing, labeling, and placement on the market under Regulation (EC) No 767/2009 on the placing on the market and use of feed. The EU regime differs from the U.S. regime in several respects: mandatory labeling fields, claims restrictions, and the FEDIAF nutritional standards as the European counterpart to AAFCO. A system configured only against AAFCO is not compliant with EU 767/2009 by default.

### 2.3 Brazilian MAPA oversight

The project's apparent Brazilian origin — the two Portuguese-language source synthesis documents, the `MAPA_DO_PROJETO` naming, and the Portuguese `"Desaconselhado"` value in `scenarios.json` — implies that the relevant regulatory authority is the Ministério da Agricultura, Pecuária e Abastecimento (MAPA). MAPA regulates pet food in Brazil through normative instructions covering registration, labeling, and nutritional adequacy. A system configured only against AAFCO is not compliant with MAPA requirements by default.

### 2.4 Why this matters for this system

The system's correctness (Part 1) is measured against AAFCO Large Breed Growth. Its regulatory compliance, in any deployment context, is measured against the regime of the jurisdiction in which it is deployed — which may be AAFCO plus state law (U.S.), or EU 767/2009 plus FEDIAF (EU), or MAPA normative instructions (Brazil), or another regime entirely. The software-defects diagnosis does not address regulatory compliance; a deployment must consult a regulatory specialist for the target jurisdiction.

---

## §3. Relationship to the Consolidation's Scope

The consolidated documentation set (Parts 1–4) addresses the system's software defects: what the code does, what is broken, how to fix it, and the verified synthesis of both. The public-health and regulatory dimensions acknowledged here are **out of scope for the software-defects diagnosis** but **in scope for the project's responsibility** if the system is ever deployed.

This appendix exists so that a reader of Parts 1–3 does not conclude that the absence of public-health and regulatory analysis from the diagnosis means those dimensions do not apply. They do apply, and they are acknowledged here in the authoritative voice rather than only in Part 4's critical voice. A deployment that surfaces diet recommendations to end users must:

1. Consult a board-certified veterinary nutritionist (DACVN/ECVCN) on both the nutritional adequacy and the public-health appropriateness of raw feeding for the individual animal and household.
2. Consult a regulatory specialist on compliance with the target jurisdiction's pet-food regime (AAFCO + state law, EU 767/2009 + FEDIAF, MAPA, or other).
3. Surface the AVMA policy, the FDA DCM investigation, and the zoonotic-risk handling protocols to the end user as part of the system's user-facing safety-disclaimer surface.

The P0 safety freeze (Task B0, Part 2 §5.2) and the veterinary sign-off gate (Part 1 §1, Part 2 §1) are the two existing mechanisms that prevent deployment before these consultations occur. This appendix is the acknowledgment that those mechanisms cover dimensions the software-defects diagnosis does not.

---

*End of Appendix. This is a reference document; it acknowledges scope dimensions and does not propose changes to the software.*
