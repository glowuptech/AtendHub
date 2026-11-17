import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/supabase/organization-admin";
import { sessionOrganizationContext } from "@/lib/supabase/organization-session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  const auth = await sessionOrganizationContext();
  if ("error" in auth) return auth.error;
  const { leadId } = await context.params;
  if (!z.string().uuid().safeParse(leadId).success)
    return NextResponse.json({ error: "Lead inválido." }, { status: 400 });
  // RPC uses the authenticated session (auth.uid), not a browser-supplied owner.
  const { data, error } = await auth.supabase.rpc("atendhub_claim_lead", {
    _organization_id: auth.organizationId,
    _lead_id: leadId,
  });
  if (error) {
    if (error.message.includes("LEAD_ALREADY_CLAIMED"))
      return NextResponse.json(
        { error: "Este atendimento já foi assumido. A fila será atualizada." },
        { status: 409 },
      );
    if (error.code === "42501" || error.message.includes("FORBIDDEN"))
      return NextResponse.json(
        {
          error:
            "Sua conta não tem permissão para assumir este atendimento. Solicite ao administrador a revisão do acesso ao cliente e da permissão de assumir leads.",
        },
        { status: 403 },
      );
    return apiError(error, 500, { stage: "claim-lead" });
  }
  if (data == null || data === false)
    return NextResponse.json(
      {
        error:
          "O servidor não confirmou a assunção. Atualize a fila e tente novamente.",
      },
      { status: 409 },
    );
  return NextResponse.json(data);
}
