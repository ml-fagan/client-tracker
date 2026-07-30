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
        <img
          src="/decor-logo-dark.png"
          alt="Decor Systems"
          style={{ height: 30, width: "auto", margin: "0 auto 16px", display: "block" }}
        />
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
