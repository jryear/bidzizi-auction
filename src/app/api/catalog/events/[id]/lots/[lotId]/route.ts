import { getCatalogLot } from "../../../../../../../server/catalog";
import { handle } from "../../../../../../../server/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; lotId: string }> }) { const { id, lotId } = await context.params; return handle(() => getCatalogLot(request, id, lotId)); }
