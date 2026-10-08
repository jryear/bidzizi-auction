import { manualBidReceipt } from "../../../../../../../../../server/manual-bids";
import { handle } from "../../../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ eventId: string; lotId: string; requestId: string }> };
export async function GET(request: Request, context: Context) { const { eventId, lotId, requestId } = await context.params; return handle(() => manualBidReceipt(request, eventId, lotId, requestId)); }
