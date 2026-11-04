import { Heading, Card, Badge, NavButton } from "@/components/layout/shared";
import { Megaphone } from "lucide-react";
export default function Page() {
  return (
    <>
      <Heading
        eyebrow="SISTEMA"
        title="Tráfego Pago"
        description="Campanhas e aquisição de leads de todas as operações."
      />
      <Card>
        <div className="settings-placeholder">
          <Megaphone size={28} />
          <Badge>Em breve</Badge>
          <h2>Gestão de campanhas</h2>
          <p className="muted">
            Esta área receberá o gerenciamento de campanhas. Os investimentos já
            podem ser acompanhados no dashboard geral.
          </p>
          <NavButton href="/app/sistema">
            Ver investimentos no dashboard
          </NavButton>
        </div>
      </Card>
    </>
  );
}
