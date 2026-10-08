import { approveTradeCatalog, getTradeApproval } from "../../../../../../../server/catalog";
import { handle } from "../../../../../../../server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handle(async()=>getTradeApproval(request,(await context.params).id));}
export async function POST(request:Request,context:Context){return handle(async()=>approveTradeCatalog(request,(await context.params).id));}
