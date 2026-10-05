import { getCatalog } from "../../../../../server/catalog";
import { handle } from "../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; return handle(() => getCatalog(request, id)); }
