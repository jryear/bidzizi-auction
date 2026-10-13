import { simpleGet, simplePost } from "../../../../server/v1/simple";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, { params }: Context) { return simpleGet(request, (await params).code.toUpperCase()); }
export async function POST(request: Request, { params }: Context) { return simplePost(request, (await params).code.toUpperCase()); }
