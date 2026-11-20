import { tenantSlug } from "@/features/client-domains/model";
export function GET(request: Request) {
  const host = request.headers.get("host")?.toLowerCase();
  if (!host || !tenantSlug(host)) return new Response(null, { status: 404 });
  return Response.json(
    { host },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  );
}
