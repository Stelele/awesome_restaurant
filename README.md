# Awesome Restaurant3

Restaurant-style POS table management for Frappe/ERPNext v16. Extends the standard Point of Sale with a grid-based table selector, profile scoping, tip UI, kitchen order broadcasting, and order locking.

## Value Proposition

Replace the bare ERPNext POS table list with a visual grid of tables. Each table is scoped to a POS Profile, so different cashiers or locations can have independent table sets. Supports tip addition, kitchen order status flow (Received → Ready), and order locking when a table's kitchen status is "Ready".

## Features

| Feature | Description |
|---|---|
| **Table Grid View** | Visual `.pos-table-grid` of all tables with `.pos-table-card` elements. Free/occupied/ready states styled with BEM-scoped CSS. |
| **POS Profile Scoping** | Child doctype `POS Table Profile` links tables to profiles. `make_app()` queries tables filtered by the current `pos_profile` — tables without a profile are hidden from all POS sessions. |
| **Tip UI** | `.add-tip-wrapper` in the totals section. Configurable "Tip Item" Link field on `POS Profile`. NumPad interface for tip amount entry. Tips appear as rows with the `tip-item` class in the cart. |
| **Kitchen Order Broadcasting** | `broadcast_kitchen_update` publishes `kitchen_order_update` realtime event. Kitchen Display page subscribes and renders orders with `.kitchen-card--new`/`.kitchen-card--received`/`.kitchen-card--late` badges on load (`--ready` is added only after staff mark the order ready). |
| **Order Locking** | When `current_table_doc._kitchen_status === "Ready"`, the order is locked: item selector hidden, numpad disabled, customer selection disabled, "Print Bill" button added. Guards against butchery's lock bypass. |
| **Draft Invoice Persistence** | Auto-saved draft invoices persist across navigation (back-to-tables, browser close/reopen, session switch). Persists while any POS Opening Entry is open; when all are closed globally, ALL occupied tables are freed (not per-entry). |
| **Table Badge Actions** | Per-table badge with "Send to Kitchen" button (draft → Received), "Order Ready" label, or navigation back to tables. |
| **Cross-App Compatibility** | Save-and-delegate `on_page_load` pattern. Intercepts `frappe.require("point-of-sale.bundle.js")` to chain-load `restaurant_pos.bundle.js` after the standard bundle. Preserves `pos_expenses` buttons (Add Expense, Reprint Invoices, Refund, New Invoice, Close POS). |

## Installation

### Via Bench CLI

```bash
# From your bench directory
bench get-app https://github.com/Stelele/awesome_restaurant --branch version-16
bench --site <site-name> install-app awesome_restaurant3
```

### Frappe Cloud

1. Add the app from GitHub: `bench get-app https://github.com/Stelele/awesome_restaurant --branch version-16`
2. Install on site: `bench --site <site-name> install-app awesome_restaurant3`

### Required Dependencies

The app depends on these being installed first (Frappe Cloud install order):

```bash
# Framework & dependencies
bench get-app erpnext --branch version-16

# Cross-app dependencies (install in this exact order)
bench get-app https://github.com/Stelele/erpnext-point-of-sale-expenses --branch version-16
bench get-app https://github.com/Stelele/awesome_dashboard_scripts --branch version-16
bench get-app https://github.com/Stelele/awesome-butchery --branch version-16

# Then this app
bench --site <site-name> install-app awesome_restaurant3
```

**Install order matters**: Frappe Cloud installs as: `erpnext` → `pos_expenses` → `awesome_dashboard` → `awesome_butchery` → `awesome_restaurant3`. The `page_js` loading sequence depends on this order (`point_of_sale.js` → `pos_extension.js` → `restaurant_pos.js`).

After installation:

```bash
bench --site <site-name> set-config developer_mode 1
```

## Setup

### POS Profile

Create a `POS Table Profile` record (child table of `POS Table`). Add a `pos_profile` link to associate tables with this profile.

- **`custom_tip_item`** (Link → Item): Non-stock item used for adding tips to restaurant orders.
- Tables without any `applicable_profiles` → hidden from ALL POS sessions.

### Custom Fields

The app provides these custom fields (via `hooks.py` + `fixtures/custom_field.json`, with belt-and-suspenders patches in `patches/v1_0/` — note `is_created_using_pos` is added only by the `add_is_created_using_pos_field.py` patch):

**On `POS Invoice`:**
- `restaurant_table` (Data, after `pos_profile`) — references the table this invoice belongs to
- `custom_tip_amount` (Currency, after `restaurant_table`, read_only=1, allow_on_submit=1)
- `kitchen_status` (Select: `\nReceived\nReady`, after `custom_tip_amount`, read_only=1, allow_on_submit=1)
- `sent_to_kitchen_at` (Datetime, after `kitchen_status`, read_only=1, allow_on_submit=1)
- `is_created_using_pos` (Check, hidden=1, read_only=1, after `is_pos`) — ERPNext v16 compatibility field

**On `POS Invoice Item`:**
- `sent_to_kitchen_at` (Datetime, allow_on_submit=1, read_only=1)

**On `Sales Invoice`:**
- `restaurant_table` (Data, after `pos_profile`)

**On `POS Profile`:**
- `custom_tip_item` (Link → Item, after `allow_discount_change`)

These are automatically created on `bench migrate`. On Frappe Cloud, also run the patches in `patches/v1_0/`.

### Tables

Create `POS Table` records with `table_number` (unique Data) and `status` (Select: `Free\nOccupied`, default `Free`). Link tables to profiles via the `applicable_profiles` child table.

## Usage

### Point of Sale Page

1. Open the POS entry for a profile that has linked tables.
2. The table grid renders inside `.point-of-sale-app` — displaying `.pos-table-card` elements for each table linked to the profile.
3. Click a **Free** table → navigates to the item selection page with an empty cart. The table badge shows the table number.
4. Click an **Occupied** table → restores the draft invoice items into the cart for editing (if the invoice is missing, a new invoice is created and the table stays `Occupied`).
5. Add items via the item selector / numpad. Draft is auto-saved on every item add.
6. Click **Send to Kitchen** on the table badge → calls `send_order_to_kitchen` API, sets `kitchen_status = Received`, badge updates to "Order Sent".
7. In the Kitchen Display, orders appear as `.kitchen-card` elements. Staff can mark an order **Ready** → badge updates to "Order Ready" and the table badge shows "Ready".
8. When the table is paid, the cashier navigates back to the table grid → table is freed (status = `Free`, invoice deleted if docstatus 0).

### Kitchen Display Page

1. Navigate to `/kitchen-display` — only visible to users with the `System Manager` role (the page grants no other role). The `mark_order_ready` API additionally accepts the `Kitchen User` role.
2. Real-time order list updates every 30 seconds and on `kitchen_order_update` realtime event.
3. Each order has a **Ready** button. Staff can mark orders ready — this calls `mark_order_ready` API and updates the badge.

### Order Locking (Ready Orders)

When a table's kitchen status is "Ready":
- Item selector is hidden
- Numapd is disabled
- Customer selection is disabled
- "Print Bill" button appears in the totals section
- Cart modifications are blocked with error: "Order is ready for payment. Cannot modify items."

### Going Back to Tables

- If cart has items → draft invoice is auto-saved, table marked as `Occupied` with `current_invoice` reference.
- If cart is empty → table is freed immediately (status = `Free`, invoice deleted).
- On SPA navigation (POS Close → redirect), the `refresh` handler resets `_restaurant_make_app_done = false` and clears stale DOM.

## Configuration Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `pos_profile` | Link → POS Profile | Required | Scopes which tables are visible in the POS. |
| `custom_tip_item` | Link → Item | — | Non-stock item for tips. Set on `POS Profile`. |
| `selling_price_list` | Data | — | Price list for item selector. Set in POS Profile or via settings. |

**`hooks.py` `page_js`:**

```python
page_js = {
    "point-of-sale": "public/js/pos/restaurant_pos.js",
    "kitchen-display": "public/js/kitchen/kitchen_display.js",
}
```

This injects `restaurant_pos.js` onto the standard ERPNext POS page and `kitchen_display.js` onto the kitchen-display page.

## Troubleshooting / FAQ

| Symptom | Cause | Fix |
|---|---|---|
| Table grid does not render (blank POS page) | No `POS Table Profile` linked to the current profile, or tables have no profiles | Create a `POS Table Profile` and link tables via `applicable_profiles`. |
| Duplicate `.point-of-sale-app` divs | `make_app()` called multiple times without guard | The `_restaurant_make_app_done` flag prevents duplicates. Reset it in the `refresh` handler if needed. |
| `pos_expenses` buttons missing after setup | `on_page_load` chain not executing correctly | Verify `typeof pos.open_expense_modal === 'function'` after on_page_load. The save-and-delegate pattern must call `_orig(wrapper)` first. |
| Kitchen orders not appearing in Kitchen Display | `kitchen_order_update` realtime event not firing | Verify `broadcast_kitchen_update` is called on POS Invoice `on_update`. Check that `kitchen_status` or `docstatus` has changed. |
| Tip not appearing in cart | `custom_tip_item` not configured on POS Profile, or profile has no linked tables | Set `custom_tip_item` on the profile. Tip UI only renders when `table_mode = true` (tables linked to profile). |
| Order lock not preventing modifications | Butchery's `update_cart_html` bypass | Our `update_cart_html()` override checks `_is_order_locked()` first. Ensure both apps are installed and the patch order is correct. |
| CSS changes not appearing on Frappe dev server | Asset caching | Set `developer_mode 1` (`bench --site <site> set-config developer_mode 1`). Clear browser cache. |
| SPA navigation (POS Close → redirect) causes blank page | Guard flags not reset in `refresh` handler | The `refresh` handler MUST reset `wrapper.pos._restaurant_make_app_done = false` and clear `wrapper.pos.wrapper.html("")`. |

## Contributing

1. Fork the repo and create a branch from `version-16`.
2. Follow the code style: Python tabs, double quotes, max 110 chars per line (ruff). JS tabs, double quotes (prettier on pre-commit).
3. Run `bench --site development.localhost set-config allow_tests true` and `bench --site development.localhost run-tests --app awesome_restaurant3` to verify tests pass.
4. For UI tests: `bench --site development.localhost run-ui-tests awesome_restaurant3 --headless`.
5. Commit with concise messages. Pre-commit is configured with ruff, eslint, prettier.
6. Ensure cross-app compatibility: test with `pos_expenses`, `awesome_butchery`, and `awesome_dashboard` installed simultaneously.

### Pre-commit Hook

```bash
cd apps/awesome_restaurant3
pre-commit install
pre-commit run --all-files
```

### CI

GitHub Actions workflows are configured to install the app and run unit tests on every push to the `version-16` branch.

## License

MIT (see `license.txt` — copyright holder Gift Mugweni).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.