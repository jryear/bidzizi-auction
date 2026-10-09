import { editNonprofit } from "../../../../../../../../server/donation-pledges";
import { handle } from "../../../../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; nonprofitId: string }> };
export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    const params = await context.params;
    return editNonprofit(request, params.id, params.nonprofitId);
  });
}
