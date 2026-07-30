"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

const C = {
  bg: "#f5f3ef", ink: "#1c1b19", sub: "#6b6862", muted: "#9a968e",
  line: "#e5e1d8", card: "#ffffff", blue: "#004CFB", blueBg: "#e6ecff",
  done: "#3B6D11", prog: "#BA7517", todo: "#D3D1C7",
};

const PHASES = ["Kickoff", "In design", "Your approval", "Approved — awaiting scheduling"];

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export default function TrackerPage() {
  const params = useParams();
  const token = params?.token;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) { setError(json.error === "not_found" ? "not_found" : "error"); setData(null); }
      else { setData(json); setError(null); }
    } catch { setError("error"); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <main style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: C.bg, minHeight: "100vh", padding: "24px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ background: C.ink, borderRadius: "14px 14px 0 0", padding: "20px 24px" }}>
          <img
            src="/decor-logo-white.png"
            alt="Decor Systems"
            style={{ height: 26, width: "auto", display: "block" }}
          />
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: 24 }}>
          {loading && !data && <p style={{ color: C.sub, fontSize: 14, textAlign: "center", padding: "32px 0" }}>Loading…</p>}

          {error === "not_found" && (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 6px" }}>Project not found</p>
              <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>This tracking link may be incorrect. Please check the link or contact your Decor Systems representative.</p>
            </div>
          )}
          {error === "error" && (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: C.sub, margin: 0 }}>We couldn't load this project just now. Please try again shortly.</p>
            </div>
          )}

          {data?.project && (
            <>
              <p style={{ fontSize: 13, color: C.sub, margin: "0 0 4px" }}>Project</p>
              <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 2px", color: C.ink }}>{data.project.name}</h1>
              <p style={{ fontSize: 13, color: C.muted, margin: "0 0 8px" }}>Ref {data.project.base}</p>

              {data.project.parts.map((part, idx) => (
                <Part key={part.crm} part={part} showHeader={data.project.multiPart} isFirst={idx === 0} />
              ))}

              <p style={{ fontSize: 11, color: C.muted, margin: "20px 0 0", textAlign: "center" }}>
                Live status — refreshes when you reopen this page.
              </p>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
          <span style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em" }}>Powered by Lyphex</span>
        </div>
      </div>
    </main>
  );
}

function Part({ part, showHeader, isFirst }) {
  const scheduled = part.scheduled;

  // Production progress %: green(3)=1, amber(2)=0.5, red(1)=0, over applicable stages.
  // Awaiting scheduling shows a token 5% so the bar isn't discouragingly empty.
  let pct;
  if (!scheduled || part.stages.length === 0) {
    pct = 5;
  } else {
    let sum = 0;
    for (const s of part.stages) {
      sum += s.status === "done" ? 1 : s.status === "in_progress" ? 0.5 : 0;
    }
    pct = Math.round((sum / part.stages.length) * 100);
    if (pct < 5) pct = 5; // keep a sliver visible once in production
  }

  const dispatchText = part.awaitingScheduling ? "Awaiting scheduling" : fmtDate(part.dispatch);

  return (
    <div style={{ marginTop: isFirst ? 20 : 28, paddingTop: isFirst ? 0 : 20, borderTop: isFirst ? "none" : `1px solid ${C.line}` }}>
      {showHeader && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{part.partLabel || part.crm}</span>
          <span style={{ fontSize: 13, color: part.awaitingScheduling ? C.prog : C.blue, fontWeight: 500 }}>
            {part.awaitingScheduling ? "Awaiting scheduling" : `Dispatch ${fmtDate(part.dispatch)}`}
          </span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, marginTop: isFirst ? 20 : 0 }}>
        <span style={{ fontSize: 13, color: C.sub }}>Production progress</span>
        <span style={{ fontSize: 20, fontWeight: 500, color: C.done }}>{pct}%</span>
      </div>
      <div style={{ background: "#ECEAE3", borderRadius: 20, height: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.done, borderRadius: 20 }} />
      </div>

      {!showHeader && (
        <div style={{ background: C.blueBg, borderRadius: 12, padding: "16px 18px", marginTop: 22 }}>
          <div style={{ fontSize: 12, color: C.blue, marginBottom: 3 }}>Expected dispatch</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: C.blue }}>{dispatchText}</div>
        </div>
      )}
    </div>
  );
}

function CircleRow({ items }) {
  const COL = { done: C.done, in_progress: C.prog, current: C.prog, not_started: C.todo, todo: C.todo };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", rowGap: 18 }}>
      {items.map((s, i) => {
        const status = s.status;
        const col = COL[status] || C.todo;
        const isLast = i === items.length - 1;
        const doneLine = status === "done";
        return (
          <div key={s.name + i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 22%", minWidth: 66, maxWidth: 120, position: "relative", boxSizing: "border-box" }}>
            {!isLast && (
              <div style={{ position: "absolute", top: 14, left: "50%", width: "100%", height: 3, background: doneLine ? C.done : C.line }} />
            )}
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, position: "relative" }}>
              {status === "done" ? <Check /> : <Dot />}
            </div>
            <div style={{ marginTop: 7, fontSize: 11, color: (status === "not_started" || status === "todo") ? C.muted : C.ink, fontWeight: (status === "in_progress" || status === "current") ? 500 : 400, textAlign: "center", lineHeight: 1.25, padding: "0 3px" }}>
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function Dot() {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />;
}
