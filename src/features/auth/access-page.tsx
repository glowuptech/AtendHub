"use client";

import { useState } from "react";
import { Layers2, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function authErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number };
  if (code === "email_not_confirmed") return "Confirme seu e-mail antes de entrar.";
  if (code === "over_request_rate_limit" || status === 429)
    return "Muitas tentativas. Aguarde um momento e tente novamente.";
  if (code === "invalid_credentials") return "E-mail ou senha inválidos.";
  return "Não foi possível concluir o acesso. Tente novamente.";
}

export function AccessPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <main className="access-page">
      <section className="access-story">
        <div className="access-brand">
          <Layers2 size={27} />
          <span>Atend<span>&</span>Hub</span>
        </div>
        <div>
          <span className="eyebrow">ACESSO DA EQUIPE</span>
          <h1>Mais clareza para cuidar de cada conversa.</h1>
          <p>Clientes, equipe e operação conectados em um só lugar.</p>
          <ul><li><ShieldCheck size={20} />Acesso autorizado pelo administrador</li></ul>
        </div>
        <small>Prescrita · Veredite</small>
      </section>
      <section className="access-form-panel" aria-label="Login">
        <div className="access-form-card">
          <p className="eyebrow">BEM-VINDO AO ATEND&HUB</p>
          <h2>Entre na sua conta</h2>
          <p className="muted">Acesse seu espaço de atendimento.</p>
          <form noValidate onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            const data = new FormData(event.currentTarget);
            const emailResult = z.string().trim().email("Informe um e-mail válido.").safeParse(data.get("email"));
            const password = String(data.get("password") ?? "");
            if (!emailResult.success) { setError(emailResult.error.issues[0].message); return; }
            if (!password) { setError("Informe sua senha."); return; }
            setPending(true);
            try {
              const { error: signInError } = await createClient().auth.signInWithPassword({ email: emailResult.data, password });
              if (signInError) throw signInError;
              router.replace("/app");
              router.refresh();
            } catch (authError) {
              setError(authErrorMessage(authError));
            } finally {
              setPending(false);
            }
          }}>
            <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
            <label htmlFor="access-password">Senha</label>
            <div className="access-password">
              <input id="access-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required />
              <Button variant="ghost" type="button" size="icon" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
            {error && <p role="alert" className="field-error">{error}</p>}
            <Button type="submit" disabled={pending}>{pending ? "Entrando…" : <>Entrar <ArrowRight size={16} /></>}</Button>
          </form>
          <p className="access-switch">Precisa de acesso? Solicite seu cadastro ao superadministrador.</p>
          <p className="access-stage">O acesso é protegido pelo Supabase Auth.</p>
        </div>
      </section>
    </main>
  );
}
