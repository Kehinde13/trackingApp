import { NextResponse } from "next/server";

import { consumePublicRateLimit, resolveRateLimitIdentity } from "@/lib/public-rate-limit";
import { getPublicShipment } from "@/lib/public-shipments";
import { isValidPublicTrackingToken } from "@/lib/public-tracking";

export const runtime = "nodejs";

const SECURITY_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const notFoundResponse = () => NextResponse.json({ error: "Package not found." }, { status: 404, headers: SECURITY_HEADERS });

export async function GET(request: Request, { params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params;
  if (!isValidPublicTrackingToken(publicToken)) return notFoundResponse();
  try {
    const rateLimit = await consumePublicRateLimit(resolveRateLimitIdentity(request));
    if (!rateLimit) return NextResponse.json({ error: "Public tracking is temporarily unavailable." }, { status: 503, headers: SECURITY_HEADERS });
    if (!rateLimit.allowed) return NextResponse.json({ error: "Too many tracking requests. Please try again shortly." }, { status: 429, headers: { ...SECURITY_HEADERS, "Retry-After": String(rateLimit.retryAfter) } });
    const shipment = await getPublicShipment(publicToken);
    return shipment ? NextResponse.json(shipment, { headers: SECURITY_HEADERS }) : notFoundResponse();
  } catch {
    return NextResponse.json({ error: "Public tracking is temporarily unavailable." }, { status: 503, headers: SECURITY_HEADERS });
  }
}
