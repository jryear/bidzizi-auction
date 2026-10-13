import Stage from "./stage";

export const dynamic = "force-dynamic";

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Stage eventId={id} />;
}
