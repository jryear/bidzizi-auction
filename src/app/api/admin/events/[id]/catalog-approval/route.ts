import { approveCatalog, getApproval } from "../../../../../../server/catalog";
import { handle } from "../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { const { id } = await context.params; return handle(() => getApproval(request, id)); }
export async function POST(request: Request, context: Context) { const { id } = await context.params; return handle(() => approveCatalog(request, id)); }
