import Participant from "./participant";
import { earlyScript } from "./early";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const upper = code.toUpperCase();
  return <><script dangerouslySetInnerHTML={{ __html: earlyScript(upper) }} /><Participant code={upper} /><noscript><p><a href={`/e/${upper}/simple`}>Continue in simple mode</a></p></noscript><footer className="simple-support"><a href={`/e/${upper}/simple`}>Having trouble? Simple mode</a></footer></>;
}
