"use client";
import { useState } from "react";
import { Layers2, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
export function AccessPage() {
  const [visible, setVisible] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  return (
    <main className="access-page">
      <section className="access-story">
        <div className="access-brand">
          <Layers2 size={27} />
          <span>
            Atend<span>&</span>Hub
          </span>
        </div>
        <div>
          <span className="eyebrow">ACESSO DA EQUIPE</span>
          <h1>Mais clareza para cuidar de cada conversa.</h1>
          <p>Clientes, equipe e operação conectados em um só lugar.</p>
          <ul>
            <li>
              <ShieldCheck size={20} />
              Acesso autorizado pelo administrador
            </li>
          </ul>
        </div>
        <small>Prescrita · Veredite</small>
      </section>
      <section className="access-form-panel" aria-label="Login">
        <div className="access-form-card">
          <p className="eyebrow">BEM-VINDO AO ATEND&HUB</p>
          <h2>Entre na sua conta</h2>
          <p className="muted">Acesse seu espaço de atendimento.</p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setNotice("");
              const data = new FormData(e.currentTarget);
              try {
                z.string()
                  .trim()
                  .email("Informe um e-mail válido.")
                  .parse(data.get("email"));
                if (!String(data.get("password") ?? ""))
                  throw Error("Informe sua senha.");
                setError("");
                setNotice(
                  "O login será habilitado ao conectar a autenticação. Nenhuma credencial foi enviada.",
                );
              } catch (err) {
                setError(
                  err instanceof z.ZodError
                    ? err.issues[0].message
                    : err instanceof Error
                      ? err.message
                      : "Confira os campos.",
                );
              }
            }}
          >
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label htmlFor="access-password">Senha</label>
            <div className="access-password">
              <input
                id="access-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <Button
                variant="ghost"
                type="button"
                size="icon"
                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="access-notice">
                {notice}
              </p>
            )}
            <Button type="submit">
              Entrar
              <ArrowRight size={16} />
            </Button>
          </form>
          <p className="access-switch">
            Precisa de acesso? Solicite seu cadastro ao superadministrador.
          </p>
          <p className="access-stage">
            Autenticação em preparação. Esta tela ainda não autentica usuários.
          </p>
        </div>
      </section>
    </main>
  );
}
