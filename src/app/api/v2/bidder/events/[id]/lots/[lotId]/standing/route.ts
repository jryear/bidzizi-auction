import { tradeBidStanding } from "../../../../../../../../../server/manual-bids";
import { handle } from "../../../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; lotId: string }> };
export async function GET(request: Request, context: Context) { const { id, lotId } = await context.params; return handle(() => tradeBidStanding(request, id, lotId)); }
