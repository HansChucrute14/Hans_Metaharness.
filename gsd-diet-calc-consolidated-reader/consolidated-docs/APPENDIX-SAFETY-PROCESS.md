# APPENDIX — Safety-Process Specification

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Role:** A standalone reference appendix to the four-part consolidated documentation set. The consolidated documents (Parts 1–4) repeatedly state that "no diet produced by this system may be fed to an animal until the P0 items are fixed and a board-certified veterinary nutritionist signs off." This appendix specifies what that sign-off process entails (§1) and what user-facing disclaimer operationalizes the "no diet may be fed" statement in any deployment (§2). These two specifications are referenced by Part 1 §1, Part 2 §1, and `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §3; they are recorded here so that the safety-critical claims in the consolidated set have a concrete operational definition rather than a vague gate.

**How to use this appendix.** §1 specifies the veterinary-review sign-off process. §2 specifies the user-facing safety-disclaimer surface. Both are normative specifications: a deployment that does not meet them is not authorized, regardless of whether the software defects in Part 1 have been fixed.

---

## §1. Veterinary-Review Sign-Off Process

### 1.1 Credential requirements

The sign-off must come from a board-certified veterinary nutritionist — specifically, a Diplomate of the American College of Veterinary Nutrition (DACVN) or the European College of Veterinary Comparative Nutrition (ECVCN). General-practice veterinarians do not meet this bar; the DACVN/ECVCN credential requires specialized residency training and board examination in clinical nutrition.

### 1.2 Scope of review

The sign-off must cover four domains:

1. **Nutritional adequacy.** Confirmation that the AAFCO Large Breed Growth profile is correctly encoded in the system's data files and that the solver's output meets it across realistic ingredient selections.
2. **Safety-critical numeric values (Gate G3).** Verification of the absolute calcium ceiling, the growth-energy taper schedule, the safe-upper-limits (Cu, Fe, I, Mn, Zn, vitamin A, vitamin D3, selenium), and the severity thresholds for the B2b recommendation engine — all verified against AAFCO / NRC 2006 / FEDIAF primary sources, not against the system's current unverified values.
3. **Public-health appropriateness.** Assessment of whether raw feeding is appropriate for the individual animal and household context, including the AVMA policy, the FDA DCM investigation, and zoonotic-risk factors (see `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §1).
4. **Breed-specific risk.** German Shepherd Dog-specific concerns: copper-storage propensity, developmental-orthopedic-disease risk during the growth window, and any breed-specific nutrient interactions.

### 1.3 Review process

The review is a formal sign-off, not a consultation. The reviewer receives:

- The consolidated documentation set (Parts 1–4 and all appendices).
- The live repository at the commit under review.
- The verification log (`APPENDIX-VERIFICATION-LOG.md`) preserving the runtime evidence.

The reviewer returns:

- A written assessment covering the four scope domains above, with explicit accept/reject per domain.
- A final sign-off statement: either "authorized for use under the conditions specified below" or "not authorized; the following domains require remediation."

### 1.4 Gating

The sign-off is a hard gate. No diet produced by the system may be fed to any animal until the sign-off is obtained. The P0 safety freeze (Task B0, Part 2 §5.2) enforces this at the code level (every recommendation emits `DO_NOT_FEED` while defects are uncorrected); the sign-off enforces it at the deployment level. The sign-off authorizes the system for use under specified conditions; it does not authorize unconstrained use.

---

## §2. User-Facing Safety-Disclaimer Specification

### 2.1 Mandatory disclaimer surface

Any user-facing output that contains a diet recommendation — grams per ingredient, a feeding recommendation (`SAFE_TO_FEED` / `FEED_WITH_CAUTION` / `DO_NOT_FEED`), or nutrient results — must be accompanied by the disclaimer specified below. The disclaimer must be:

- **Visible without user action** (not hidden behind a click, not in a tooltip, not on a separate page).
- **Present on every screen or page** that contains a diet recommendation.
- **Rendered in the same language** as the recommendation.

### 2.2 Disclaimer content (minimum elements)

The disclaimer must, at minimum, communicate:

1. **Pre-alpha status.** The system is pre-alpha / prototype. No diet it produces has been verified as safe for any animal.
2. **No feeding.** No diet produced by this system may be fed to any animal until the P0 defects are fixed and a board-certified veterinary nutritionist (DACVN/ECVCN) signs off.
3. **Raw-diet public-health risk.** Raw meat-based diets carry public-health risks: the AVMA discourages raw feeding, the FDA is investigating a possible diet-DCM link, and raw meat sheds *Salmonella*, *Listeria*, and *E. coli* into the household environment. (See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §1.)
4. **Regulatory non-compliance.** The system is configured against AAFCO Large Breed Growth only; it is not compliant with EU Regulation 767/2009, Brazilian MAPA normative instructions, or other jurisdictions by default. (See `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` §2.)
5. **Safe-handling protocols.** If the user handles raw meat in connection with the system's output, they must follow safe-handling protocols: dedicated utensils, surface disinfection, hand hygiene, and awareness that freezing does not eliminate pathogens.

### 2.3 Do-not-feed override (pre-sign-off)

Until Task B0 (the safety freeze, Part 2 §5.2) is implemented and the veterinary sign-off (§1 above) is obtained, the system must emit `DO_NOT_FEED` for every diet recommendation, regardless of the solver's computed output. This is the code-level enforcement of the disclaimer; the disclaimer surface is the user-facing enforcement. Both are required.

### 2.4 Relationship to the veterinary sign-off

The disclaimer remains in effect even after the veterinary sign-off is obtained. The sign-off authorizes the system for use under specified conditions; it does not remove the need for the user-facing disclaimer. The disclaimer's content may be revised after sign-off to reflect the authorized use conditions, but the disclaimer surface itself may not be removed from any deployment that surfaces diet recommendations to end users.

---

*End of Appendix. This is a normative specification; it defines the safety-process requirements that any deployment must meet, and does not propose changes to the software itself.*
