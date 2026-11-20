import { Portal } from "@/features/appointments/components/appointments";
import { brandedPortalContext } from "@/features/client-domains/portal";

export default async function Page() {
  return (await brandedPortalContext()) ? (
    <section>
      <h2>Portal da clínica</h2>
      <p>
        <a href="/portal/agendamentos">Consultar agendamentos</a>
      </p>
    </section>
  ) : (
    <Portal />
  );
}
