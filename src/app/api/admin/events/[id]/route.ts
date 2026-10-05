import { getEvent, saveEvent } from "../../../../../server/staff";
import { handle } from "../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(async () => getEvent(request,(await context.params).id)); }
export async function PUT(request: Request, context: Context) { return handle(async () => saveEvent(request,(await context.params).id)); }
