import { timingSafeEqual } from "node:crypto";
import { deliverApprovalNotifications } from "@/features/production/approval-notifications";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return new Response(null, { status: 401 });
  return Response.json({ checked: await deliverApprovalNotifications() });
}
