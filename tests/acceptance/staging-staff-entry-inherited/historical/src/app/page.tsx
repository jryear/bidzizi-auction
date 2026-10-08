import { checkDatabase } from "../lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const database = await checkDatabase();
  return (
    <main>
      <header><span className="brand">BidZizi</span><span className="label">Staging</span></header>
      <section aria-labelledby="connection-heading">
        <p className="eyebrow">Fresh environment</p>
        <h1 id="connection-heading">{database.ok ? "Database connected." : "Database unavailable."}</h1>
        <p className="description">{database.ok ? "The new app reached Neon and the connection check passed." : "The connection check failed. Try again in a moment."}</p>
        <div className={`status ${database.ok ? "success" : "failure"}`} role="status">
          <span className="dot" aria-hidden="true" />
          <span>{database.ok ? "SELECT 1 returned 1" : "Connection not verified"}</span>
        </div>
        <p className="checked">Checked <time dateTime={database.checkedAt}>{new Date(database.checkedAt).toUTCString()}</time></p>
        <a className="refresh" href="/">Check again <span aria-hidden="true">↗</span></a>
      </section>
      <footer>New code. Fresh database.</footer>
    </main>
  );
}
