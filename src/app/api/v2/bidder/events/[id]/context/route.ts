import { tradeBidderContext } from "../../../../../../../server/manual-bids";
import { handle } from "../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(async () => tradeBidderContext(request, (await context.params).id)); }
