import { format, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { TIPO_META } from "@/lib/nf";
import { STATUS_LABEL } from "@/lib/nf";
import {
  formatarDocumento,
  formatarReais,
  valorDaNota,
  type LinhaRelatorioEsporadico,
} from "@/lib/esporadicos";

const AZUL: [number, number, number] = [37, 99, 235]; // #2563EB — cor de marca do Ofis
const TEXTO: [number, number, number] = [24, 24, 27];
const CINZA: [number, number, number] = [95, 95, 104];

/** As fontes padrão do jsPDF não têm todos os acentos; o restante do sistema já faz assim. */
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

export type OpcoesRelatorioEsporadicos = {
  linhas: LinhaRelatorioEsporadico[];
  /** Ex.: "Novembro de 2026" */
  periodo: string;
  para?: string;
  observacao?: string;
  escritorio?: string;
};

/** Agrupa por cliente, do maior para o menor valor. */
export function agruparPorCliente(linhas: LinhaRelatorioEsporadico[]) {
  const mapa = new Map<
    string,
    { cliente: LinhaRelatorioEsporadico; notas: LinhaRelatorioEsporadico[]; total: number }
  >();
  for (const l of linhas) {
    const g = mapa.get(l.cliente_esporadico_id) ?? { cliente: l, notas: [], total: 0 };
    g.notas.push(l);
    g.total += valorDaNota(l.valor_cobranca);
    mapa.set(l.cliente_esporadico_id, g);
  }
  return [...mapa.values()].sort(
    (a, b) => b.total - a.total || a.cliente.nome.localeCompare(b.cliente.nome),
  );
}

/** Texto pronto para WhatsApp/e-mail, com subtotal por cliente e total. */
export function mensagemFinanceiro({
  linhas,
  periodo,
  para = "Financeiro",
  observacao,
}: OpcoesRelatorioEsporadicos) {
  const grupos = agruparPorCliente(linhas);
  const total = linhas.reduce((s, l) => s + valorDaNota(l.valor_cobranca), 0);
  let t = `Olá, ${para}! Segue o relatório de clientes esporádicos (${periodo.toLowerCase()}) para cobrança.\n`;
  for (const g of grupos) {
    const doc = g.cliente.documento ?? "";
    t += `\n${g.cliente.nome} — ${doc.length === 11 ? "CPF" : "CNPJ"} ${formatarDocumento(doc)}`;
    if (g.cliente.contato) t += ` — ${g.cliente.contato}`;
    t += "\n";
    for (const n of g.notas) {
      const st = n.status !== "autorizada" ? ` (${STATUS_LABEL[n.status].toLowerCase()})` : "";
      t += `  • NF ${n.numero_nf} · ${format(parseISO(n.data_emissao), "dd/MM/yyyy")}${st} · ${formatarReais(valorDaNota(n.valor_cobranca))}\n`;
    }
    t += `  Subtotal: ${formatarReais(g.total)}\n`;
  }
  t += `\nTotal a cobrar: ${formatarReais(total)} (${linhas.length} ${linhas.length === 1 ? "emissão" : "emissões"})`;
  if (observacao?.trim()) t += `\n\nObs.: ${observacao.trim()}`;
  return `${t}\n\nO PDF segue em anexo.`;
}

/** Gera e baixa o PDF do relatório de esporádicos para o financeiro. */
export function gerarRelatorioEsporadicosPdf({
  linhas,
  periodo,
  para = "Financeiro",
  observacao,
  escritorio = "Ofis",
}: OpcoesRelatorioEsporadicos) {
  const doc = new jsPDF();
  const largura = doc.internal.pageSize.getWidth();
  const grupos = agruparPorCliente(linhas);
  const total = linhas.reduce((s, l) => s + valorDaNota(l.valor_cobranca), 0);

  // Cabeçalho
  doc.setFillColor(...AZUL);
  doc.roundedRect(14, 14, 12, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OF", 20, 21.5, { align: "center" });
  doc.setTextColor(...TEXTO);
  doc.setFontSize(12);
  doc.text(semAcento(escritorio), 30, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text(semAcento(`Clientes esporadicos · ${periodo}`), 30, 24.5);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(14, 31, largura - 14, 31);

  doc.setTextColor(...TEXTO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(semAcento(`Para: ${para}`), 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  doc.text("Notas emitidas para nao clientes, para cobranca", 14, 47.5);
  doc.text(`Emitido em ${format(new Date(), "dd/MM/yyyy")}`, largura - 14, 47.5, {
    align: "right",
  });

  // Resumo
  let y = 58;
  doc.setTextColor(...AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMO DA COBRANCA", 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [["Total a cobrar", "Emissoes", "Clientes"]],
    body: [[formatarReais(total), String(linhas.length), String(grupos.length)]],
    theme: "grid",
    headStyles: { fillColor: [239, 237, 232], textColor: CINZA, fontStyle: "normal", fontSize: 8 },
    bodyStyles: { fontSize: 13, fontStyle: "bold", textColor: TEXTO },
    styles: { lineColor: [226, 223, 216] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Notas por cliente
  doc.setTextColor(...AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("NOTAS POR CLIENTE", 14, y);
  y += 4;

  if (!grupos.length) {
    doc.setTextColor(...CINZA);
    doc.setFont("helvetica", "normal");
    doc.text("Nenhuma nota para cobrar neste filtro.", 14, y + 4);
  }

  for (const g of grupos) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    const d = g.cliente.documento ?? "";
    doc.setTextColor(...TEXTO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(semAcento(g.cliente.nome), 14, y + 4);
    doc.text(formatarReais(g.total), largura - 14, y + 4, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA);
    doc.text(
      semAcento(
        `${d.length === 11 ? "CPF" : "CNPJ"} ${formatarDocumento(d)}${g.cliente.contato ? ` · ${g.cliente.contato}` : ""}`,
      ),
      14,
      y + 8.5,
    );
    autoTable(doc, {
      startY: y + 11,
      head: [["No NF", "Emissao", "Tipo", "Situacao", "Repasse", "Cobranca"]],
      body: g.notas.map((n) => [
        n.numero_nf,
        format(parseISO(n.data_emissao), "dd/MM/yyyy"),
        semAcento(TIPO_META[n.tipo_emissao].label),
        STATUS_LABEL[n.status],
        n.repassado_financeiro_em
          ? `Repassada ${format(parseISO(n.repassado_financeiro_em), "dd/MM")}`
          : "Nova",
        formatarReais(valorDaNota(n.valor_cobranca)),
      ]),
      theme: "plain",
      headStyles: { textColor: CINZA, fontStyle: "normal", fontSize: 8 },
      bodyStyles: { fontSize: 9, textColor: TEXTO },
      columnStyles: { 0: { font: "courier" }, 5: { halign: "right" } },
      styles: { lineColor: [226, 223, 216], lineWidth: { bottom: 0.2 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (grupos.length) {
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.6);
    doc.line(14, y, largura - 14, y);
    doc.setTextColor(...TEXTO);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Total geral", 14, y + 7);
    doc.setFont("helvetica", "bold");
    doc.text(formatarReais(total), largura - 14, y + 7, { align: "right" });
    y += 14;
  }

  if (observacao?.trim()) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...AZUL);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("OBSERVACAO", 14, y + 4);
    doc.setTextColor(...TEXTO);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(semAcento(observacao.trim()), largura - 28), 14, y + 10);
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text(
      semAcento(`${escritorio} · gerado pelo Ofis · pagina ${i} de ${paginas}`),
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  doc.save(`ofis-esporadicos-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
