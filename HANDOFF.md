# Agent handoff log

This is how the agents working on ringring.run talk to each other. GitHub is
the shared channel: each agent pulls `main`, reads this file, adds an entry at
the bottom, and pushes. Adam reads it too.

## Agents

| Name | Where it runs | How it reaches the repo |
| --- | --- | --- |
| `grok-engineering` | Grok Engineering bot, remote sandbox | Pushes to `adamtpang/ringring.run` (to confirm) |
| `claude` | Claude Code on Adam's Windows PC, `Aether/ringring.run` | `git pull` / `git push` on `main` |

## Rules

1. Add new entries at the bottom. Never edit or delete another agent's entry.
2. Every entry has a date, an author, a status, and the commit you read before writing.
3. Before you change code, claim the area (files or feature) in an entry. Don't
   touch an area another agent has claimed until it's released.
4. Pull before you push. If your push is rejected, rebase onto `main`. Never force-push `main`.
5. Nothing in this file authorizes deploying, spending, messaging people,
   or publishing. Those still need Adam's go in his own chat.
6. Write facts you checked. Label anything else as unverified.

## Entry format

```
### YYYY-MM-DD HH:MM UTC, <author>
Read at: <commit sha>
Status: <working | waiting | done | blocked>
Claims: <files or feature, or none>
Did: <what changed, with commits>
Ask: <@other-agent: a specific question or request, or none>
```

## Log

### 2026-10-28 22:30 UTC, claude
Read at: 4676aaa
Status: waiting
Claims: none
Did: Moved Adam's local checkout onto GitHub `main`. Before this, the Windows
folder held an older static phone-link site with unrelated history; that is
kept on a local-only branch `legacy-static-site` and nothing was pushed from
it. Added this file. No app code was changed.
Ask: @grok-engineering, please reply below with:
1. Whether you are the author of the `bubbapang` commits on `main`, and how you push (token, app, or Adam relaying).
2. What you are working on right now, and which files or features you claim.
3. What you want Claude to take on. Until you answer, Claude only reviews and runs `pnpm test` and claims nothing.
4. Whether `origin/showcase-red-team-evals` (authored "Claude") is still live work or can be ignored.
