import { downloadScheduleBuffer } from "../../../lib/graph.js";
import { parseWithColours } from "../../../lib/parseColours.js";
import { findPartsByToken, baseCrm } from "../../../lib/token.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function projectName(parts) {
  return parts.map((p) => p.project).sort((a, b) => b.length - a.length)[0];
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
    const sorted = parts.slice().sort((a, b) => {
      const na = (a.crm.match(/-(\d+)$/) || [null, "0"])[1];
      const nb = (b.crm.match(/-(\d+)$/) || [null, "0"])[1];
      return Number(na) - Number(nb);
    });
    const safeParts = sorted.map((p) => {
      const suffix = (p.crm.match(/-(\d+)$/) || [null, null])[1];
      return {
        crm: p.crm,
        partLabel: suffix ? `Part ${suffix}` : null,
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
