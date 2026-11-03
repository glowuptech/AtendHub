import Link from "next/link";
export default function Login() {
  return (
    <main className="empty">
      <h1>Prescrita</h1>
      <p>Acesse seu espaço de trabalho</p>
      <Link href="/app">Entrar nesta sessão</Link>
    </main>
  );
}
