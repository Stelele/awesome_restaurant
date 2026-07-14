# Restaurant Table POS — Design Spec

**Date:** 2026-07-14
**App:** `awesome_restaurant3`
**Goal:** Add optional table selection to ERPNext POS so restaurant staff can manage per-table running tabs before payment.

---

## 1. Data Model

### 1.1 POS Profile — new field
- `restaurant_table_count` (Int, default 0, label "Number of Tables")
- Added via `Custom Field` fixture in the app.
- When 0, POS behaves exactly as it does today (no table mode).

### 1.2 POS Invoice / Sales Invoice — new field
- `restaurant_table` (Data, read-only in form, label "Restaurant Table")
- Added via `Custom Field` fixture on **both** "POS Invoice" and "Sales Invoice" doctypes, since POS Settings can use either invoice type.
- Set on draft creation by the frontend. Persists through submit for reporting.
- Stores the table identifier string, e.g. `"Table 3"`.

No new doctypes are created. Tables exist ephemerally — derived from the count, never stored as persistent records.

---

## 2. Page Override & Component Architecture

### 2.1 Hook
Single entry in `hooks.py`:
```python
page_js = {"point-of-sale": "/assets/awesome_restaurant3/js/pos/restaurant_pos.js"}
```

### 2.2 Entry file (`restaurant_pos.js`)
Replaces `point_of_sale.js`. Copies the original page init (~30 lines). After the wrapper is rendered:
1. Fetch `POS Profile.restaurant_table_count` via `frappe.call`.
2. If count is 0 or unset → load the standard `point-of-sale.bundle.js` and instantiate `erpnext.PointOfSale.Controller` (identical to upstream).
3. If count > 0 → render `TableSelector` component instead of the normal POS UI.

### 2.3 TableSelector component (`pos_table_selector.js`)
A responsive grid of table cards (4 columns on desktop, 2 on smaller screens). Each card shows:
- Table name (e.g. "Table 3")
- Status indicator: green border = free, orange solid fill = occupied
- Current draft invoice total (bold, only for occupied)
- Item count and elapsed time since last activity, derived from the draft invoice's `modified` timestamp (only for occupied)

Interactions:
- **Click empty table** → creates a new draft POS Invoice with `restaurant_table` set, transitions to item selector/cart view with a "Table N" badge and back arrow.
- **Click occupied table** → loads the existing draft invoice, transitions to item selector/cart.
- **Clear Table (X on occupied card)** → prompts confirmation, deletes the draft invoice via `frm.doc.delete()`, frees the table.

### 2.4 Modified POS flow (inside a table)
After table selection:
- The normal POS components (ItemSelector, ItemCart, ItemDetails, Payment) render as usual, using the draft invoice linked to that table.
- Header shows: back arrow (to grid, auto-saves) + "Table N" badge.
- After payment (submit):
  - Instead of showing invoice summary, transition back to the table grid.
  - Show a brief toast: "Table N — paid".
  - The table card turns green.
- On session close: find all draft POS Invoices with `restaurant_table` set, cancel them.

### 2.5 Controller wrapping (subclass)
A new class `RestaurantPosController` **subclasses** `erpnext.PointOfSale.Controller`:
- Overrides `make_new_invoice()` to set `restaurant_table` on the frm doc.
- Overrides the post-submit callback to return to table grid instead of invoice summary.
- Adds `clear_table()` method: deletes the draft and returns to grid.
- Overrides session close handler to cancel all table-linked drafts.
- All other behavior delegates to the parent class — the original controller is never copied, only extended.

The bundle loads the original `point-of-sale.bundle.js` to make `erpnext.PointOfSale.Controller` available for subclassing, then instantiates the subclass instead.

---

## 3. Visual Layout

```
+---------------------------------------------------+
|  POS: Main Counter                    User / Time  |
|  ------------------------------------------------- |
|                                                   |
|  +----------+ +----------+ +----------+ +-------+  |
|  | Table 1  | | Table 2  | | Table 3  | | Tbl 4 |  |
|  |  FREE    | |  $42.50  | |  $18.00  | | FREE  |  |
|  |          | |  3 items  | |  2 items  | |       |  |
|  |          | |  5m ago   | | 12m ago   | |       |  |
|  +----------+ +----------+ +----------+ +-------+  |
|                                                   |
|  +----------+ +----------+ +----------+ +-------+  |
|  | Table 5  | | Table 6  | | Table 7  | | Tbl 8 |  |
|  |  FREE    | |  $67.20  | |  FREE    | | FREE  |  |
|  |          | |  5 items  | |          | |       |  |
|  |          | |  2m ago   | |          | |       |  |
|  +----------+ +----------+ +----------+ +-------+  |
|                                                   |
+---------------------------------------------------+
```

Within a table's order view, the standard POS layout appears with:
- `← Back | Table 3` in the header area
- Normal item selector, cart, and checkout flow

---

## 4. Key Behaviors

| Scenario | Behavior |
|----------|----------|
| Table count = 0 | Normal POS, no tables shown |
| Start session → table count > 0 | Show table grid |
| Click empty table | Create draft, enter order view |
| Click occupied table | Load draft, enter order view |
| Back arrow from order view | Auto-save, return to grid |
| Click another table while in one | Auto-save current, switch |
| Clear Table action | Confirm → delete draft → free table |
| Pay (submit invoice) | Return to grid, toast, table freed |
| Close POS session | Cancel all table-linked drafts |

---

## 5. Files to Create

| File | Purpose |
|------|---------|
| `awesome_restaurant3/fixtures/custom_field.json` | POS Profile `restaurant_table_count` + POS Invoice `restaurant_table` |
| `awesome_restaurant3/public/js/pos/restaurant_pos.js` | Page loader override |
| `awesome_restaurant3/public/js/pos/pos_table_selector.js` | Table grid component |
| `awesome_restaurant3/public/js/pos/pos_controller_ext.js` | Controller wrapper/extension |
| `awesome_restaurant3/public/css/pos_table.css` | Table grid styling |
| `awesome_restaurant3/hooks.py` | Activate `page_js` hook |
| `awesome_restaurant3/public/js/pos/whole_pos_app.bundle.js` | Bundle that imports all POS components + table selector |

## 6. Files to Modify

| File | Change |
|------|--------|
| `awesome_restaurant3/hooks.py` | Activate `page_js` and `fixtures` hooks |
| `awesome_restaurant3/modules.txt` | Optionally add module |

---

## 7. Non-Goals
- Floor plan layouts (grid only)
- Persistent tables across sessions (session-scoped)
- Drag-and-drop table placement
- Table shapes or custom table metadata
- Kitchen display / order staging
