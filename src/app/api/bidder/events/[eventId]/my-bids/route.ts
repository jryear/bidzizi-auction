import { getMyBids } from "../../../../../../server/attendee-activity";
import { handle } from "../../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ eventId: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const params = await context.params;
    return getMyBids(request, params.eventId);
  });
}
