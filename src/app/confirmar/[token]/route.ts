import { after } from "next/server";
import { deliverAppointmentResponse } from "@/features/appointments/response-webhook";
import { tenantSlug } from "@/features/client-domains/model";
import { tenantAtHost } from "@/features/client-domains/server";
import { z } from "zod";
import { integrationAdmin } from "@/features/whatsapp/server";

type Context = { params: Promise<{ token: string }> };
const messages = {
  confirmed: "Presença confirmada. Até a consulta!",
  declined:
    "Registramos que você não vai comparecer. Fale com a clínica se precisar remarcar.",
  expired: "O prazo para responder terminou. Fale com a clínica pelo WhatsApp.",
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

function page(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Confirmar consulta</title><style>
    body{margin:0;padding:24px;background:#f5f4fa;color:#211c33;font:16px/1.55 system-ui,sans-serif}
    main{max-width:450px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #dedbe8;border-radius:16px}
    h1{font-size:1.55rem;margin:0 0 12px}form{display:grid;gap:10px;margin-top:24px}
    button{font:inherit;font-weight:600;padding:12px;border:1px solid #5142ad;background:#5142ad;color:white;border-radius:8px;cursor:pointer}
    button[value=decline]{background:white;color:#5142ad}button:focus-visible{outline:3px solid #211c33;outline-offset:3px}
    </style><main>${content}</main></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

function expandToken(value: string) {
  if (z.string().uuid().safeParse(value).success) return value;
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 16 || bytes.toString("base64url") !== value) return null;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function render(
  request: Request,
  context: Context,
  decision: string | null = null,
) {
  const { token: pathToken } = await context.params;
  const token = expandToken(pathToken);
  if (!token)
    return page(
      "<h1>Link indisponível</h1><p>Peça um novo link à clínica.</p>",
      404,
    );
  try {
    const host = request.headers.get("host");
    const clientId = tenantSlug(host) ? await tenantAtHost(host) : undefined;
    if (clientId === null) return page("<h1>Link indisponível</h1>", 404);
    const { data, error } = await integrationAdmin().rpc(
      "atendhub_confirmation_public",
      {
        p_token: token,
        p_decision: decision,
        ...(clientId ? { p_client: clientId } : {}),
      },
    );
    if (error) throw error;
    if (!data)
      return page(
        "<h1>Link indisponível</h1><p>Peça um novo link à clínica.</p>",
        404,
      );
    if (decision && typeof data.eventId === "string") {
      const eventId = data.eventId;
      after(() => deliverAppointmentResponse(eventId));
    }
    const heading = `<h1>Confirmar consulta</h1><p>${escape(data.clinic ?? "Clínica")} · <strong>${escape(data.when)}</strong></p>`;
    if (data.state !== "pending")
      return page(
        heading + `<p>${messages[data.state as keyof typeof messages]}</p>`,
      );
    return page(
      heading +
        `<p>Responda até ${escape(data.deadline)}.</p>
      <form method="post"><button name="decision" value="confirm">Confirmar presença</button>
      <button name="decision" value="decline">Pedir reagendamento</button></form>`,
    );
  } catch {
    return page(
      "<h1>Confirmação temporariamente indisponível</h1><p>Tente novamente ou fale com a clínica pelo WhatsApp.</p>",
      503,
    );
  }
}

export async function GET(request: Request, context: Context) {
  return render(request, context);
}

export async function POST(request: Request, context: Context) {
  const form = await request.formData().catch(() => null);
  const decision = form?.get("decision");
  if (decision !== "confirm" && decision !== "decline")
    return page("<h1>Resposta inválida</h1>", 400);
  return render(request, context, decision);
}
