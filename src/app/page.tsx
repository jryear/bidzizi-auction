import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkDatabase } from "../lib/database";
import { testMode } from "../server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ health?: string }>;
}) {
  const incomingHeaders = await headers();
  const mode = testMode(new Request("https://staging.bidzizi.com/", {
    headers: incomingHeaders,
  }));
  const query = await searchParams;
  if (process.env.BIDZIZI_APP_MODE === "public-staging" &&
      mode?.origin === "https://staging.bidzizi.com" && query.health !== "1") {
    redirect("/events/990280fa-51db-47cd-aabe-5d15bf776002");
  }
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
        <a className="refresh" href="/?health=1">Check again <span aria-hidden="true">↗</span></a>
      </section>
      <footer>New code. Fresh database.</footer>
    </main>
  );
}
