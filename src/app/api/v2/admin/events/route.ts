import { createTradeEvent } from "../../../../../server/staff";
import { handle } from "../../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handle(() => createTradeEvent(request)); }
