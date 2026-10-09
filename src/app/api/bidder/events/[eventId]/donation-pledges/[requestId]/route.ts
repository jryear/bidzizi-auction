import { getDonationReceipt } from "../../../../../../../server/donation-pledges";
import { handle } from "../../../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ eventId: string; requestId: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const params = await context.params;
    return getDonationReceipt(request, params.eventId, params.requestId);
  });
}
