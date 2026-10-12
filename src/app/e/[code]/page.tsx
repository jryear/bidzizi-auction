import Participant from "./participant";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Participant code={code.toUpperCase()} />;
}
