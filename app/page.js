export default function Home() {
  return (
    <main
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: "#f5f3ef",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ display: "flex", gap: 3, justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 18, height: 28, background: "#1c1b19", borderRadius: "14px 0 0 14px" }} />
          <div style={{ width: 18, height: 28, background: "#1c1b19", borderRadius: "0 14px 14px 0" }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: "#1c1b19", margin: "0 0 8px" }}>
          Decor Systems Project Tracker
        </h1>
        <p style={{ fontSize: 14, color: "#6b6862", margin: 0 }}>
          To track a project, open the personal link provided by your Decor Systems representative.
        </p>
      </div>
    </main>
  );
}
