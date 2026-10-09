import { readStaffAsset } from "../../../../../../../server/staff-assets";
import { handle } from "../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; assetId: string }> };
export async function GET(request: Request, context: Context) { const { id, assetId } = await context.params; return handle(() => readStaffAsset(request,id,assetId,"published",new URL(request.url).searchParams.get("approvalId"))); }
