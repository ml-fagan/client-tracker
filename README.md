# Decor Systems — Client Project Tracker

A public, per-project tracker clients open via a permanent link. Each project's
link shows only that project: name, production stage tracker (from the coloured
stage cells in the schedule), and the expected dispatch date. No internal data
(no lead times, priority, costs, or other jobs). Decor Systems branded, with
"Powered by Lyphex" in the footer.

## How it works

- `lib/graph.js` — reads the schedule file from SharePoint (same service
  principal / Azure app as the production widget).
- `lib/parseColours.js` — reads the file WITH cell fill colours (via exceljs)
  and turns each job's stage cells into done / in-progress / not-started, and
  reads dispatch (actual-if-present-else-committed; "Awaiting scheduling" when
  neither date is set).
- `lib/token.js` — derives each project's permanent link token from its CRM via
  HMAC(CRM, LINK_SECRET). Same CRM always → same token, so links never change.
- `app/p/[token]/page.js` — the client-facing tracker page.
- `app/api/project/route.js` — resolves a token to ONE sanitised project.

## One-time setup

1. **Push to GitHub** as a new repo (e.g. `ml-fagan/client-tracker`).
2. **Import to Vercel**, same team as the other Lyphex apps.
3. **Environment variables** (Settings → Environment Variables), from
   `.env.example`:
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — the SAME three
     values already in the production-widget project (same Azure app).
   - `LINK_SECRET` — a fixed random string. **This exact value must also be set
     in the production-widget project** so its "Copy link" column produces links
     this app can resolve. Generate once (e.g. `openssl rand -hex 32`), then
     never change it — changing it breaks every client link.
4. **Redeploy.**
5. **Domain:** add `track.decorsystems.com.au` under Settings → Domains, then
   create the CNAME Vercel shows you on the **decorsystems.com.au** DNS (needs
   whoever manages that domain). Until then it runs on its `.vercel.app` URL.

## Security notes

- Tokens are unguessable (HMAC-derived), so a client with one link can't reach
  another project's link.
- This site is deliberately public (no password) — the token IS the access
  control. Only people you send a link to can see that project.
- Only sanitised fields ever leave the server (see `app/api/project/route.js`).

## Calibrating stage colours

The colour classifier in `lib/parseColours.js` (`classifyColour`) uses loose
green/orange/red thresholds. If any job's stages read wrong against the sheet,
tell me the CRM and what it should say, and the thresholds get tuned to your
exact fills. Blank/white cells are treated as "not applicable" and hidden.

## Dispatch date rule

actual completion date if present, else committed completion date, else
"Awaiting scheduling". Matches the production widget.
