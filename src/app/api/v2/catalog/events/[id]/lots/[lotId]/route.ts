import { getTradeCatalogLot } from "../../../../../../../../server/catalog";
import { handle } from "../../../../../../../../server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string;lotId:string}>};
export async function GET(request:Request,context:Context){const {id,lotId}=await context.params;return handle(()=>getTradeCatalogLot(request,id,lotId));}
