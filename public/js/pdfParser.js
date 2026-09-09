// pdfParser.js
// Turns raw extracted invoice text into one or more editable "leg" drafts.
// A "leg" = one pickup/setup/serving slot with its own menu list, matching
// how the Delivery Tracker and Loading Tracker break a single invoice into
// multiple EVENT rows (e.g. a 3-drop office delivery becomes 3 legs).
//
// This is deliberately a best-effort heuristic parser: real invoices vary in
// formatting, so every field it produces lands in an editable table before
// any tracker gets generated.

const TIME_RE = /(\d{1,2}[.:]\d{2}\s*(?:AM|PM))/gi;
const MEAL_HEADER_RE = /^(BREAKFAST|LUNCH|DINNER|TEA\s*BREAK|HIGH\s*TEA)\s*-?\s*(\d{1,2}[.:]\d{2}\s*(?:AM|PM))?/i;
const SUBMEAL_RE = /^(NON\s*VEG\s*MEAL|VEG\s*MEAL)\b.*$/i;
const BOX_LABEL_RE = /-\s*\d+\s*PAX\)?\s*$/i; // e.g. "HIGH TEA SNACK TRIO BOX - 10 PAX"

function cleanLine(s) {
  return s.replace(/\s+/g, " ").trim();
}

function extractInvoiceNo(text) {
  const m = text.match(/I-\d{6,}/);
  return m ? m[0] : "";
}

function extractHeaderDate(text) {
  const m = text.match(/Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? m[1] : "";
}

function extractCustomer(text) {
  const m = text.match(/^\s*([A-Z0-9][A-Z0-9 &.,'()\/-]{1,80}?)\s+Your Ref\./m);
  return m ? cleanLine(m[1]) : "";
}

function extractContact(text) {
  // Customer mobile numbers in this template always start with 01x and are
  // preceded by "TEL :" with a space before the colon. The head-office
  // landline is "TEL:" with no space, so this pattern naturally skips it.
  const m = text.match(/TEL\s*:\s*(01[0-9][0-9\- ]{6,})/i);
  return m ? cleanLine(m[1]) : "";
}

function splitItems(text) {
  // Cut off boilerplate sections before splitting into numbered items.
  const cut = text.split(/Terms\s*&\s*Condition|MALAYSIAN RINGGIT/i)[0];
  const re = /^\s*(\d{1,2})\.\s+([^\n]+)/gm;
  const matches = [...cut.matchAll(re)];
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : cut.length;
    items.push({
      num: matches[i][1],
      firstLine: cleanLine(matches[i][2]),
      body: cut.slice(start, end),
    });
  }
  return items;
}

function extractField(body, label, stopLabelsRe) {
  const re = new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?=" + stopLabelsRe + "|$)", "i");
  const m = body.match(re);
  return m ? cleanLine(m[1]) : "";
}

const STOP_LABELS =
  "\\n\\s*(?:DATE|VENUE|TIME|SETUP TIME|SERVING TIME|EVENT TYPE|EVENT THEME)\\s*:";

function parseDeliveryOrEventBlock(body) {
  const venue = extractField(body, "VENUE", STOP_LABELS);
  const eventType = extractField(body, "EVENT TYPE", STOP_LABELS);
  const setupTime = extractField(body, "SETUP TIME", STOP_LABELS);
  const servingTime = extractField(body, "SERVING TIME", STOP_LABELS);
  const times = [...body.matchAll(TIME_RE)].map((m) => m[1].toUpperCase());
  return { venue, eventType, setupTime, servingTime, times };
}

function parseMenuBlock(body) {
  const lines = body
    .split("\n")
    .slice(1) // drop the "N. MENU ..." line itself
    .map(cleanLine)
    .filter(Boolean);

  let mealLabel = "";
  let mealTime = "";
  const dishes = [];

  for (const line of lines) {
    const mealMatch = line.match(MEAL_HEADER_RE);
    // Only treat as a meal-time header when a time is actually present —
    // otherwise "HIGH TEA SNACK TRIO BOX" would falsely match "HIGH TEA"
    // and wipe out a previously-detected time for this block.
    if (mealMatch && mealMatch[2]) {
      mealLabel = cleanLine(mealMatch[1]).toUpperCase();
      mealTime = mealMatch[2].toUpperCase();
      continue;
    }
    if (SUBMEAL_RE.test(line)) continue; // "NON VEG MEAL - 9 PAX" style sub-header
    if (BOX_LABEL_RE.test(line)) continue; // "... BOX - 10 PAX" style sub-header
    if (/^(RM|Qty|UOM|U\/ Price)/i.test(line)) continue;
    dishes.push(line);
  }
  return { mealLabel, mealTime, dishes };
}

function extractQty(firstLine) {
  // The Qty column is the first standalone integer right after the leading
  // item-type words (e.g. "MENU 10 12.50 125.00" -> 10). Matching from the
  // end is unreliable because totals like "125.00" also end in digits.
  const m = firstLine.match(/^[A-Z][A-Z0-9 &\-+.\/]*?\s+(\d+)(?:\s|$)/i);
  return m ? m[1] : "";
}

/**
 * Parses one invoice's full text into 1+ draft legs.
 * @param {string} text - concatenated text of all pages of one invoice PDF
 * @param {string} sourceFile - original filename, kept for reference
 * @returns {Array<Object>} draft legs
 */
export function parseInvoiceText(text, sourceFile) {
  const invoiceNo = extractInvoiceNo(text);
  const headerDate = extractHeaderDate(text);
  const customer = extractCustomer(text);
  const contact = extractContact(text);
  const items = splitItems(text);

  const menuGroups = []; // { mealTime, mealLabel, dishes[], qty }
  let deliveryInfo = null;
  let waitersQty = "";
  let isEvent = false;

  for (const item of items) {
    const type = item.firstLine.toUpperCase();
    if (type.startsWith("MENU")) {
      const parsed = parseMenuBlock(item.body);
      menuGroups.push({ ...parsed, qty: extractQty(item.firstLine) });
    } else if (type.startsWith("WAITERS")) {
      waitersQty = extractQty(item.firstLine);
      isEvent = true;
    } else if (type.startsWith("DELIVERY")) {
      deliveryInfo = parseDeliveryOrEventBlock(item.body);
    } else if (type.startsWith("TRANSPORTATION")) {
      const info = parseDeliveryOrEventBlock(item.body);
      if (info.eventType) isEvent = true;
      // Event invoices carry venue/time info on the TRANSPORTATION line
      if (!deliveryInfo) deliveryInfo = info;
      else deliveryInfo = { ...deliveryInfo, ...info };
    }
  }

  // Group menu items by detected meal time, if any were tagged.
  const timeGroups = new Map();
  const untimed = [];
  for (const g of menuGroups) {
    if (g.mealTime) {
      const key = g.mealTime;
      if (!timeGroups.has(key)) timeGroups.set(key, { dishes: [], qty: 0, label: g.mealLabel });
      const entry = timeGroups.get(key);
      entry.dishes.push(...g.dishes);
      entry.qty += Number(g.qty) || 0;
    } else {
      untimed.push(g);
    }
  }

  const legs = [];
  const baseVenue = (deliveryInfo && deliveryInfo.venue) || "";
  const baseContact = contact;
  const baseCustomer = customer;

  if (timeGroups.size > 0) {
    // Multi-drop invoice (e.g. breakfast/lunch/tea to one venue).
    for (const [time, entry] of timeGroups.entries()) {
      legs.push({
        invoiceNo,
        customer: baseCustomer,
        contact: baseContact,
        venue: baseVenue,
        date: headerDate,
        pickupTime: "",
        setupTime: "",
        servingTime: time,
        pax: entry.qty || "",
        menuItems: dedupe(entry.dishes),
        crew: "",
        payment: "UNPAID",
        remarks: "",
        sourceFile,
        sourceType: isEvent ? "EVENT" : "DELIVERY",
      });
    }
    // Any untimed menu lines (e.g. a stray header with no dishes) are
    // folded into the first leg so nothing gets silently dropped.
    if (untimed.length && legs.length) {
      const extra = untimed.flatMap((g) => g.dishes);
      legs[0].menuItems = dedupe([...legs[0].menuItems, ...extra]);
    }
  } else {
    // Single leg: combine every MENU item's dishes.
    const allDishes = dedupe(menuGroups.flatMap((g) => g.dishes));
    let qty =
      menuGroups.length > 0
        ? Math.max(...menuGroups.map((g) => Number(g.qty) || 0))
        : "";
    // Some invoices don't put pax in the Qty column at all (it's just "1"
    // order) and instead annotate each dish like "CHICKEN 65 (15PAX)".
    // Fall back to the largest such annotation when the Qty column is
    // uninformative (0 or 1).
    if ((!qty || qty <= 1) && allDishes.length) {
      const paxMentions = allDishes
        .flatMap((d) => [...d.matchAll(/(\d+)\s*PAX/gi)].map((m) => Number(m[1])))
        .filter((n) => !isNaN(n));
      if (paxMentions.length) qty = Math.max(...paxMentions);
    }
    const singleTime =
      (deliveryInfo && deliveryInfo.times && deliveryInfo.times[0]) || "";

    legs.push({
      invoiceNo,
      customer: baseCustomer,
      contact: baseContact,
      venue: baseVenue,
      date: headerDate,
      pickupTime: "",
      setupTime: (deliveryInfo && deliveryInfo.setupTime) || "",
      servingTime: (deliveryInfo && deliveryInfo.servingTime) || singleTime,
      pax: qty + (waitersQty ? "" : ""),
      menuItems: allDishes,
      crew: "",
      payment: "UNPAID",
      remarks: "",
      sourceFile,
      sourceType: isEvent ? "EVENT" : "DELIVERY",
      eventType: (deliveryInfo && deliveryInfo.eventType) || "",
    });
  }

  return legs.map((l, i) => ({ ...l, id: `${invoiceNo || sourceFile}-${i}-${Date.now()}` }));
}

function dedupe(arr) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Extracts raw text from a PDF file using pdf.js (must be loaded globally
 * as `pdfjsLib` before calling this).
 */
export async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group by y-position roughly to approximate line breaks.
    let lastY = null;
    let line = "";
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        fullText += line + "\n";
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    fullText += line + "\n";
  }
  return fullText;
}
