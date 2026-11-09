// Isolated browser harness: actual editor and wizard, simulated persistence only.
import { createRoot } from "react-dom/client";
import { EditorWorkspace } from "@/features/forms/components/editor";
import { clients } from "@/lib/mocks/fixtures";
import "@/app/globals.css";
const stored = localStorage.getItem("editor-test-draft");
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input).startsWith("/api/forms") && init?.body) {
    const body = JSON.parse(String(init.body));
    localStorage.setItem("editor-test-draft", JSON.stringify(body.form));
    return Response.json(body.form);
  }
  return original(input, init);
};
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 24 }}>
    <EditorWorkspace
      client={clients[0]}
      source={stored ? JSON.parse(stored) : undefined}
    />
  </main>,
);
