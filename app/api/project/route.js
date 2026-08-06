import { downloadScheduleBuffer } from "../../../lib/graph.js";
import { parseWithColours } from "../../../lib/parseColours.js";
import { findPartsByToken, baseCrm } from "../../../lib/token.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The header should be the general project name, not one handover's specific
// detail (e.g. "Bond University - Ceiling Priority 2", or "Woodcrest State
// College LIN05, LIN 07, LIN08") — each part's own label already shows that.
// Take the words shared by every part's name, then still cut at a hyphen if
// one's left in what's common (covers a shared "- Something" prefix too).
function projectName(parts) {
  const names = parts.map((p) => p.project.trim()).filter(Boolean);
  const wordLists = names.map((n) => n.split(/\s+/));
  let common = wordLists[0] || [];
  for (const words of wordLists.slice(1)) {
    let i = 0;
    while (i < common.length && i < words.length && common[i].toLowerCase() === words[i].toLowerCase()) i++;
    common = common.slice(0, i);
  }
  const shared = common.join(" ").split("-")[0].trim();
  if (shared) return shared;
  // No words shared at all (unusual) — fall back to the shortest full name.
  return names.sort((a, b) => a.length - b.length)[0].split("-")[0].trim();
}

// Everything after the base job number, as numbers: "19289-1-2" -> [1, 2].
// A part can itself be split into sub-parts, so this can be more than one level deep.
function partSuffix(crm) {
  return String(crm).split("-").slice(1).map(Number);
}

function comparePartSuffix(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const RETENTION_DAYS_AFTER_COMPLETE = 7;

// Once EVERY handover/part for this job has been moved to Completed Jobs (not
// just one of several), the link should keep working for a one-week grace
// period after the last one finished, then quietly expire back to "not
// found" rather than staying live forever. While at least one part is still
// active, nothing here applies — the whole job (done parts included) always
// shows, which is the normal case and needs no expiry check at all.
function isExpired(parts) {
  if (!parts.every((p) => p.completed)) return false;
  const doneDates = parts
    .map((p) => p.dispatch)
    .filter(Boolean)
    .map((d) => new Date(d + "T00:00:00"));
  if (!doneDates.length) return false;
  const lastDone = new Date(Math.max(...doneDates.map((d) => d.getTime())));
  const expiry = new Date(lastDone);
  expiry.setDate(expiry.getDate() + RETENTION_DAYS_AFTER_COMPLETE);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > expiry;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tokenParam = searchParams.get("token");
  if (!tokenParam) {
    return Response.json({ ok: false, error: "No token" }, { status: 400 });
  }
  try {
    const { buffer, lastModified } = await downloadScheduleBuffer();
    const jobs = await parseWithColours(buffer);
    const parts = findPartsByToken(jobs, tokenParam);
    if (!parts.length || isExpired(parts)) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const sorted = parts.slice().sort((a, b) => comparePartSuffix(partSuffix(a.crm), partSuffix(b.crm)));
    const safeParts = sorted.map((p) => {
      const suffix = partSuffix(p.crm);
      // CRM-handover-part: a bare handover ("19289-1") is just a handover, not
      // a split order — only call it a "Part" once there's a real part suffix.
      let partLabel = null;
      if (suffix.length === 1) partLabel = `Handover ${suffix[0]}`;
      else if (suffix.length > 1) partLabel = `Handover ${suffix[0]} · Part ${suffix.slice(1).join(".")}`;
      return {
        crm: p.crm,
        partLabel,
        dispatch: p.dispatch,
        awaitingScheduling: p.awaitingScheduling,
        completed: p.completed || false,
        scheduled: p.completed || (!p.awaitingScheduling && p.stages.length > 0),
        stages: p.stages,
        stagesDone: p.stagesDone,
        stagesTotal: p.stagesTotal,
      };
    });
    return Response.json(
      {
        ok: true,
        project: {
          base: baseCrm(parts[0].crm),
          name: projectName(parts),
          multiPart: safeParts.length > 1,
          parts: safeParts,
        },
        fileModified: lastModified,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
