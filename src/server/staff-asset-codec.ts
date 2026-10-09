import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "./http";

const invalid = () => new ApiError(415, "ASSET_INVALID", "Choose one JPEG, PNG or WebP image.");
const tooLarge = () => new ApiError(413, "ASSET_TOO_LARGE", "This image exceeds the upload limits.");
let decoding = false;
export type NormalizedAsset = { sourceMime: string; sourceSize: number; sourceSha256: string; bytes: Buffer; width: number; height: number };

async function readBounded(request: Request): Promise<Buffer> {
  if (!request.body) throw invalid();
  const reader = request.body.getReader(), pieces: Uint8Array[] = [];
  let total = 0, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError(408, "UPLOAD_TIMEOUT", "The upload timed out.")), 10_000);
    });
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      total += value.byteLength;
      if (total > 2_097_152) throw tooLarge();
      pieces.push(value);
    }
    if (!total) throw invalid();
    return Buffer.concat(pieces.map(p => Buffer.from(p)), total);
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* An outstanding read is being cancelled. */ }
  }
}

function envelope(bytes: Buffer, type: string) {
  if (type === "image/png") {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw invalid();
    let offset = 8, done = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), name = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + size + 12 > bytes.length) throw invalid();
      if (name === "acTL") throw invalid();
      offset += size + 12;
      if (name === "IEND") { done = true; break; }
    }
    if (!done || offset !== bytes.length) throw invalid();
  } else if (type === "image/webp") {
    if (bytes.length < 20 || bytes.toString("ascii",0,4) !== "RIFF" ||
      bytes.toString("ascii",8,12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length-8) throw invalid();
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = bytes.readUInt32LE(offset+4), name = bytes.toString("ascii",offset,offset+4);
      if (name === "ANIM" || name === "ANMF") throw invalid();
      offset += 8 + size + (size & 1);
    }
    if (offset !== bytes.length) throw invalid();
  } else if (type === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 ||
      bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) throw invalid();
  } else throw invalid();
}

export async function normalizeAsset(request: Request): Promise<NormalizedAsset> {
  const sourceMime = request.headers.get("content-type") ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(sourceMime)) throw invalid();
  const original = await readBounded(request);
  envelope(original, sourceMime);
  if (decoding) throw new ApiError(503, "ASSET_BUSY", "The image decoder is busy. Try again.");
  decoding = true;
  try {
    const input = sharp(original, { failOn: "warning", limitInputPixels: false, animated: false });
    const meta = await input.metadata();
    const expected = meta.format === "jpeg" ? "image/jpeg" : meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : null;
    if (expected !== sourceMime || !meta.width || !meta.height || (meta.pages ?? 1) !== 1 ||
      meta.width < 1 || meta.height < 1) throw invalid();
    if (meta.width > 4096 || meta.height > 4096 || meta.width * meta.height > 8_000_000) throw tooLarge();
    const bytes = await sharp(original, { failOn: "warning", limitInputPixels: 8_000_000, animated: false })
      .rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:true})
      .toColourspace("srgb").webp({quality:85,alphaQuality:100,effort:4}).timeout({seconds:5}).toBuffer();
    if (bytes.length > 1_048_576) throw tooLarge();
    const output = await sharp(bytes,{failOn:"warning"}).metadata();
    if (output.format !== "webp" || !output.width || !output.height || output.width > 1600 ||
      output.height > 1600 || (output.pages ?? 1) !== 1) throw invalid();
    envelope(bytes,"image/webp");
    return { sourceMime, sourceSize: original.length, sourceSha256: createHash("sha256").update(original).digest("hex"),
      bytes, width: output.width, height: output.height };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid();
  } finally { decoding = false; }
}
