import Link from "next/link";
export default function Login() {
  return (
    <main className="login-page">
      <div className="login-card">
        <span className="eyebrow">SEU ESPAÇO DE TRABALHO</span>
        <h1>Atend&Hub</h1>
        <p>Acesse seu espaço de trabalho</p>
        <Link className="button button-primary" href="/app">
          Entrar nesta sessão
        </Link>
      </div>
    </main>
  );
}
