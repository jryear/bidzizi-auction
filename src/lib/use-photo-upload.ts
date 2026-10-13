"use client";
import { useEffect, useRef, useState } from "react";

/** A newer pick, removal, source change or unmount invalidates an unfinished upload. */
export function usePhotoUpload(identity: string, run: (file: File, current: () => boolean) => Promise<boolean>, tag?: string) {
  const generation = useRef(0), latest = useRef(run), file = useRef<File | null>(null);
  latest.current = run;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { generation.current++; file.current = null; setBusy(false); setError(""); return () => { generation.current++; }; }, [identity]);
  const cancel = () => { generation.current++; file.current = null; setBusy(false); setError(""); };
  useEffect(() => {
    const onCancel = (e: Event) => { if (tag && (e as CustomEvent).detail === tag) cancel(); };
    addEventListener("bz:photo-cancel", onCancel);
    return () => removeEventListener("bz:photo-cancel", onCancel);
  }, [tag]);
  async function pick(next?: File) {
    if (!next) return;
    const ticket = ++generation.current, work = latest.current;
    const current = () => ticket === generation.current;
    file.current = next; setBusy(true); setError("");
    try {
      if (!await work(next, current) && current()) throw new Error("The image wasn't saved. Try again.");
      if (current()) file.current = null;
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "The image wasn't saved. Try again."); }
    finally { if (current()) setBusy(false); }
  }
  return { busy, error, pick, cancel, retry: () => pick(file.current ?? undefined) };
}
