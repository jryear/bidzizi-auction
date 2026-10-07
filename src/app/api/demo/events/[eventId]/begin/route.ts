import { beginDemoEntry } from "../../../../../../server/demo-entry";
import { handle } from "../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ eventId: string }> };
export async function POST(request: Request, context: Context) { const { eventId } = await context.params; return handle(() => beginDemoEntry(request,eventId)); }
