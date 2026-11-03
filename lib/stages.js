// The production stages a client sees, in true factory order.
//
// Lived in parseColours.js, because the spreadsheet's coloured cells were once
// the only place a stage status came from. The sheet is no longer read, and a
// list of what the factory does is not a fact about a spreadsheet — so it
// lives here, and the handover record is what fills it in.
//
// Only the stages Mitch assigned to a job appear on the client's page, in this
// sequence. The client never sees the names: the page renders them as
// "Phase 1", "Phase 2" and so on, deliberately, so packing in particular can't
// be read as "boxed and sitting in the warehouse".
//
// Must stay in step with PROCESS_OPTIONS in the handover app. A step missing
// here is a step that silently disappears from the client's progress bar —
// which is exactly what happened to DecorPress between it being added to the
// handover form and being added here.
export const STAGE_ORDER = [
  "Materials",
  "DecorPress",
  "Vitap",
  "CNC",
  "Saw",
  "Moulder",
  "Edger",
  "Paint",
  "Acoustic",
  "Assembly",
  "Packing",
];
