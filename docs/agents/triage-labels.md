# Triage Labels

The triage state machine uses five canonical labels. Issues move through these states:

```
needs-triage ─┬─> needs-info ─┐
              │                ├─> ready-for-agent ─> (closed: done)
              └─> wontfix       │
                               └─> ready-for-human ─> (closed: done)
```

| Label | Meaning |
|---|---|
| `needs-triage` | Newly created, awaiting initial review to classify it |
| `needs-info` | Missing information needed to proceed — blocked on the reporter or another source |
| `ready-for-agent` | Ready to be picked up by an AI agent for implementation (`to-spec` output goes here) |
| `ready-for-human` | Requires human judgment (decisions, vet sign-off, design opinions, approval) |
| `wontfix` | Will not be addressed; closed without action |

## Creating missing labels

If the labels don't exist on the repo, create them:

```bash
gh label create "needs-triage"   --color "fbca04" --description "Awaiting initial triage review"     --repo HansChucrute14/Hans_Metaharness
gh label create "needs-info"     --color "fbca04" --description "Needs more information before continuing" --repo HansChucrute14/Hans_Metaharness
gh label create "ready-for-agent" --color "0E8A16" --description "Ready for an agent to implement"  --repo HansChucrute14/Hans_Metaharness
gh label create "ready-for-human" --color "0E8A16" --description "Ready for a human to action"      --repo HansChucrute14/Hans_Metaharness
# "wontfix" is a default GitHub label; no need to create
```

These labels are already created on this repo (verified at setup time, 2026-07-28).
