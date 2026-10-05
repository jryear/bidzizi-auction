import { placeManualBid } from "../../../../../../../../server/manual-bids";
import { handle } from "../../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ eventId: string; lotId: string }> };
export async function POST(request: Request, context: Context) { const { eventId, lotId } = await context.params; return handle(() => placeManualBid(request, eventId, lotId)); }
