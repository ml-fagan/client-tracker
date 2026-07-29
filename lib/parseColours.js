import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Parse the production schedule INCLUDING cell fill colours, so we can read
// each job's per-stage status from the coloured cells:
//   green  = done
//   orange = in progress
//   red    = not started (but required)
//   blank  = not applicable to this job
//
// Stage columns, in production order:
const STAGE_ORDER = [
  "Materials", "Vitap", "CNC", "Edger", "Moulder",
  "Paint", "Acoustic", "Saw", "Assembly", "Packing",
];

// Header text -> canonical stage name (lowercased match, tolerant of caps/spacing).
const STAGE_HEADER_MATCH = {
  materials: "Materials",
  vitap: "Vitap",
  cnc: "CNC",
  edger: "Edger",
  moulder: "Moulder",
  paint: "Paint",
  acoustic: "Acoustic",
  saw: "Saw",
  assembly: "Assembly",
  packing: "Packing",
};

function norm(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Extract an ARGB hex from an exceljs cell fill, if it has a solid fill.
function cellArgb(cell) {
  const fill = cell && cell.fill;
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") return null;
  const c = fill.fgColor || fill.bgColor;
  if (!c) return null;
  if (c.argb) return c.argb.toUpperCase();
  // Theme colours won't have argb; return a marker so we can treat as unknown.
  if (c.theme != null) return `THEME:${c.theme}`;
  return null;
}

// Classify an ARGB into a status. Thresholds are deliberately loose to tolerate
// shade variation; calibrate against the live sheet if needed.
export function classifyColour(argb) {
  if (!argb || argb.startsWith("THEME")) return "na";
  const hex = argb.slice(-6);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // White / near-white / no fill => not applicable
  if (r > 230 && g > 230 && b > 230) return "na";
  // Green: green dominant, red low
  if (g > 130 && r < 170 && g > b) return "done";
  // Orange / amber: high red, mid green, low blue
  if (r > 200 && g > 120 && g < 210 && b < 120) return "in_progress";
  // Red: red dominant, green & blue low
  if (r > 150 && g < 120 && b < 120) return "not_started";
  return "na";
}

function findHeaderRow(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    const vals = ws.getRow(r).values.map(norm).join(" | ");
    if (vals.includes("job") && vals.includes("project") && vals.includes("lead time")) {
      return r;
    }
  }
  return -1;
}

function crmLooksValid(v) {
  return /^\d{3,6}[a-z]?(-\d+)?$/i.test(String(v ?? "").trim());
}

function toISO(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}-${String(val.getDate()).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const d2 = new Date(s);
  if (!isNaN(d2)) {
    return `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
  }
  return null;
}

export async function parseWithColours(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const jobs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  wb.eachSheet((ws) => {
    const headerRow = findHeaderRow(ws);
    if (headerRow === -1) return;

    // Map columns by header text.
    const header = ws.getRow(headerRow);
    const col = {};
    const stageCols = {}; // stageName -> column index
    header.eachCell((cell, c) => {
      const n = norm(cell.value);
      if (n === "job") col.crm = c;
      else if (n === "project") col.project = c;
      else if (n.includes("commited completion") || n.includes("committed completion") || n === "completion date") col.committed = c;
      else if (n.includes("actual completion")) col.actual = c;
      else if (n.includes("lead time")) col.lead = c;
      for (const [k, v] of Object.entries(STAGE_HEADER_MATCH)) {
        if (n === k) stageCols[v] = c;
      }
    });
    if (col.crm == null || col.project == null) return;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawCrm = row.getCell(col.crm).value;
      const firstCell = norm(rawCrm);
      if (firstCell.startsWith("avg") || firstCell === "job") break;
      if (!crmLooksValid(rawCrm)) continue;
      const project = String(row.getCell(col.project).value ?? "").trim();
      if (!project) continue;

      const committed = col.committed ? toISO(row.getCell(col.committed).value) : null;
      const actual = col.actual ? toISO(row.getCell(col.actual).value) : null;

      // Build the stage list for this job (only stages that are applicable).
      const stages = [];
      for (const stageName of STAGE_ORDER) {
        const c = stageCols[stageName];
        if (c == null) continue;
        const status = classifyColour(cellArgb(row.getCell(c)));
        if (status === "na") continue; // skip stages not part of this job
        stages.push({ name: stageName, status });
      }

      const dispatch = actual || committed;
      const awaitingScheduling = !dispatch;
      let overdue = false;
      if (dispatch) overdue = new Date(dispatch + "T00:00:00") < today;

      const done = stages.filter((s) => s.status === "done").length;

      jobs.push({
        crm: String(rawCrm).trim(),
        project,
        dispatch,
        committed,
        actual,
        awaitingScheduling,
        overdue,
        stages,
        stagesDone: done,
        stagesTotal: stages.length,
      });
    }
  });

  // De-dupe on crm+project.
  const seen = new Set();
  const clean = [];
  for (const j of jobs) {
    const key = `${j.crm}::${j.project}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(j);
  }
  return clean;
}
