// trackerGenerator.js
// Builds the three downloadable PDFs from a day's array of legs.
// Requires window.jspdf (jsPDF + jspdf-autotable) to be loaded via CDN.

function timeToMinutes(t) {
  if (!t) return 99999;
  const first = t.split("-")[0].trim();
  const m = first.match(/(\d{1,2})[.:](\d{2})\s*(AM|PM)/i);
  if (!m) return 99999;
  let [, h, min, ap] = m;
  h = Number(h) % 12;
  if (ap.toUpperCase() === "PM") h += 12;
  return h * 60 + Number(min);
}

function dayNameFor(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** Assigns a stable "EVENT N" number per underlying invoice/customer group,
 *  numbered in order of earliest pickup/setup/serving time that day. */
function assignEventNumbers(legs) {
  const keyOf = (l) => l.invoiceNo || l.customer || l.id;
  const groups = new Map();
  for (const l of legs) {
    const k = keyOf(l);
    const t = timeToMinutes(l.pickupTime || l.setupTime || l.servingTime);
    if (!groups.has(k) || t < groups.get(k)) groups.set(k, t);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const numberOf = new Map(ordered.map((k, i) => [k, i + 1]));
  return legs.map((l) => ({ ...l, eventNumber: numberOf.get(keyOf(l)) }));
}

function sortedLegs(legs) {
  return [...legs].sort(
    (a, b) =>
      timeToMinutes(a.pickupTime || a.setupTime || a.servingTime) -
      timeToMinutes(b.pickupTime || b.setupTime || b.servingTime)
  );
}

export function generateDeliveryTracker(date, legs) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  const numbered = assignEventNumbers(sortedLegs(legs));

  doc.setFontSize(14);
  doc.text("MANGO CHUTNEY DELIVERY TRACKER", 40, 40);
  doc.setFontSize(11);
  doc.text(`${dayNameOrDate(date)}`, 40, 58);

  const rows = numbered.map((l, i) => [
    String(i + 1),
    l.customer || "",
    l.invoiceNo || "",
    l.pickupTime || "",
    l.setupTime || "",
    l.servingTime || "",
    String(l.pax || ""),
    `EVENT ${l.eventNumber}`,
    l.crew || "",
    l.payment || "",
    l.venue || "",
    l.contact || "",
  ]);

  doc.autoTable({
    startY: 75,
    head: [
      [
        "NO",
        "CUSTOMER",
        "INVOICE NO",
        "PICK UP TIME",
        "SETUP TIME",
        "SERVING TIME",
        "NO OF PAX",
        "ORDER TYPE",
        "SERVICE CREW",
        "PAYMENT",
        "VENUE",
        "CONTACT",
      ],
    ],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4, valign: "middle" },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    theme: "grid",
  });

  doc.save(`Delivery_Tracker_${date}.pdf`);
}

function dayNameOrDate(date) {
  const dn = dayNameFor(date);
  const disp = formatDateDisplayLong(date);
  return dn ? `${disp}, ${dn}` : disp;
}

function formatDateDisplayLong(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function generateLoadingTracker(date, legs) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt" });
  const numbered = assignEventNumbers(sortedLegs(legs));

  numbered.forEach((l, idx) => {
    if (idx > 0) doc.addPage();
    let y = 40;
    doc.setFontSize(13);
    doc.text("MANGO CHUTNEY ORDERS", 40, y);
    y += 16;
    doc.setFontSize(11);
    doc.text(`LOADING TRACKING (${formatDateDisplay(date)}) - ${dayNameFor(date)}`, 40, y);
    y += 20;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(`EVENT ${l.eventNumber}`, 40, y);
    y += 18;

    doc.autoTable({
      startY: y,
      head: [[l.customer || "", "PACKED", "LOADED"]],
      body: [["", "", ""]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      theme: "grid",
      columnStyles: { 0: { cellWidth: 300 }, 1: { cellWidth: 100 }, 2: { cellWidth: 100 } },
    });
    y = doc.lastAutoTable.finalY + 14;

    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    const infoLines = [
      [`PICK-UP TIME :`, l.pickupTime || "-"],
      [`SET-UP TIME :`, l.setupTime || "-"],
      [`SERVING TIME :`, l.servingTime || "-"],
      [`TOTAL PAX :`, String(l.pax || "-")],
    ];
    infoLines.forEach(([label, val]) => {
      doc.text(`${label} ${val}`, 40, y);
      y += 15;
    });
    y += 6;

    doc.setFont(undefined, "bold");
    doc.text("MENU / ITEMS", 40, y);
    y += 4;
    doc.setFont(undefined, "normal");
    doc.autoTable({
      startY: y + 6,
      body: (l.menuItems || []).map((d) => [d]),
      styles: { fontSize: 10, cellPadding: 4 },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 16;

    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text(`REMARKS :- ${l.remarks || ""}`, 40, y);
    y += 24;

    const checks = ["PACKED BY :", "LOADED BY :", "CHECKED BY :", "TIME OUT :"];
    checks.forEach((c) => {
      doc.text(c, 40, y);
      doc.text("...........................", 130, y);
      y += 18;
    });
    y += 10;

    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - 80;
    doc.setFont(undefined, "bold");
    const venueLines = doc.splitTextToSize(l.venue || "", maxWidth);
    doc.text(venueLines, 40, y);
    y += venueLines.length * 14;
    doc.setFont(undefined, "normal");
    doc.text(l.contact || "", 40, y);
  });

  doc.save(`Loading_Tracker_${date}.pdf`);
}

export function generateKitchenTracker(date, legs) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt" });
  const numbered = assignEventNumbers(legs);

  // Group by "ready by" time (pickup, falling back to setup/serving).
  const buckets = new Map();
  for (const l of numbered) {
    const ready = l.pickupTime || l.setupTime || l.servingTime || "TIME TBC";
    if (!buckets.has(ready)) buckets.set(ready, []);
    buckets.get(ready).push(l);
  }
  const bucketKeys = [...buckets.keys()].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

  let y = 40;
  doc.setFontSize(13);
  doc.text("LUNCH & DINNER TRACKER", 40, y);
  y += 16;
  doc.setFontSize(11);
  doc.text(`(${formatDateDisplay(date)} - ${dayNameFor(date)})`, 40, y);
  y += 20;

  for (const key of bucketKeys) {
    const groupLegs = buckets.get(key);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(`READY BY ${key} TOTAL`, 40, y);
    y += 14;
    doc.setFont(undefined, "italic");
    doc.setFontSize(9);
    doc.text("GARNISH ALL DISHES", 40, y);
    y += 6;
    doc.setFont(undefined, "normal");

    const rows = [];
    for (const l of groupLegs) {
      for (const dish of l.menuItems || []) {
        rows.push([dish, String(l.pax || ""), String(l.pax || ""), `EVENT ${l.eventNumber}`]);
      }
    }

    doc.autoTable({
      startY: y + 6,
      head: [["DISH", "QTY", "TOTAL", "EVENT"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      theme: "grid",
      margin: { left: 40, right: 40 },
      didDrawPage: () => {},
    });
    y = doc.lastAutoTable.finalY + 20;

    if (y > 720) {
      doc.addPage();
      y = 40;
    }
  }

  doc.save(`Kitchen_Tracker_${date}.pdf`);
}
