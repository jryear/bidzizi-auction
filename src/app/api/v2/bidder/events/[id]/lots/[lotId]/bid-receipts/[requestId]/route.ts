import { tradeBidReceipt } from "../../../../../../../../../../server/manual-bids";
import { handle } from "../../../../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; lotId: string; requestId: string }> };
export async function GET(request: Request, context: Context) { const { id, lotId, requestId } = await context.params; return handle(() => tradeBidReceipt(request, id, lotId, requestId)); }
