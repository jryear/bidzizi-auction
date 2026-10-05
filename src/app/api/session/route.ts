import { getSession } from "../../../server/auth";
import { handle } from "../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => getSession(request)); }
