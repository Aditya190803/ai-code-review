import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { incrementInstallCount } from "@/lib/install-counter";

export const runtime = "nodejs";

export async function GET() {
  const script = await readFile(join(process.cwd(), "public", "install.sh"), "utf8");

  let count: number | null = null;

  try {
    count = await incrementInstallCount();
  } catch (error) {
    console.warn("[install.sh] failed to update install count", error);
  }

  if (count !== null) {
    console.log(`[install.sh] request count: ${count}`);
  }

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      ...(count !== null ? { "X-Install-Count": String(count) } : {}),
    },
  });
}