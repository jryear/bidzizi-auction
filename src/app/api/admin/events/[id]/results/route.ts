import { getStaffResults } from "../../../../../../server/staff-operations";
import { handle } from "../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { const { id } = await context.params; return handle(() => getStaffResults(request, id)); }
