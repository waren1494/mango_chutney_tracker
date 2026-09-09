import { parseInvoiceText, extractPdfText } from "./pdfParser.js";
import {
  generateDeliveryTracker,
  generateLoadingTracker,
  generateKitchenTracker,
} from "./trackerGenerator.js";

const state = {
  date: todayStr(),
  legs: [],
};

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

const els = {
  dateInput: document.getElementById("dateInput"),
  fileInput: document.getElementById("fileInput"),
  parseBtn: document.getElementById("parseBtn"),
  loadDayBtn: document.getElementById("loadDayBtn"),
  saveDayBtn: document.getElementById("saveDayBtn"),
  genBtn: document.getElementById("genBtn"),
  legsBody: document.getElementById("legsBody"),
  status: document.getElementById("status"),
  emptyState: document.getElementById("emptyState"),
};

els.dateInput.value = state.date;

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.className = isError ? "status error" : "status";
}

els.dateInput.addEventListener("change", () => {
  state.date = els.dateInput.value;
});

els.parseBtn.addEventListener("click", async () => {
  const files = els.fileInput.files;
  if (!files || files.length === 0) {
    setStatus("Choose one or more invoice PDFs first.", true);
    return;
  }
  if (!window.pdfjsLib) {
    setStatus("PDF reader library failed to load (check your internet connection and reload the page).", true);
    return;
  }
  setStatus(`Parsing ${files.length} invoice(s)...`);
  let added = 0;
  const errors = [];
  for (const file of files) {
    try {
      const text = await extractPdfText(file);
      const legs = parseInvoiceText(text, file.name);
      state.legs.push(...legs);
      added += legs.length;
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message}`);
    }
  }
  render();
  // Errors take priority in the status line — a success message must never
  // silently overwrite a real failure.
  if (errors.length) {
    setStatus(`Added ${added} leg(s), but ${errors.length} file(s) failed — ${errors.join("; ")}`, true);
  } else {
    setStatus(`Added ${added} leg(s) from ${files.length} invoice(s). Review and correct below before generating trackers.`);
  }
  els.fileInput.value = "";
});

els.loadDayBtn.addEventListener("click", async () => {
  setStatus("Loading saved batch for this date...");
  try {
    const res = await fetch(`/.netlify/functions/get-day?date=${state.date}`);
    const data = await res.json();
    state.legs = data.legs || [];
    render();
    setStatus(`Loaded ${state.legs.length} leg(s) for ${state.date}.`);
  } catch (err) {
    setStatus(`Could not load: ${err.message}`, true);
  }
});

els.saveDayBtn.addEventListener("click", async () => {
  setStatus("Saving...");
  try {
    const res = await fetch(`/.netlify/functions/save-day`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: state.date, legs: state.legs }),
    });
    if (!res.ok) throw new Error(await res.text());
    setStatus(`Saved ${state.legs.length} leg(s) for ${state.date}. You can close this tab and come back to it later.`);
  } catch (err) {
    setStatus(`Could not save: ${err.message}`, true);
  }
});

els.genBtn.addEventListener("click", () => {
  if (state.legs.length === 0) {
    setStatus("Nothing to generate yet — add some invoices first.", true);
    return;
  }
  try {
    generateDeliveryTracker(state.date, state.legs);
    generateLoadingTracker(state.date, state.legs);
    generateKitchenTracker(state.date, state.legs);
    setStatus("Generated all 3 trackers — check your downloads.");
  } catch (err) {
    console.error(err);
    setStatus(`Could not generate PDFs: ${err.message}`, true);
  }
});

function field(leg, key, type = "text") {
  if (key === "menuItems") {
    return `<textarea data-id="${leg.id}" data-key="${key}" rows="3">${(leg.menuItems || []).join("\n")}</textarea>`;
  }
  if (key === "payment") {
    const opts = ["UNPAID", "PARTIALLY PAID", "PAID"];
    return `<select data-id="${leg.id}" data-key="${key}">${opts
      .map((o) => `<option value="${o}" ${leg.payment === o ? "selected" : ""}>${o}</option>`)
      .join("")}</select>`;
  }
  const val = (leg[key] ?? "").toString().replace(/"/g, "&quot;");
  return `<input data-id="${leg.id}" data-key="${key}" type="${type}" value="${val}" />`;
}

function render() {
  els.emptyState.style.display = state.legs.length ? "none" : "block";
  els.legsBody.innerHTML = state.legs
    .map(
      (leg) => `
    <tr>
      <td>${field(leg, "customer")}</td>
      <td>${field(leg, "invoiceNo")}</td>
      <td>${field(leg, "venue")}</td>
      <td>${field(leg, "contact")}</td>
      <td>${field(leg, "pickupTime")}</td>
      <td>${field(leg, "setupTime")}</td>
      <td>${field(leg, "servingTime")}</td>
      <td>${field(leg, "pax")}</td>
      <td>${field(leg, "menuItems")}</td>
      <td>${field(leg, "crew")}</td>
      <td>${field(leg, "payment")}</td>
      <td><button class="removeBtn" data-id="${leg.id}" title="Remove this leg">&times;</button></td>
    </tr>`
    )
    .join("");

  els.legsBody.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("change", onFieldChange);
  });
  els.legsBody.querySelectorAll(".removeBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.legs = state.legs.filter((l) => l.id !== btn.dataset.id);
      render();
    });
  });
}

function onFieldChange(e) {
  const { id, key } = e.target.dataset;
  const leg = state.legs.find((l) => l.id === id);
  if (!leg) return;
  if (key === "menuItems") {
    leg.menuItems = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
  } else {
    leg[key] = e.target.value;
  }
}

render();
