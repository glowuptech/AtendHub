// Isolated browser harness: real components, simulated persistence only.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorWorkspace } from "@/features/forms/components/editor";
import { makePersistedPathForm } from "./path-fixture";
import { FormsList } from "@/features/forms/components/forms-list";
import { clients } from "@/lib/mocks/fixtures";
import "@/app/globals.css";
const stored = localStorage.getItem("editor-test-draft");
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("/api/clients")) return Response.json(clients);
  if (url.startsWith("/api/forms")) {
    const current = JSON.parse(
      localStorage.getItem("editor-test-draft") ?? "null",
    );
    if (init?.method === "DELETE" || init?.method === "PATCH") {
      if (!current)
        return Response.json({ error: "Não encontrado" }, { status: 404 });
      current.status = init.method === "DELETE" ? "archived" : "draft";
      localStorage.setItem("editor-test-draft", JSON.stringify(current));
      return Response.json({ ok: true });
    }
    if (init?.body) {
      const body = JSON.parse(String(init.body));
      localStorage.setItem("editor-test-draft", JSON.stringify(body.form));
      return Response.json(body.form);
    }
    return Response.json(current ? [current] : []);
  }
  return original(input, init);
};
function EditorHarness() {
  const params = new URLSearchParams(location.search);
  const isAsyncLoad = params.has("async-source");
  const [source, setSource] = useState(() =>
    isAsyncLoad ? undefined : stored ? JSON.parse(stored) : undefined,
  );

  useEffect(() => {
    if (!isAsyncLoad) return;
    const timer = window.setTimeout(() => {
      const persisted = localStorage.getItem("editor-test-draft");
      setSource(persisted ? JSON.parse(persisted) : makePersistedPathForm());
    }, 25);
    return () => window.clearTimeout(timer);
  }, [isAsyncLoad]);

  return <EditorWorkspace client={clients[0]} source={source} />;
}

createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 24 }}>
    {new URLSearchParams(location.search).has("list") ? (
      <FormsList id={clients[0].id} />
    ) : (
      <EditorHarness />
    )}
  </main>,
);
