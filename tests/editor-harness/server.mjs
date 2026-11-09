import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: "@/components/layout/demo-context",
        replacement: root + "tests/editor-harness/context.ts",
      },
      {
        find: "next/link",
        replacement: root + "tests/editor-harness/link.tsx",
      },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
await server.listen();
