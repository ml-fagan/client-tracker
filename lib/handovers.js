// Jobs that live in the handover app rather than the spreadsheet.
//
// Duncan is moving onto the schedule board, where a job gets its dates and its
// stage progress without ever being typed into Production Schedule 2026
// Current.xlsx. Without this, those jobs would be invisible to clients — the
// link would say "not scheduled yet" forever, and nobody internal would notice,
// because internally everything looks right.
//
// Board jobs are mapped into exactly the shape parseColours produces, then
// appended to the same list, so the token, the project naming, the part labels
// and the stage display all work identically whichever source a job came from.
//
// Only what a client may see crosses this boundary: job number, project name,
// dates and stage statuses. Materials, suppliers, sheet counts and file links
// stay behind — they're on the record this reads, and must not reach the page.

import { STAGE_ORDER } from "./parseColours.js";

const BASE = process.env.HANDOVER_APP_URL || "";
const SECRET = process.env.JOB_API_SECRET || "";

export async function fetchLoggedHandovers() {
  if (!BASE || !SECRET) return [];
  const res = await fetch(`${BASE.replace(/\/$/, "")}/api/handovers/logged`, {
    headers: { Authorization: `Bearer ${SECRET}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Handover app ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Handover app returned an error.");
  return json.handovers || [];
}

// The same three states the spreadsheet's 1/2/3 cells mean.
function stageStatus(processState, stageName) {
  const state = processState?.[stageName];
  if (state === "done") return "done";
  if (state === "doing") return "in_progress";
  return "not_started";
}

// Materials tracks the order rather than a machine: on its way, or here.
function materialsStatus(materialOrder) {
  const state =
    materialOrder?.state ?? (materialOrder?.actioned ? "ordered" : "not_ordered");
  if (state === "arrived") return "done";
  if (state === "ordered") return "in_progress";
  return "not_started";
}

function boardJob(handover, today) {
  const schedule = handover.schedule || {};
  const committed = schedule.committedDate || null;
  const actual = schedule.actualDate || null;
  const dispatch = actual || committed;

  // Only the steps Mitch assigned appear, in the tracker's production order —
  // the rest aren't part of this job, which is what a blank cell means on the
  // spreadsheet too.
  const assigned = new Set(
    (handover.processes || []).map((p) => String(p).trim().toLowerCase())
  );
  const stages = STAGE_ORDER.filter((name) =>
    assigned.has(name.toLowerCase())
  ).map((name) => ({
    name,
    status:
      name.toLowerCase() === "materials"
        ? materialsStatus(handover.materialOrder)
        : stageStatus(schedule.processState, name),
  }));

  return {
    crm: String(handover.jobId).trim(),
    project: handover.project || handover.client || "",
    dispatch,
    committed,
    actual,
    awaitingScheduling: !dispatch,
    overdue: Boolean(dispatch && new Date(dispatch + "T00:00:00") < today),
    // "Completed" means the spreadsheet moved it to the Completed Jobs tab.
    // The board has no such step, and marking board jobs complete would start
    // the link-expiry clock on jobs that are still running.
    completed: false,
    stages,
    stagesDone: stages.filter((s) => s.status === "done").length,
    stagesTotal: stages.length,
  };
}

/**
 * Board jobs for CRMs the spreadsheet doesn't already have. The sheet wins
 * where both exist, so this can only ever add jobs a client couldn't otherwise
 * see — it can't change what one already shows.
 */
export function mergeBoardJobs(sheetJobs, handovers) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const known = new Set(
    sheetJobs.map((j) => String(j.crm).trim().toLowerCase())
  );
  const extra = handovers
    .filter((h) => !known.has(String(h.jobId).trim().toLowerCase()))
    .map((h) => boardJob(h, today));
  return [...sheetJobs, ...extra];
}
