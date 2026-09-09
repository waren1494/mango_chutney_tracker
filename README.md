# Mango Chutney: Invoice → Tracker

Converts a batch of invoice PDFs into the three trackers you run each day:
**Kitchen Tracker**, **Loading Tracker**, and **Delivery Tracker**.

## How it works

1. **Upload** — pick one or more invoice PDFs for the day. Parsing happens
   entirely in your browser (via pdf.js) — no invoice content is sent
   anywhere except when you explicitly click "Save batch".
2. **Auto-split into legs** — each invoice is broken into one or more
   "legs" (a pickup/setup/serving slot with its own menu). Most invoices are
   one leg; a multi-drop delivery (like breakfast/lunch/tea to one office)
   becomes several legs automatically, detected from the time labels in the
   invoice.
3. **Review & correct** — every field lands in an editable table. Some
   fields genuinely aren't on the invoice and need to be filled in by hand
   every time: **pickup time**, **service crew**, and **payment status**.
   The parser also isn't perfect on messy or unusual invoice layouts — treat
   this table as a first draft, not a final answer.
4. **Save batch** — persists the day's legs (via Netlify Blobs) so you can
   add more invoices as they come in throughout the day, or come back later
   from another device.
5. **Generate 3 trackers** — produces three downloadable PDFs:
   - `Delivery_Tracker_<date>.pdf` — the master table, one row per leg
   - `Loading_Tracker_<date>.pdf` — one card per leg (customer, times, pax,
     menu, packed/loaded/checked/time-out fields)
   - `Kitchen_Tracker_<date>.pdf` — grouped by "ready by" time across all
     legs for the day, so the kitchen can batch-cook by deadline

Each leg is auto-numbered as "EVENT N" for the day, grouped by invoice
number (or customer name if no invoice number), ordered by pickup time —
matching how your current trackers label multi-leg orders (e.g. one
customer's 3 time slots all show as "EVENT 2").

## Known limitations (read this before relying on it)

This is a **heuristic parser**, tuned to the five sample invoices you
shared. Real invoices vary, so expect it to occasionally:
- Misjudge which dish belongs to which time slot on multi-drop invoices
- Pick up a stray line as a "dish" that isn't one (or miss one)
- Get pax count wrong on invoices that don't put pax in the Qty column
- Leave pickup time, crew, and payment blank — these are never on the
  invoice and always need manual entry

None of this blocks you — everything is editable in the table before you
generate the PDFs. As you use it, if you notice a *recurring* misparse
pattern (not a one-off), tell me the invoice format and I can tighten the
parser rules.

## Deploying to Netlify

**Option A — drag and drop:**
1. Zip this whole folder.
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drop it.
3. That's it for the frontend — but you also need Netlify to install the
   `@netlify/blobs` dependency for the functions to work. Drag-and-drop
   deploys don't run `npm install`, so if "Save batch" fails after a
   drag-and-drop deploy, use Option B instead.

**Option B — connect a Git repo (recommended, supports the Save feature):**
1. Push this folder to a new GitHub repo.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build settings: leave build command empty, publish directory `public`,
   functions directory `netlify/functions` (already set in `netlify.toml`).
4. Deploy. Netlify auto-installs `@netlify/blobs` from `package.json` and
   Blobs works out of the box on any Netlify site — no database setup, no
   API keys to configure.

## Local testing

If you have the [Netlify CLI](https://docs.netlify.com/cli/get-started/)
installed:

```bash
npm install
netlify dev
```

This serves the site with working functions (including Blobs) at
`http://localhost:8888`.

## Project structure

```
public/
  index.html            – the page
  css/style.css
  js/pdfParser.js        – extracts + parses invoice PDF text into legs
  js/trackerGenerator.js – builds the 3 PDFs (jsPDF)
  js/app.js               – wires up the UI
netlify/functions/
  save-day.js   – persist a day's legs (Netlify Blobs)
  get-day.js    – fetch a day's saved legs
  list-days.js  – list saved dates
netlify.toml
package.json
```
