import { Appointments } from "@/features/appointments/components/appointments";
import { brandedPortalContext } from "@/features/client-domains/portal";

export default async function Page() {
  const context = await brandedPortalContext();
  if (!context) return <Appointments portal />;
  const { client, supabase } = context;
  const { data, error } = await supabase
    .from("atendhub_appointments")
    .select("id,starts_at,timezone,status")
    .eq("client_id", client.id)
    .eq("organization_id", client.organization_id)
    .gte("starts_at", new Date().toISOString())
    .neq("status", "cancelled")
    .order("starts_at")
    .limit(50);
  const status: Record<string, string> = {
    awaiting_confirmation: "Aguardando confirmação",
    confirmed: "Confirmado",
    rescheduling: "Em remarcação",
  };
  return (
    <section>
      <h2>Próximos agendamentos</h2>
      {error ? (
        <p role="alert">Não foi possível carregar a agenda.</p>
      ) : data?.length ? (
        <ul>
          {data.map((item) => (
            <li key={item.id}>
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: item.timezone,
              }).format(new Date(item.starts_at))}{" "}
              · {status[item.status] ?? item.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum agendamento futuro visível para a sua conta.</p>
      )}
    </section>
  );
}
