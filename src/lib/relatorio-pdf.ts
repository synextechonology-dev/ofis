import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { NotaFiscal } from "@/lib/supabase";
import { TIPOS, TIPO_META, percentual } from "@/lib/nf";
import { rankingClientes } from "@/lib/nf";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const AZUL: [number, number, number] = [30, 58, 95];

/** Gera e baixa o relatório mensal em PDF a partir das notas do mês de referência. */
export function gerarRelatorioMensalPdf(notas: NotaFiscal[], referencia: Date) {
  const inicio = iso(startOfMonth(referencia));
  const fim = iso(endOfMonth(referencia));
  const doMes = notas.filter((n) => n.data_emissao >= inicio && n.data_emissao <= fim);

  const doc = new jsPDF();
  const mesAno = format(referencia, "MMMM 'de' yyyy", { locale: ptBR });

  doc.setFillColor(...AZUL);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Ofis - Relatorio Mensal - ${mesAno}`, 14, 16);
  doc.setTextColor(15, 23, 42);

  const total = doMes.length;
  const porStatus = (status: string) => doMes.filter((n) => n.status === status).length;
  const autorizadas = porStatus("autorizada");
  const taxa = total ? `${((autorizadas / total) * 100).toFixed(1)}%` : "0%";

  let y = 36;
  const secao = (titulo: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(titulo, 14, y);
    y += 4;
  };

  secao("1. Resumo do mes");
  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Total de notas", String(total)],
      ["Autorizadas", String(autorizadas)],
      ["Canceladas", String(porStatus("cancelada"))],
      ["Denegadas", String(porStatus("denegada"))],
      ["Taxa de autorizacao", taxa],
    ],
    theme: "grid",
    headStyles: { fillColor: AZUL },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  secao("2. Por tipo de emissao");
  autoTable(doc, {
    startY: y,
    head: [["Tipo", "Quantidade", "% do total"]],
    body: TIPOS.map((tipo) => {
      const qtd = doMes.filter((n) => n.tipo_emissao === tipo).length;
      return [TIPO_META[tipo].label, String(qtd), percentual(qtd, total)];
    }),
    theme: "grid",
    headStyles: { fillColor: AZUL },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  secao("3. Top 10 clientes");
  const ranking = rankingClientes(doMes).slice(0, 10);
  autoTable(doc, {
    startY: y,
    head: [["#", "Cliente", "Qtd. notas", "Tipo principal"]],
    body: ranking.length
      ? ranking.map((item, index) => [
          String(index + 1),
          item.cliente,
          String(item.quantidade),
          TIPO_META[item.tipoPrincipal].label,
        ])
      : [["-", "Sem dados no periodo", "-", "-"]],
    theme: "grid",
    headStyles: { fillColor: AZUL },
    styles: { fontSize: 9 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  secao("4. Evolucao diaria");
  const dias = eachDayOfInterval({
    start: startOfMonth(referencia),
    end: endOfMonth(referencia),
  });
  autoTable(doc, {
    startY: y,
    head: [["Data", "Notas", "Autorizadas", "Nao autorizadas"]],
    body: dias.map((dia) => {
      const key = iso(dia);
      const doDia = doMes.filter((n) => n.data_emissao === key);
      return [
        format(dia, "dd/MM/yyyy"),
        String(doDia.length),
        String(doDia.filter((n) => n.status === "autorizada").length),
        String(doDia.filter((n) => n.status !== "autorizada").length),
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: AZUL },
    styles: { fontSize: 8 },
  });

  const geradoEm = format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR });
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Ofis - gerado em ${geradoEm} - pagina ${i} de ${paginas}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  doc.save(`ofis-relatorio-${format(referencia, "yyyy-MM")}.pdf`);
}

/** Data de referência (mês) a partir de uma string ISO. */
export const mesDeIso = (valor: string) => parseISO(valor);
