import { Heading, Card, Badge } from "@/components/layout/shared";
import { CalendarDays } from "lucide-react";
export default function Page() {
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Calendário"
        description="Agendamentos de todos os clientes, em um só lugar."
      />
      <Card>
        <div className="settings-placeholder">
          <CalendarDays size={28} />
          <Badge>Em breve</Badge>
          <h2>Visão semanal dos agendamentos</h2>
          <p className="muted">
            A visão semanal reunirá os agendamentos da Prescrita e da Veredite,
            com quantidades por dia, confirmações e pendências de reagendamento.
          </p>
        </div>
      </Card>
    </>
  );
}
