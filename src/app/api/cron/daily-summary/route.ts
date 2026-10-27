import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sendDailySummary } from "@/server/services/owner";

/**
 * The owner's evening summary email, called once a day by the scheduler (vercel.json "crons", 8:30 pm
 * IST). Vercel sends `Authorization: Bearer <CRON_SECRET>`; without CRON_SECRET set, nothing runs.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHENTICATED", message: "Not allowed" } }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, data: await sendDailySummary() });
  } catch (err) {
    console.error("Daily summary failed:", err);
    return NextResponse.json({ ok: false, error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Failed" } }, { status: 500 });
  }
}
