import { recoverStaffAsset } from "../../../../../../../server/staff-assets";
import { handle } from "../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; requestId: string }> };
export async function GET(request: Request, context: Context) { const { id, requestId } = await context.params; return handle(() => recoverStaffAsset(request,id,requestId)); }
