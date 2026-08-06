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
// Fixed TRUE production order (not the Excel column order). The tracker always
// displays stages in this sequence, including only the ones that apply to each
// job. Colours then flow done -> in-progress -> not-started naturally.
const STAGE_ORDER = [
  "Materials", "Vitap", "CNC", "Saw", "Moulder",
  "Edger", "Paint", "Acoustic", "Assembly", "Packing",
];

// Header text -> canonical stage name (lowercased match, tolerant of caps/spacing).
const STAGE_HEADER_MATCH = {
  materials: "Materials",
  vitap: "Vitap",
  vtap: "Vitap",
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
  return String(cellText(v) ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// exceljs returns cell values in several shapes: a plain string/number, a
// rich-text object { richText: [{text}, ...] }, a formula { result }, a
// hyperlink { text, hyperlink }, or a date. Coerce any of them to plain text.
function cellText(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v instanceof Date) return String(v);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text || "").join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return cellText(v.result);
    if (v.hyperlink != null && v.text != null) return String(v.text);
  }
  return String(v);
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

// Stage status is encoded as a NUMBER in each stage cell (conditional
// formatting colours it, but the value is the source of truth):
//   3 = complete (done)
//   2 = in progress
//   1 = not started (but required for this job)
//   blank = not applicable to this job (skip it)
export function classifyStage(value) {
  if (value == null || value === "") return "na";
  const n = Number(String(value).trim());
  if (n === 3) return "done";
  if (n === 2) return "in_progress";
  if (n === 1) return "not_started";
  return "na";
}

// A sheet can contain more than one header block — e.g. the main MDF/timber
// table, then further down a separate "In House Fibre Cement Projects" table
// with its own header row and column layout. Scan from startRow so callers can
// walk to the next block after finishing the current one.
function findHeaderRow(ws, startRow = 1) {
  for (let r = startRow; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values.map(norm).join(" | ");
    // Production sheet has job+project+lead time. Completed sheet has job+project
    // and dates but no stage/lead columns — accept job+project as the minimum.
    if (vals.includes("job") && vals.includes("project")) {
      return r;
    }
  }
  return -1;
}

function crmLooksValid(v) {
  // e.g. 21222-1, 17630, 17232b-3, 9967-6, 19289-2-1 (a part split into sub-parts)
  return /^\d{3,6}[a-z]?(-\d+)*$/i.test(cellText(v).trim());
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

// Some "Completed Jobs"-style sheets have NO header row at all — row 1 is
// already data, sitting under Excel's own bare column letters. There's
// nothing for findHeaderRow() to match, so the whole sheet would otherwise be
// silently skipped. Column A is the CRM and column B the project; the number
// of trailing date columns varies, so rather than guess which one is which,
// take the rightmost cell in the row that actually parses as a date.
function parseHeaderlessCompletedSheet(ws) {
  const jobs = [];
  const lastCol = Math.max(ws.columnCount || 0, 12);
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawCrm = row.getCell(1).value;
    if (!crmLooksValid(rawCrm)) continue;
    const project = cellText(row.getCell(2).value).trim();
    if (!project) continue;

    let dispatch = null;
    for (let c = lastCol; c >= 3; c--) {
      const iso = toISO(row.getCell(c).value);
      if (iso) {
        dispatch = iso;
        break;
      }
    }

    jobs.push({
      crm: cellText(rawCrm).trim(),
      project,
      dispatch,
      committed: dispatch,
      actual: dispatch,
      awaitingScheduling: false,
      overdue: false,
      completed: true,
      stages: [],
      stagesDone: 0,
      stagesTotal: 0,
    });
  }
  return jobs;
}

export async function parseWithColours(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const jobs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  wb.eachSheet((ws) => {
    // A sheet can hold more than one header block (e.g. the main MDF/timber
    // table, then further down a separate "In House Fibre Cement Projects"
    // table with its own header row and column layout), so keep walking to
    // the next header after each block instead of mapping columns once.
    let searchFrom = 1;
    let foundAnyBlock = false;
    while (searchFrom <= ws.rowCount) {
      const headerRow = findHeaderRow(ws, searchFrom);
      if (headerRow === -1) break;
      foundAnyBlock = true;

      // Map columns by header text.
      const header = ws.getRow(headerRow);
      const col = {};
      const stageCols = {}; // stageName -> column index
      header.eachCell((cell, c) => {
        const n = norm(cell.value);
        if (n === "job") col.crm = c;
        else if (n.includes("project")) col.project = c;
        else if (n.includes("commited completion") || n.includes("committed completion") || n === "completion date") col.committed = c;
        else if (n.includes("actual completion")) col.actual = c;
        else if (n.includes("lead time")) col.lead = c;
        for (const [k, v] of Object.entries(STAGE_HEADER_MATCH)) {
          if (n === k) stageCols[v] = c;
        }
      });

      if (col.crm == null || col.project == null) {
        searchFrom = headerRow + 1;
        continue;
      }

      // A block with no stage columns at all is a "Completed Jobs" block:
      // those jobs are fully produced (all phases done, packing done), and the
      // dispatch date lives in the completion/actual column.
      const isCompletedSheet = Object.keys(stageCols).length === 0;

      let r = headerRow + 1;
      for (; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const rawCrm = row.getCell(col.crm).value;
        const firstCell = norm(rawCrm);
        if (firstCell.startsWith("avg") || firstCell === "job") break;
        if (!crmLooksValid(rawCrm)) continue;
        const project = cellText(row.getCell(col.project).value).trim();
        if (!project) continue;

        const committed = col.committed ? toISO(row.getCell(col.committed).value) : null;
        const actual = col.actual ? toISO(row.getCell(col.actual).value) : null;

        // Build the stage list for this job (only stages that are applicable).
        const stages = [];
        for (const stageName of STAGE_ORDER) {
          const c = stageCols[stageName];
          if (c == null) continue;
          const status = classifyStage(row.getCell(c).value);
          if (status === "na") continue; // skip stages not part of this job
          stages.push({ name: stageName, status });
        }

        const dispatch = actual || committed;
        const awaitingScheduling = !isCompletedSheet && !dispatch;
        let overdue = false;
        if (dispatch) overdue = new Date(dispatch + "T00:00:00") < today;

        const done = stages.filter((s) => s.status === "done").length;

        jobs.push({
          crm: cellText(rawCrm).trim(),
          project,
          dispatch,
          committed,
          actual,
          awaitingScheduling,
          overdue,
          completed: isCompletedSheet,
          stages,
          stagesDone: done,
          stagesTotal: stages.length,
        });
      }

      // Continue scanning right where this block's row loop stopped — either
      // at the next header row or the end of the sheet.
      searchFrom = r;
    }

    // No "job"/"project" header text found anywhere on a sheet named like
    // "Completed Jobs" — it's a headerless archive sheet, not an empty one.
    if (!foundAnyBlock && /completed/i.test(ws.name || "")) {
      jobs.push(...parseHeaderlessCompletedSheet(ws));
    }
  });

  // De-dupe on crm+project. If a job appears on both the production sheet and
  // the completed sheet (mid-move), prefer the ACTIVE one (has live stages).
  const byKey = new Map();
  for (const j of jobs) {
    const key = `${j.crm}::${j.project}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, j);
    } else if (existing.completed && !j.completed) {
      byKey.set(key, j); // replace completed with active
    }
    // else keep existing (active already, or both same kind)
  }
  return Array.from(byKey.values());
}
