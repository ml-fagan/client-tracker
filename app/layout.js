export const metadata = {
  title: "Project Tracker · Decor Systems",
  description: "Track your Decor Systems project.",
};

export const viewport = {
  themeColor: "#1c1b19",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f5f3ef" }}>{children}</body>
    </html>
  );
}
