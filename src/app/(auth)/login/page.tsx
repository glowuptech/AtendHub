import Link from "next/link";
export default function Login() {
  return (
    <main className="empty">
      <h1>Prescrita</h1>
      <p>Modo demonstração — sem autenticação real</p>
      <Link href="/app">Entrar na demonstração</Link>
    </main>
  );
}
