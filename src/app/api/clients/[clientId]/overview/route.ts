import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantSlug } from "@/features/client-domains/model";
import { authorizeClient, noStore } from "@/features/clients/accesses/server";
import { readClientOverview } from "@/features/clients/services/overview-server";
import { RangeSchema } from "@/lib/date-range";

const professionalSchema = z.union([
  z.literal("all"),
  z.literal("unassigned"),
  z.uuid(),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  if (tenantSlug(request.headers.get("host")))
    return NextResponse.json(
      { error: "Use o painel para consultar a operação do cliente." },
      { status: 403, headers: noStore },
    );
  const { clientId } = await params;
  const auth = await authorizeClient(clientId);
  if ("error" in auth) return auth.error;
  const query = new URL(request.url).searchParams;
  const range = RangeSchema.safeParse({
    from: query.get("from"),
    to: query.get("to"),
  });
  const professional = professionalSchema.safeParse(
    query.get("professional") ?? "all",
  );
  if (!range.success || !professional.success)
    return NextResponse.json(
      { error: range.error?.issues[0]?.message ?? "Profissional inválido." },
      { status: 400, headers: noStore },
    );
  try {
    const data = await readClientOverview(
      auth.supabase,
      auth.organizationId,
      clientId,
      {
        ...range.data,
        professional: professional.data,
      },
    );
    return NextResponse.json(data, { headers: noStore });
  } catch (error) {
    console.warn("[client-overview] query failed", {
      code: (error as { code?: string })?.code,
    });
    return NextResponse.json(
      { error: "Não foi possível carregar os indicadores deste cliente." },
      { status: 503, headers: noStore },
    );
  }
}
