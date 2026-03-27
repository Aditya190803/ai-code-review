import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { incrementInstallCount } from "@/lib/install-counter";

export const runtime = "nodejs";

export async function GET() {
  const [count, script] = await Promise.all([
    incrementInstallCount(),
    readFile(join(process.cwd(), "public", "install.sh"), "utf8"),
  ]);

  console.log(`[install.sh] request count: ${count}`);

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Install-Count": String(count),
    },
  });
}