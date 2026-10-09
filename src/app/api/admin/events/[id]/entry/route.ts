import { getEventEntry, setEventEntry } from "../../../../../../server/staff-event-entry";
import { handle } from "../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { const { id } = await context.params; return handle(() => getEventEntry(request, id)); }
export async function POST(request: Request, context: Context) { const { id } = await context.params; return handle(() => setEventEntry(request, id)); }
