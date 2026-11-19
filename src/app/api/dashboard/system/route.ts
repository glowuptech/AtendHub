import { NextResponse } from "next/server";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { apiError } from "@/lib/supabase/organization-admin";
import { DashboardFilterSchema } from "@/features/system-dashboard/metrics";
import { loadDashboard } from "@/features/system-dashboard/server";
export async function GET(request: Request) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const parsed = DashboardFilterSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await loadDashboard(
        auth.supabase,
        auth.organizationId,
        auth.role,
        parsed.data,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CLIENT_FORBIDDEN")
      return NextResponse.json(
        { error: "Cliente não autorizado." },
        { status: 403 },
      );
    return apiError(error, 500, { stage: "system-dashboard" });
  }
}
