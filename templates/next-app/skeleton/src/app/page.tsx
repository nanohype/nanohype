import Link from "next/link";

export default function Home() {
  return (
    <main
      className="animate-fade-in"
      style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}
    >
      <div style={{ maxWidth: "40rem", textAlign: "center" }}>
        <h1
          className="text-foreground"
          style={{ marginBottom: "1rem", fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          __PROJECT_NAME__
        </h1>
        <p
          className="text-muted-foreground"
          style={{ marginBottom: "2rem", fontSize: "1.125rem" }}
        >
          __DESCRIPTION__
        </p>
        <Link
          href="/chat"
          className="btn-accent shadow-surface"
        >
          Open Chat
        </Link>
      </div>
    </main>
  );
}
