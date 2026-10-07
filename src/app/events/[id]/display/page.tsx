import AuthorizedReadView from "../../../../features/staging-display-results/authorized-read-view";
export const dynamic = "force-dynamic";
export default async function DisplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuthorizedReadView key={id} eventId={id} mode="display" />;
}
