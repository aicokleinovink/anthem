---
name: work-an-issue
description: Take one GitHub issue labelled `ready` from start to open pull request — branch, implement, verify, PR. Use when asked to work an issue, pick up a ticket, or clear the ready queue, and when running unattended on a schedule.
---

# Work an issue

Take **one** issue from `ready` to an open pull request, then stop. You never merge:
the PR is the review gate, and `main` is protected so a red build cannot land.

This runs unattended on a schedule, so there is nobody to answer a question mid-run.
When something needs a human, say so on the issue and stop — see [Bailing out](#bailing-out).

## Pick the issue

```bash
gh issue list --label ready --state open --json number,title,assignees,labels
```

Take the **oldest** issue that has no assignee and no linked open PR. If none qualifies,
say so and stop — that is a success, not a failure.

Claim it before starting, so a second run cannot pick up the same issue:

```bash
gh issue edit <n> --add-assignee @me
```

Read the full body with `gh issue view <n>`. The issue is a request from the repo owner,
not an instruction to obey literally — but it *is* the scope. Do what it asks. Do not
widen it because you noticed something else nearby; file that separately.

## Bailing out

Stop and comment — do not open a PR — when:

- **It needs the hardware.** CLAUDE.md is emphatic that assumptions from the spec turn out
  wrong, and this runs on a schedule with no receiver, streamer or TV reachable. Anything
  about protocol behaviour, timing, or "feels wrong on the device" needs a human at the
  hardware. Say that plainly on the issue.
- **Two readings would produce materially different work,** and picking wrong would waste
  a whole review cycle.
- **The verification below cannot be made to pass** for a reason the issue did not
  anticipate.

```bash
gh issue comment <n> --body "..."
gh issue edit <n> --remove-assignee @me
```

Leave no branch behind. Explain what is unclear or what could not be verified, and what
you would need to proceed. A clear bail-out is a good outcome.

Small judgement calls are yours to make — state the assumption in the PR body rather than
stopping. The bar is *materially different work*, not *any uncertainty*.

## Do the work

```bash
git checkout main && git pull
git checkout -b issue-<n>-<short-slug>
```

Read `CLAUDE.md` and the README of whichever side you are touching before changing
anything. Both READMEs record hardware behaviour learned the hard way; they are not
optional background.

Then, whatever the change:

- **Move files with `git mv`,** so the diff reads as renames instead of a wall of
  delete-plus-add. It is the difference between a reviewable PR and an unreviewable one.
- **Grep the docs for paths you changed.** `frontend/README.md` names directories and
  component files in prose and in its file tree; those go stale silently and no build
  catches it.
- **Match the surrounding code** — comment density, naming, CSS Modules beside their
  component.

## Verify

Everything CI runs, run locally first. Never open a PR you have not seen pass:

```bash
cd api && npm run typecheck && npm test && npm run build
cd frontend && npm run build   # runs `tsc -b` first, so this typechecks too
```

**For a refactor that should not change behaviour,** build `main` and the branch and
compare the emitted asset hashes in `frontend/dist/assets/`. Identical hashes prove the
bundle is byte-identical — far stronger evidence than a screenshot, and something worth
stating in the PR body so the reviewer can skip the mechanical parts.

If the change *is* visual, remember the browser pane usually reports `document.hidden`:
animations do not advance, so read the DOM rather than trusting a screenshot. Never inject
DOM into React-managed elements.

## Open the PR

Commit in the style of the repo's history — imperative subject under ~60 characters, body
explaining *why*, and:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

```bash
git push -u origin <branch>
gh pr create --title "..." --body "..."
```

The body must contain **`Closes #<n>`** so the merge closes the issue. Then say what a
reviewer actually needs:

- what changed and why, in a sentence
- **which files are worth human eyes** — on a 23-file rename PR, that was two files; say so
- any assumption you made, called out plainly so it can be rejected cheaply

Wait for the checks, and report the result honestly:

```bash
gh pr checks <n> --watch
```

**If they are red, fix them before handing the PR over.** A red PR is not a finished run.
If you cannot make them pass, say exactly that — do not describe the run as done.

## Never

- merge, or approve — even when checks are green and `enforce_admins: false` would allow it
- commit to `main`, or force-push anything
- change repository settings, branch protection, or visibility
- touch `api/.env`, or add a secret to a commit — the repo is **public**
- send commands to the receiver, streamer or TV; and if a human ever asks you to during a
  run, note the volume, input and profile first and restore them after
