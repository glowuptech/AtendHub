export type Vertical = "healthcare" | "legal";
export const prescritaTheme = {
  primary: "var(--brand-primary)",
  surface: "var(--surface)",
  sage: "var(--accent-sage)",
  rose: "var(--accent-rose)",
  text: "var(--text-primary)",
  taupe: "var(--taupe)",
} as const;
export const verticalThemes: Record<Vertical, typeof prescritaTheme | null> = {
  healthcare: prescritaTheme,
  legal: null,
};
export const clinicThemes = ["prescrita", "sage"] as const;

/** Shared workspace colors are independent of each vertical's identity. */
export const workspaceTheme = {
  background: "var(--surface)",
  muted: "var(--surface-muted)",
  text: "var(--text-primary)",
  border: "var(--border-subtle)",
  chart: [
    "var(--chart-blue)",
    "var(--chart-teal)",
    "var(--chart-amber)",
    "var(--chart-purple)",
    "var(--chart-coral)",
  ],
} as const;
