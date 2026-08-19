# Handover — Decor Systems client tracker

Written by a prior Claude session for whoever picks this up next. This is a
**real production tool** for Decor Systems (a client-facing project tracker) —
pushes to `main` deploy straight to Vercel, no staging environment.

## What this is

A public, unauthenticated page (`/p/[token]`) that lets a client check the
production status of their job, without logging in. The token is an
unguessable HMAC of their CRM number, so anyone with the link can view their
own job and nothing else.

## Where everything lives

- **This repo**: `C:\Users\Michael\OneDrive - Decor Systems\Desktop\ProFlow\client-tracker`
  — pushes to `https://github.com/ml-fagan/client-tracker.git`, branch `main`.
  Deployed on Vercel (team "FlowDesk's ...", Hobby plan), live at
  **`https://decor.lyphex.com`**.
- **Sibling app — the internal staff tracker**:
  `C:\Users\Michael\OneDrive - Decor Systems\Desktop\ProFlow\Production-Widget\production-feed`
  (repo `ml-fagan/production-widget`). Staff use this to see the full
  schedule and generate/copy client links. **`lib/token.js` in both repos
  must produce identical tokens for the same CRM** — if you change the
  HMAC/baseCrm logic in one, mirror it in the other, or every existing client
  link silently breaks. There's a "Generate client link" box in that app's
  `app/page.js` you should know about if working on link generation.
- **A stale, unused duplicate** exists at
  `.../Production-Widget/redundant` (renamed from `client-tracker` — no
  `.git`, not deployed, ignore it entirely).
- **Secrets reference** (partial, not authoritative — real values live in
  Vercel env vars): `.../Production-Widget/Secret Keys.md` /`.txt`. Has
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `LINK_SECRET`. No local `.env.local`
  exists in this repo — you cannot exercise live SharePoint/Graph calls
  locally, see "Testing" below.
- **Source of truth data**: `Production Schedule 2026 Current.xlsx` on
  SharePoint, site `/sites/Projects`, path `/- OTHER/Jordan/...`, fetched via
  Microsoft Graph with a read-only, app-only Azure registration
  (`lib/graph.js`). Two sheets matter: **"Production Schedule"** (active
  jobs, has stage colour columns) and **"Completed Jobs"** (finished jobs,
  moved off the active sheet by the production manager — **has no header row
  at all**, see below).

## Architecture

- Next.js 15, App Router.
- `app/p/[token]/page.js` — the client-facing page. Client component, fetches
  `/api/project?token=...`, polls on window focus.
- `app/api/project/route.js` — downloads the schedule, parses it, matches the
  token to job part(s), computes the display name/labels/sort order, applies
  the retention/expiry rule.
- `lib/graph.js` — Microsoft Graph download.
- `lib/parseColours.js` — parses the workbook including cell fill/values (a
  stage cell's *value*, 1/2/3, is the source of truth for status, not the
  colour — the colour is just conditional formatting following the value).
- `lib/token.js` — `tokenForCrm()` (HMAC-SHA256, first 12 hex chars),
  `baseCrm()`, `findPartsByToken()`.

**Note**: unlike `production-feed`, this repo does **not** have a shared
`lib/crmUtils.js` — `baseCrm`/`crmLooksValid` regexes are duplicated locally
in `token.js`/`parseColours.js` here and must be kept in sync with
`production-feed`'s copies by hand (separate repos, can't literally share a
file). If you fix a regex bug in one repo, check the other.

## Conventions you need to know

- **CRM naming**: `CRM-handover-part` (e.g. `19289-1-2`). A bare CRM, a
  `CRM-handover`, or a `CRM-handover-part` all group under **one client
  link**, keyed to the base CRM (`baseCrm()` strips *all* trailing `-N`
  segments, however many levels deep).
- **Link format**: `https://decor.lyphex.com/p/<token>`. Same token for every
  part/sub-part sharing a base CRM — the page stacks them all.
- **Stage names are deliberately hidden from clients.** The bar shows
  generic "Phase 1/2/3...", never "Materials/CNC/Paint". Packing is folded
  in anonymously too, so a client can't tell their job is boxed and waiting.
  This was a considered, confirmed business decision — don't reveal real
  stage names without explicitly re-confirming with Michael first.
- **"Awaiting scheduling"** shows until a committed/actual date exists in the
  sheet, then automatically switches to the real date. Don't touch this —
  it's correct and driven live by the spreadsheet.
- **Phase bar visibility** is driven by whether there's real stage data
  (`stages.length > 0` or `completed`), **independent** of whether a
  dispatch date exists yet. (This was a bug — see history below.)
- **"Coming soon" placeholder**: `production-feed`'s Generate-link box can
  append `?name=Some+Placeholder` to a link generated before the job hits
  the schedule. No server storage involved — the name lives entirely in the
  URL. If the token doesn't resolve to real data but a `name` param is
  present, this page shows "Coming soon: [name]" instead of "Project not
  found". **The moment real schedule data exists for that token, it always
  wins and the URL param is ignored completely** — don't let a stale
  placeholder override real data.
- **Retention/expiry**: once *every* part sharing a base CRM is `completed`
  (on the Completed Jobs sheet), the link keeps working for exactly 7 days
  after the most recent completion date, then reverts to "not found". While
  *any* part is still active, the whole job — completed parts included,
  shown fully green with their real (possibly past) dates — stays visible
  indefinitely. See `RETENTION_DAYS_AFTER_COMPLETE` in `route.js`.
- **Project title** (the big heading) is derived from words common to
  *every* part's raw Excel project text, not just "pick the longest one" —
  a detail specific to a single handover (hyphenated or not) shouldn't leak
  into the overall title. See `projectName()` in `route.js`.

## Bug history this session (so you don't rediscover these)

Roughly chronological, newest last — `git log` has the real commits:

1. FC in-house table header didn't literally say "Project" → exact-match
   became substring-match; also needed to scan for *multiple* header blocks
   per sheet (a sheet can have more than one table stacked in it).
2. CRM validity regex only allowed one `-N` suffix → allow `(-\d+)*`.
3. `baseCrm()` only stripped the *last* `-N` → strip all trailing `-N`
   segments so deep part-splits still group correctly.
4. Part labels/sort only used the last suffix digit → use the full path
   ("Handover 1 · Part 2"); a bare handover says "Handover N", only a real
   part-split says "· Part M".
5. **The Completed Jobs sheet has no header row at all** — row 1 is already
   data, under bare Excel column letters. It was being silently skipped
   entirely (not just one job — *every* completed job was invisible). Fixed
   with a name-detected (`/completed/i` on the sheet name) positional
   fallback: column A = CRM, column B = project, rightmost parseable date in
   the row = completion date.
6. Phase bar was hidden whenever there was no dispatch date, even with real
   stage progress sitting right there in the sheet — decoupled "has
   progress" from "has a date".
7. Reassurance message said "on the date below" even in the multi-part
   layout where the date is actually shown *above*.
8. Project title picked one handover's longest/most specific name instead of
   what's common across all of them.

## Testing — read this before assuming something works

**There is no `.env.local` and no way to run live Graph/SharePoint calls
locally.** Every fix this session was verified one of two ways, and you
should do the same:

- **Pure logic** (regexes, date math, matching): copy the exact function(s)
  into a throwaway `node -e '...'` one-liner or scratch script and run
  representative + edge-case inputs. Delete the scratch file after.
- **Anything touching the actual Excel parsing** (`parseColours.js`): build
  a synthetic workbook in-memory with `exceljs` that matches the *real*
  sheet structure (ask the user for a screenshot of the actual header
  row/data if you're not sure — that's how bugs #1 and #5 above were pinned
  down precisely instead of guessed at), run it through the **real**
  `parseWithColours`/`findPartsByToken` functions, and check the output.
  This repo's `package.json` has `"type": "module"`, so plain `node
  script.mjs` can import the lib files directly — no bundler needed.
- Always run `npm run build` before proposing to push (`npm install` first
  if `node_modules` is missing) — it compiles and type-checks without
  needing live credentials, since routes are `force-dynamic`. If you hit
  `EINVAL: invalid argument, readlink '...\.next\diagnostics\...'`, that's
  an unrelated OneDrive file-lock issue — `rm -rf .next` and rebuild.
- After pushing, you can verify against the live site directly:
  `curl "https://decor.lyphex.com/api/project?token=<token>"`. Deploys take
  roughly 30–90s; poll in a loop with a few seconds' sleep rather than
  guessing it's done.

## Known gaps / deliberately not built

- No shared/server-side storage anywhere in this app. The "coming soon"
  name lives in the URL; the pending-links list (in `production-feed`) is
  personal to whoever generates it, stored in their own browser's
  localStorage. If the team later needs that pending list shared across
  people/devices, that needs a real datastore — Firebase was floated (it's
  already used elsewhere in Michael's stack) but explicitly **not** wired up
  because it wasn't needed yet. Don't add it without asking first.
- No automated test suite. See "Testing" above for how to verify changes
  instead.
- Real Excel stage names are intentionally hidden — see "Conventions" above.

## Workflow notes

- This is Michael's real tool — only commit/push when he explicitly says so.
  Show him the diff/explanation and what you verified first.
- Don't trust "looks correct on reading the code" for anything touching
  `parseColours.js` — this session found real bugs that code review alone
  didn't catch; build synthetic data and actually run the parser.
- `package-lock.json` will appear locally after `npm install` since this
  repo has never had one committed — that's normal, leave it untracked
  unless the user asks you to commit it.
