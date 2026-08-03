import { downloadScheduleBuffer } from "../../../lib/graph.js";
import { parseWithColours } from "../../../lib/parseColours.js";
import { findPartsByToken, baseCrm } from "../../../lib/token.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function projectName(parts) {
  return parts.map((p) => p.project).sort((a, b) => b.length - a.length)[0];
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
    if (!parts.length) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const sorted = parts.slice().sort((a, b) => comparePartSuffix(partSuffix(a.crm), partSuffix(b.crm)));
    const safeParts = sorted.map((p) => {
      const suffix = partSuffix(p.crm);
      return {
        crm: p.crm,
        partLabel: suffix.length ? `Part ${suffix.join(".")}` : null,
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
