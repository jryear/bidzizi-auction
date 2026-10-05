import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event studio · BidZizi staging",
  description: "Staging event and lot editing for authorized test staff.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <iframe
      title="BidZizi admin workspace"
      src="/staging-admin/index.html"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", border: 0, background: "#f5f0e6" }}
    />
  );
}
