import { NextResponse } from "next/server";
import { InvestmentInputSchema } from "@/features/system-dashboard/metrics";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";
import { apiError } from "@/lib/supabase/organization-admin";
async function write(request: Request, remove: boolean) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  if (auth.role !== "super_admin")
    return NextResponse.json(
      { error: "Somente superadministradores podem editar investimentos." },
      { status: 403 },
    );
  const schema = remove
    ? InvestmentInputSchema.pick({ clientId: true, day: true })
    : InvestmentInputSchema;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Investimento inválido." },
      { status: 400 },
    );
  const value = parsed.data;
  const result = remove
    ? await auth.supabase.rpc("atendhub_remove_daily_investment", {
        _org: auth.organizationId,
        _client: value.clientId,
        _day: value.day,
      })
    : await auth.supabase.rpc("atendhub_save_daily_investment", {
        _org: auth.organizationId,
        _client: value.clientId,
        _day: value.day,
        _amount: "amountCents" in value ? value.amountCents : null,
        _notes: "notes" in value ? value.notes : "",
      });
  if (result.error) {
    if (["PGRST202", "42P01", "42883"].includes(result.error.code))
      return NextResponse.json(
        {
          error:
            "A persistência de investimentos precisa ser ativada no banco antes de salvar.",
        },
        { status: 503 },
      );
    if (result.error.code === "42501")
      return NextResponse.json(
        { error: "Você não tem permissão para editar este cliente." },
        { status: 403 },
      );
    return apiError(result.error, 500, { stage: "dashboard-investment" });
  }
  return NextResponse.json({ ok: true });
}
export const POST = (request: Request) => write(request, false);
export const DELETE = (request: Request) => write(request, true);
