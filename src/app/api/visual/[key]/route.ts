import { readBinary } from "@/lib/cache";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{16}$/.test(key)) return new Response("bad key", { status: 400 });
  const img = readBinary("images", key, "jpg");
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
}
