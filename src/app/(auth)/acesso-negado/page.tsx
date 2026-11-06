"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export default function AcessoNegadoPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function sair() {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="access-page">
      <section className="access-form-panel" aria-label="Acesso não autorizado">
        <div className="access-form-card">
          <p className="eyebrow">ACESSO DA EQUIPE</p>
          <h1>Acesso não autorizado</h1>
          <p className="muted">
            Sua sessão está válida, mas este usuário não possui um vínculo ativo no Atend&Hub.
            Solicite ao superadministrador que conclua seu cadastro.
          </p>
          <Button type="button" onClick={sair} disabled={pending}>
            {pending ? "Saindo…" : "Sair"}
          </Button>
        </div>
      </section>
    </main>
  );
}
