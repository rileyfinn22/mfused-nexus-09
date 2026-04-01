import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface OrderConfirmationData {
  order_number: string;
  order_date: string;
  po_number?: string | null;
  customer_name: string;
  description?: string | null;
  shipping_name: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_zip: string;
}

interface ConfirmationItem {
  name: string;
  sku: string;
  quantity: number;
  description?: string | null;
}

export async function generateOrderConfirmationPdf(
  order: OrderConfirmationData,
  items: ConfirmationItem[]
): Promise<{ blob: Blob; base64: string }> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const primaryGreen = [76, 175, 80];
  const darkGray = [51, 51, 51];
  const mediumGray = [100, 100, 100];

  let yPos = 15;

  // ============ HEADER ============
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("ArmorPak Inc. DBA Vibe Packaging", 14, yPos);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("1415 S 700 W", 14, yPos + 7);
  doc.text("Salt Lake City, UT 84104", 14, yPos + 12);
  doc.text("www.vibepkg.com", 14, yPos + 17);

  // Logo on right
  try {
    const logoResponse = await fetch("/images/vibe-logo.png");
    const logoBlob = await logoResponse.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, "PNG", pageWidth - 54, yPos - 5, 40, 25);
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("VIBE", pageWidth - 14, yPos + 8, { align: "right" });
  }

  yPos += 28;

  // Divider
  doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  yPos += 12;

  // ============ TITLE ============
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text("Order Confirmation", 14, yPos);
  yPos += 15;

  // ============ ORDER DETAILS & SHIP TO ============
  const leftColX = 14;
  const rightColX = pageWidth / 2 + 10;

  // Ship To
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Ship To", leftColX, yPos);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(order.shipping_name || order.customer_name, leftColX, yPos + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  let shipY = yPos + 14;
  if (order.shipping_street) {
    doc.text(order.shipping_street, leftColX, shipY);
    shipY += 5;
  }
  if (order.shipping_city) {
    doc.text(
      `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
      leftColX,
      shipY
    );
  }

  // Order details on right
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);

  let detY = yPos;
  doc.text("Order #:", rightColX, detY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(order.order_number, rightColX + 40, detY);

  detY += 7;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
  doc.text("Date:", rightColX, detY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  doc.text(
    new Date(order.order_date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    rightColX + 40,
    detY
  );

  if (order.po_number) {
    detY += 7;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("PO #:", rightColX, detY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
    doc.text(order.po_number, rightColX + 40, detY);
  }

  yPos = Math.max(shipY, detY) + 15;

  // ============ DESCRIPTION ============
  if (order.description) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(mediumGray[0], mediumGray[1], mediumGray[2]);
    doc.text("Description", leftColX, yPos);
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(order.description, pageWidth - 28);
    doc.text(descLines, leftColX, yPos);
    yPos += descLines.length * 5 + 8;
  }

  // ============ ITEMS TABLE ============
  autoTable(doc, {
    startY: yPos,
    head: [["#", "Product", "SKU", "Qty", "Description"]],
    body: items.map((item, i) => [
      (i + 1).toString(),
      item.name,
      item.sku,
      item.quantity.toString(),
      item.description || "",
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [51, 51, 51],
    },
    headStyles: {
      fillColor: [76, 175, 80],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: 12 },
      2: { fontStyle: "bold", cellWidth: 35 },
      3: { halign: "center", cellWidth: 18 },
    },
    margin: { left: 14, right: 14 },
  });

  // ============ TOTAL QTY ============
  const finalY = (doc as any).lastAutoTable?.finalY || yPos + 40;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  doc.text(
    `Total Items: ${items.length}  |  Total Qty: ${totalQty.toLocaleString()}`,
    14,
    finalY + 10
  );

  // ============ FOOTER ============
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("Thank you for your business!", pageWidth / 2, pageHeight - 12, {
    align: "center",
  });

  const base64 = doc.output("datauristring").split(",")[1];
  const blob = doc.output("blob");
  return { blob, base64 };
}
