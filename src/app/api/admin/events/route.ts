import { listEvents, createEvent } from "../../../../server/staff";
import { handle } from "../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(() => listEvents(request)); }
export async function POST(request: Request) { return handle(() => createEvent(request)); }
