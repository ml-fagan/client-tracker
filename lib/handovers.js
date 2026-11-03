// What a client is allowed to know about their job, built from the handover
// records.
//
// This used to be the second of two sources. The first was Jordan's
// spreadsheet, and where both had the same job the spreadsheet won — so the
// client page showed whatever the sheet said, and this only ever filled in
// jobs the sheet had never heard of.
//
// The floor stopped using the sheet, and the feed stopped reading it on
// 30 October 2026. This page kept reading it for another few days, which was
// the worst place for it to be left: internally a stale row is something
// somebody notices, and a client has no way to know that the dates and the
// progress bar in front of them stopped moving a month ago. Worse, the
// download was the first thing the route did and was not guarded — the day
// that file is renamed, every client link returns a 500.
//
// So there is one source now, and it is the record Duncan actually keeps.
//
// Only what a client may see crosses this boundary: job number, project name,
// dates and stage statuses. Materials, suppliers, sheet counts and file links
// stay behind — they're on the record this reads, and must not reach the page.

import { STAGE_ORDER } from "./stages.js";

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

// The same three states the spreadsheet's 1/2/3 cells used to mean.
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

function clientJob(handover, today) {
  const schedule = handover.schedule || {};
  const committed = schedule.committedDate || null;
  const actual = schedule.actualDate || null;
  // The revised date where Duncan has moved it, otherwise the committed one.
  // The same rule every internal board uses, so the client and the factory
  // are never looking at two different answers.
  const dispatch = actual || committed;

  // Only the steps Mitch assigned appear, in the tracker's production order —
  // the rest aren't part of this job, which is what a blank cell meant on the
  // spreadsheet too.
  const assigned = new Set(
    (handover.processes || []).map((p) => String(p).trim().toLowerCase())
  );
  const stages = STAGE_ORDER.filter((name) => assigned.has(name.toLowerCase())).map(
    (name) => ({
      name,
      status:
        name.toLowerCase() === "materials"
          ? materialsStatus(handover.materialOrder)
          : stageStatus(schedule.processState, name),
    })
  );

  /**
   * Finished and off the floor.
   *
   * Hard-coded false while the sheet was the authority on this: "completed"
   * meant a row had been moved to its Completed Jobs tab, and the board had no
   * equivalent, so marking board jobs complete would have started the
   * link-expiry clock on jobs still running. The board has one now — Duncan
   * stamps it when the job goes out — so the link expires a week after the
   * last part is finished, as it was always meant to.
   */
  const completed = Boolean(schedule.completedAt);

  return {
    crm: String(handover.jobId).trim(),
    project: handover.project || handover.client || "",
    dispatch,
    committed,
    actual,
    awaitingScheduling: !dispatch,
    overdue: Boolean(dispatch && !completed && new Date(dispatch + "T00:00:00") < today),
    completed,
    stages,
    stagesDone: stages.filter((s) => s.status === "done").length,
    stagesTotal: stages.length,
  };
}

/** Every logged handover, in the shape the client page reads. */
export function clientJobs(handovers) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (handovers || []).map((h) => clientJob(h, today));
}
