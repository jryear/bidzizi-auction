import { getTradeCatalog } from "../../../../../../server/catalog";
import { handle } from "../../../../../../server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handle(async()=>getTradeCatalog(request,(await context.params).id));}
