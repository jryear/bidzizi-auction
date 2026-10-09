import { exportDonations } from "../../../../../../../server/donation-pledges";
import { handle } from "../../../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const params = await context.params;
    return exportDonations(request, params.id);
  });
}
