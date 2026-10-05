import EventAccess from "./event-access";
export const dynamic = "force-dynamic";
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EventAccess eventId={id} />; }
