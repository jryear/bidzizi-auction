import { uploadStaffAsset } from "../../../../../../server/staff-assets";
import { handle } from "../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { const { id } = await context.params; return handle(() => uploadStaffAsset(request,id)); }
