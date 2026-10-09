import { readStaffAsset } from "../../../../../../../../../server/staff-assets";
import { handle } from "../../../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; assetId: string; approvalId: string }> };
export async function GET(request: Request, context: Context) { const { id, assetId, approvalId } = await context.params; return handle(() => readStaffAsset(request,id,assetId,"staff-approved",approvalId)); }
