# Issue Tracker

This repo tracks issues in **GitHub Issues** at `HansChucrute14/Hans_Metaharness`.

## Creating issues

Use the `gh` CLI:

```bash
gh issue create --repo HansChucrute14/Hans_Metaharness \
  --title "<short summary>" \
  --body "<spec or description>"
```

Skills like `to-spec`, `to-tickets`, and `triage` create issues via this command. PRs are **not** used as a request surface (the triage queue only ingests issues; PRs are handled separately by `code-review`).

## Reading issues

```bash
gh issue list --repo HansChucrute14/Hans_Metaharness --state open
gh issue view <ISSUE_NUMBER> --repo HansChucrute14/Hans_Metaharness
```

## Auth

`gh` CLI must be authenticated. Personal access tokens are accepted via the `GH_TOKEN` or `GITHUB_TOKEN` environment variable. Required scopes: `repo` (for issue create/list/view) and `admin:repo_hook` (if webhooks are later wired for issue events).

## Triage labels

See `triage-labels.md` in this directory for the canonical label vocabulary.
