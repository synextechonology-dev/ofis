import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ofis — Controle de Notas Fiscais" },
      {
        name: "description",
        content:
          "Sistema para o setor fiscal lançar e acompanhar notas fiscais emitidas, com dashboard de volume e status.",
      },
      { property: "og:title", content: "Ofis — Controle de Notas Fiscais" },
      {
        property: "og:description",
        content: "Lance e acompanhe as notas fiscais emitidas pelo seu setor fiscal.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
