import PrintCards from "./print";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { id } = await params, { layout } = await searchParams;
  return <PrintCards eventId={id} layout={layout === "page" ? "page" : "card"} />;
}
