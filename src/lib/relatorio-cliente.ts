import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase, type NotaFiscal } from "@/lib/supabase";
import type { Cliente } from "@/lib/clientes";
import type { Obrigacao } from "@/lib/obrigacoes";
import { TIPO_OBRIGACAO_META, STATUS_OBRIGACAO_META } from "@/lib/obrigacoes";
import type { Comunicacao } from "@/lib/comunicacoes";
import { TIPO_META, STATUS_LABEL } from "@/lib/nf";
import {
  LIMITE_MEI_PADRAO,
  MESES_CURTOS,
  MESES_LONGOS,
  faixaMei,
  moeda,
  pctDoLimite,
  formatarPct,
  type MeiFaturamento,
  type MeiMes,
} from "@/lib/mei";

/* ---------------- Marca do escritório (tabela de uma linha) ---------------- */

export type Escritorio = { id: string; nome: string; contato: string; cor_marca: string };

/** Cores oferecidas na tela (todas passam de 4,5:1 sobre branco). */
export const CORES_MARCA = ["#2563EB", "#0F766E", "#7C3AED", "#B45309", "#18181B"] as const;

export function useEscritorio() {
  return useQuery({
    queryKey: ["configuracoes-escritorio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes_escritorio")
        .select("id, nome, contato, cor_marca")
        .maybeSingle();
      if (error) throw error;
      return data as Escritorio | null;
    },
  });
}

export async function salvarEscritorio(id: string, dados: Omit<Escritorio, "id">) {
  return supabase
    .from("configuracoes_escritorio")
    .update({ nome: dados.nome.trim(), contato: dados.contato.trim(), cor_marca: dados.cor_marca })
    .eq("id", id)
    .select("id");
}

/* ---------------- Seções ---------------- */

export const SECOES = [
  ["resumo", "Resumo do mês"],
  ["grafico", "Evolução de 6 meses"],
  ["limite", "Limite / acumulado no ano"],
  ["atencao", "Notas que pedem atenção"],
  ["obrig", "Obrigações do mês"],
  ["pend", "Pendências com o escritório"],
  ["obs", "Recado do contador"],
] as const;
export type Secao = (typeof SECOES)[number][0];
export type Secoes = Record<Secao, boolean>;
export const SECOES_PADRAO: Secoes = Object.fromEntries(SECOES.map(([k]) => [k, true])) as Secoes;

/* ---------------- Dados ---------------- */

export type DadosRelatorio = {
  cliente: Cliente;
  ano: number;
  mes: number; // 1–12
  rotuloMes: string; // "Outubro de 2026"
  parcial: boolean;
  mei: boolean;
  /** MEI: faturamento lançado no mês (R$). Outros: null (valor de nota não é guardado). */
  faturamentoMes: number | null;
  faturamentoMesAnterior: number | null;
  autorizadas: number;
  autorizadasMesAnterior: number;
  comProblema: NotaFiscal[];
  /** Série dos últimos 6 meses: R$ para MEI, nº de notas autorizadas para os demais. */
  serie: { rotulo: string; valor: number }[];
  serieEmReais: boolean;
  /** MEI: acumulado até o mês; demais: nº de notas autorizadas no ano até o mês. */
  acumulado: number;
  limite: number;
  obrigacoes: Obrigacao[];
  pendencias: Comunicacao[];
};

/** Primeiro dia do intervalo que cobre o ano e os 6 meses anteriores ao mês escolhido. */
export function inicioDaBusca(ano: number, mes: number) {
  const seisAtras = new Date(ano, mes - 6, 1);
  const janeiro = new Date(ano, 0, 1);
  return format(seisAtras < janeiro ? seisAtras : janeiro, "yyyy-MM-dd");
}

export function montarRelatorio({
  cliente,
  ano,
  mes,
  hoje,
  notas,
  meiCabecalho,
  meiMeses,
  meiMesesAnoAnterior,
  obrigacoes,
  comunicacoes,
}: {
  cliente: Cliente;
  ano: number;
  mes: number;
  hoje: Date;
  notas: NotaFiscal[];
  meiCabecalho: MeiFaturamento | undefined;
  meiMeses: MeiMes[];
  meiMesesAnoAnterior: MeiMes[];
  obrigacoes: Obrigacao[];
  comunicacoes: Comunicacao[];
}): DadosRelatorio {
  const mei = !!meiCabecalho;
  const chave = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
  const noMes = (n: NotaFiscal, a: number, m: number) => n.data_emissao.startsWith(chave(a, m));
  const anterior = mes === 1 ? { a: ano - 1, m: 12 } : { a: ano, m: mes - 1 };

  const doMes = notas.filter((n) => noMes(n, ano, mes));
  const autorizadas = doMes.filter((n) => n.status === "autorizada").length;
  const autorizadasMesAnterior = notas.filter(
    (n) => noMes(n, anterior.a, anterior.m) && n.status === "autorizada",
  ).length;

  const valorMei = (a: number, m: number) =>
    [...meiMeses, ...meiMesesAnoAnterior]
      .filter((x) => x.ano === a && x.mes === m)
      .reduce((s, x) => s + x.faturamento, 0);

  const serie = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ano, mes - 6 + i, 1);
    const a = d.getFullYear();
    const m = d.getMonth() + 1;
    return {
      rotulo: MESES_CURTOS[m - 1]!,
      valor: mei
        ? valorMei(a, m)
        : notas.filter((n) => noMes(n, a, m) && n.status === "autorizada").length,
    };
  });

  const acumulado = mei
    ? (meiCabecalho?.faturamento_sem_mes ?? 0) +
      meiMeses.filter((x) => x.ano === ano && x.mes <= mes).reduce((s, x) => s + x.faturamento, 0)
    : notas.filter(
        (n) =>
          n.status === "autorizada" &&
          n.data_emissao.startsWith(String(ano)) &&
          Number(n.data_emissao.slice(5, 7)) <= mes,
      ).length;

  return {
    cliente,
    ano,
    mes,
    rotuloMes: `${MESES_LONGOS[mes - 1]} de ${ano}`,
    parcial: ano === hoje.getFullYear() && mes === hoje.getMonth() + 1,
    mei,
    faturamentoMes: mei ? valorMei(ano, mes) : null,
    faturamentoMesAnterior: mei ? valorMei(anterior.a, anterior.m) : null,
    autorizadas,
    autorizadasMesAnterior,
    comProblema: doMes.filter((n) => n.status !== "autorizada"),
    serie,
    serieEmReais: mei,
    acumulado,
    limite: meiCabecalho?.limite_anual || LIMITE_MEI_PADRAO,
    obrigacoes: obrigacoes.filter((o) => o.competencia.startsWith(chave(ano, mes))),
    pendencias: comunicacoes.filter((c) => c.status === "aberta"),
  };
}

/** Variação percentual; null quando não há base de comparação. */
export function variacao(atual: number, anterior: number) {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}

export function textoLimiteMei(d: DadosRelatorio) {
  const pct = pctDoLimite(d.acumulado, d.limite);
  const faixa = faixaMei(pct);
  const restam = d.limite - d.acumulado;
  if (faixa.key === "regular") return `Dentro do limite. Restam ${moeda(restam)} até dezembro.`;
  if (faixa.key === "atencao")
    return `Atenção: acima de 80% do limite. Restam ${moeda(restam)} até dezembro. Fale com a gente antes de emitir notas grandes.`;
  return `Limite ultrapassado em ${moeda(-restam)}. Precisamos conversar sobre o desenquadramento.`;
}

/* ---------------- Mensagem para o cliente ---------------- */

export function mensagemCliente(d: DadosRelatorio, escritorio: string) {
  const n = d.autorizadas;
  let t = `Olá! Segue o relatório fiscal de ${d.rotuloMes.toLowerCase()} da ${d.cliente.nome}.\n\n`;
  t += `Resumo: ${n} nota${n === 1 ? "" : "s"} autorizada${n === 1 ? "" : "s"}`;
  if (d.mei && d.faturamentoMes !== null) t += `, faturamento de ${moeda(d.faturamentoMes)}`;
  t += ".";
  if (d.mei)
    t += `\nLimite do MEI: ${formatarPct(pctDoLimite(d.acumulado, d.limite), 1)} usado no ano.`;
  if (d.pendencias.length)
    t += `\n\nPrecisamos de você:\n${d.pendencias.map((p) => `• ${p.titulo}`).join("\n")}`;
  return `${t}\n\nO PDF segue em anexo. Qualquer dúvida, estamos à disposição.\n${escritorio}`;
}

/* ---------------- PDF ---------------- */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const hexParaRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const TEXTO: [number, number, number] = [24, 24, 27];
const CINZA: [number, number, number] = [95, 95, 104];
const LINHA: [number, number, number] = [226, 223, 216];
const COR_STATUS: Record<"success" | "warning" | "danger", [number, number, number]> = {
  success: [20, 108, 51],
  warning: [180, 83, 9],
  danger: [185, 28, 28],
};

export function iniciais(nome: string) {
  const partes = nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2);
  return partes.map((p) => p[0]!.toUpperCase()).join("") || "E";
}

export function rotuloTipoCliente(d: DadosRelatorio) {
  return d.mei ? "MEI" : (TIPO_META[d.cliente.tipo_emissao]?.label ?? "Cliente");
}

export function gerarRelatorioClientePdf({
  dados: d,
  escritorio,
  secoes,
  recado,
}: {
  dados: DadosRelatorio;
  escritorio: Omit<Escritorio, "id">;
  secoes: Secoes;
  recado: string;
}) {
  const doc = new jsPDF();
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const cor = hexParaRgb(escritorio.cor_marca);
  const finalY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = 14;

  // Cabeçalho
  doc.setFillColor(...cor);
  doc.roundedRect(14, y, 13, 13, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(semAcento(iniciais(escritorio.nome)), 20.5, y + 8.6, { align: "center" });
  doc.setTextColor(...TEXTO);
  doc.setFontSize(12);
  doc.text(semAcento(escritorio.nome), 31, y + 5.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text(
    semAcento(`Relatorio fiscal · ${d.rotuloMes}${d.parcial ? " (parcial)" : ""}`),
    31,
    y + 11,
  );
  y += 18;
  doc.setDrawColor(...cor);
  doc.setLineWidth(0.7);
  doc.line(14, y, largura - 14, y);

  // Cliente
  y += 11;
  doc.setTextColor(...TEXTO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(semAcento(d.cliente.nome), 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text(semAcento(rotuloTipoCliente(d)), 14, y + 5.5);
  doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy")}`, largura - 14, y + 5.5, {
    align: "right",
  });
  y += 12;

  const titulo = (t: string) => {
    if (y > altura - 40) {
      doc.addPage();
      y = 20;
    }
    y += 6;
    doc.setTextColor(...cor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(semAcento(t.toUpperCase()), 14, y);
    y += 3;
  };
  const paragrafo = (t: string, rgb: readonly [number, number, number] = CINZA) => {
    doc.setTextColor(...rgb);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const linhas = doc.splitTextToSize(semAcento(t), largura - 28);
    doc.text(linhas, 14, y + 4);
    y += 4 + linhas.length * 4.5;
  };
  const tabela = (head: string[], body: string[][], extra: object = {}) => {
    autoTable(doc, {
      startY: y + 1,
      head: [head.map(semAcento)],
      body: body.map((l) => l.map(semAcento)),
      theme: "plain",
      headStyles: { textColor: CINZA, fontStyle: "normal", fontSize: 8 },
      bodyStyles: { fontSize: 9, textColor: TEXTO },
      styles: { lineColor: LINHA, lineWidth: { bottom: 0.2 } },
      margin: { left: 14, right: 14 },
      ...extra,
    });
    y = finalY() + 2;
  };

  if (secoes.resumo) {
    titulo("Resumo do mes");
    const varNotas = variacao(d.autorizadas, d.autorizadasMesAnterior);
    const celulas: [string, string, string][] = [];
    if (d.mei && d.faturamentoMes !== null) {
      const v = variacao(d.faturamentoMes, d.faturamentoMesAnterior ?? 0);
      celulas.push([
        "Faturamento lancado",
        moeda(d.faturamentoMes),
        v === null
          ? "sem mes anterior"
          : `${v >= 0 ? "+" : "-"}${formatarPct(Math.abs(v), 1)} vs mes anterior`,
      ]);
    }
    celulas.push([
      "Notas autorizadas",
      String(d.autorizadas),
      varNotas === null
        ? "sem mes anterior"
        : `${varNotas >= 0 ? "+" : "-"}${formatarPct(Math.abs(varNotas), 0)} vs mes anterior`,
    ]);
    celulas.push([
      "Canceladas / denegadas",
      String(d.comProblema.length),
      d.comProblema.length ? "veja abaixo" : "nenhuma com problema",
    ]);
    autoTable(doc, {
      startY: y + 1,
      head: [celulas.map((c) => semAcento(c[0]))],
      body: [celulas.map((c) => c[1]), celulas.map((c) => semAcento(c[2]))],
      theme: "grid",
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: CINZA,
        fontStyle: "normal",
        fontSize: 8,
      },
      bodyStyles: { textColor: TEXTO, fontSize: 9 },
      didParseCell: (c) => {
        if (c.section === "body" && c.row.index === 0) {
          c.cell.styles.fontSize = 14;
          c.cell.styles.fontStyle = "bold";
        }
        if (c.section === "body" && c.row.index === 1) c.cell.styles.textColor = CINZA;
      },
      styles: { lineColor: LINHA },
      margin: { left: 14, right: 14 },
    });
    y = finalY() + 2;
  }

  if (secoes.grafico) {
    titulo(
      d.serieEmReais ? "Faturamento dos ultimos meses" : "Notas autorizadas nos ultimos meses",
    );
    const h = 34;
    const x0 = 18;
    const passo = (largura - 36) / d.serie.length;
    const barra = Math.min(16, passo * 0.55);
    const max = Math.max(1, ...d.serie.map((s) => s.valor)) * 1.15;
    const base = y + 6 + h;
    d.serie.forEach((s, i) => {
      const x = x0 + i * passo + (passo - barra) / 2;
      const alt = (s.valor / max) * h;
      const atual = i === d.serie.length - 1;
      doc.setFillColor(...(atual ? cor : ([214, 211, 205] as [number, number, number])));
      if (alt > 0) doc.roundedRect(x, base - alt, barra, alt, 1, 1, "F");
      doc.setFont("helvetica", atual ? "bold" : "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...(atual ? TEXTO : CINZA));
      if (s.valor > 0)
        doc.text(
          d.serieEmReais
            ? `${(s.valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
            : String(s.valor),
          x + barra / 2,
          base - alt - 1.5,
          { align: "center" },
        );
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...CINZA);
      doc.text(s.rotulo, x + barra / 2, base + 4.5, { align: "center" });
    });
    y = base + 7;
  }

  if (secoes.limite) {
    if (d.mei) {
      titulo("Limite anual do MEI");
      const pct = pctDoLimite(d.acumulado, d.limite);
      const faixa = faixaMei(pct);
      doc.setTextColor(...TEXTO);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(
        semAcento(`Acumulado em ${d.ano} ate ${MESES_LONGOS[d.mes - 1]!.toLowerCase()}`),
        14,
        y + 5,
      );
      doc.setFont("helvetica", "bold");
      doc.text(
        semAcento(`${moeda(d.acumulado)} de ${moeda(d.limite)} · ${formatarPct(pct, 1)}`),
        largura - 14,
        y + 5,
        { align: "right" },
      );
      y += 8;
      const w = largura - 28;
      doc.setFillColor(239, 237, 232);
      doc.roundedRect(14, y, w, 3, 1.5, 1.5, "F");
      doc.setFillColor(...COR_STATUS[faixa.tom === "neutro" ? "success" : faixa.tom]);
      doc.roundedRect(14, y, (w * Math.min(pct, 100)) / 100, 3, 1.5, 1.5, "F");
      doc.setDrawColor(...CINZA);
      doc.setLineWidth(0.4);
      doc.line(14 + w * 0.8, y - 1, 14 + w * 0.8, y + 4);
      y += 4;
      paragrafo(textoLimiteMei(d));
    } else {
      titulo("Acumulado no ano");
      paragrafo(
        `${d.acumulado} nota${d.acumulado === 1 ? "" : "s"} autorizada${d.acumulado === 1 ? "" : "s"} de janeiro a ${MESES_LONGOS[d.mes - 1]!.toLowerCase()} de ${d.ano}.`,
        TEXTO,
      );
    }
  }

  if (secoes.atencao) {
    titulo("Notas que pedem atencao");
    if (d.comProblema.length)
      tabela(
        ["No", "Data", "Situacao"],
        d.comProblema.map((n) => [
          n.numero_nf,
          format(parseISO(n.data_emissao), "dd/MM/yyyy"),
          `${STATUS_LABEL[n.status]}${n.status === "denegada" ? " · numero nao pode ser reutilizado" : " · nao entra no faturamento"}`,
        ]),
        { columnStyles: { 0: { font: "courier" } } },
      );
    else paragrafo("Todas as notas do mes foram autorizadas.", COR_STATUS.success);
  }

  if (secoes.obrig) {
    titulo("Obrigacoes do mes");
    if (d.obrigacoes.length)
      tabela(
        ["Obrigacao", "Competencia", "Vencimento", "Situacao"],
        d.obrigacoes.map((o) => [
          TIPO_OBRIGACAO_META[o.tipo]?.label ?? o.tipo,
          format(parseISO(o.competencia), "MM/yyyy"),
          format(parseISO(o.vencimento), "dd/MM/yyyy"),
          STATUS_OBRIGACAO_META[o.status]?.label ?? o.status,
        ]),
      );
    else paragrafo("Nenhuma obrigacao registrada nesta competencia.");
  }

  if (secoes.pend) {
    titulo("O que precisamos de voce");
    if (d.pendencias.length)
      paragrafo(
        d.pendencias
          .map((p) => `• ${p.titulo}${p.descricao ? ` — ${p.descricao}` : ""}`)
          .join("\n"),
        TEXTO,
      );
    else paragrafo("Nenhuma pendencia. Obrigado!", COR_STATUS.success);
  }

  if (secoes.obs && recado.trim()) {
    titulo("Recado do contador");
    paragrafo(recado.trim(), TEXTO);
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.2);
    doc.line(14, altura - 14, largura - 14, altura - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text(
      semAcento([escritorio.nome, escritorio.contato].filter(Boolean).join(" · ")),
      14,
      altura - 9,
    );
    doc.text(semAcento(`Gerado pelo Ofis · pagina ${i} de ${paginas}`), largura - 14, altura - 9, {
      align: "right",
    });
  }

  const arquivo = semAcento(d.cliente.nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  doc.save(`relatorio-${arquivo}-${d.ano}-${String(d.mes).padStart(2, "0")}.pdf`);
}
