import Studio from "./studio";

export const dynamic = "force-dynamic";

export default async function StudioEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio eventId={id} />;
}
