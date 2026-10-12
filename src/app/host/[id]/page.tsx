import Workspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function HostEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workspace eventId={id} />;
}
