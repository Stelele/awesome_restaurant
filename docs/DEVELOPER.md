# Developer Guide: Awesome Restaurant3

## Project Structure

```
awesome_restaurant3/
├── awesome_restaurant3/          # Python package
│   ├── __init__.py
│   ├── hooks.py                   # App configuration, custom fields, doc events
│   ├── pos_table_utils.py         # Whitelisted methods, realtime publishers
│   ├── patches/v1_0/              # DB migration patches (3 patches)
│   ├── fixtures/custom_field.json # Custom Field fixture records
│   ├── doctype/pos_table/         # POS Table DocType (+ pos_table_list.js)
│   ├── doctype/pos_table_profile/ # POS Table Profile child table
│   └── page/kitchen_display/      # Kitchen display page definition
├── public/                        # Static assets (served as /assets/awesome_restaurant3/...)
│   ├── css/                       # BEM-scoped CSS (pos_table.css, kitchen_display.css)
│   └── js/
│       ├── pos/                   # restaurant_pos.js, restaurant_pos_controller.js,
│       │                          # restaurant_table_selector.js, restaurant_pos.bundle.js
│       └── kitchen/               # kitchen_display.js, kitchen_display_controller.js,
│                                  # order_queue.js, kitchen_display.bundle.js
├── testing/                       # Python unit tests
│   └── features/                  # Gherkin feature files (6: checkout, concurrent_access,
│                                  # draft_invoice, item_ordering, multi_table, table_selection)
└── docs/                          # This directory
    ├── USER_GUIDE.md              # End-user documentation
    └── DEVELOPER.md               # This file
```

## Architecture Overview

### POS Flow

1. **`hooks.py`** sets `page_js = {"point-of-sale": "public/js/pos/restaurant_pos.js"}` — injects the restaurant POS script onto the standard ERPNext POS page.
2. **`restaurant_pos.js`** uses a save-and-delegate `on_page_load` pattern:
   - Saves `_orig_on_page_load = frappe.pages["point-of-sale"].on_page_load`
   - Replaces it with a handler that intercepts `frappe.require("point-of-sale.bundle.js")`
   - Chains to load `restaurant_pos.bundle.js` after the standard bundle
   - Calls `_orig(wrapper)` first so pos_expenses/erpnext initialize first
3. **`frappe.require` interception** chain (3-way):
   - `pos_expenses` handler runs first (outermost)
   - Restaurant's handler wraps/overwrites it
   - Restaurant's wrapper is outermost when erpnext's default `frappe.require` runs
   - Callback fire order: pos_expenses patches Controller → restaurant loads bundle → erpnext creates instance
4. **`RestaurantPosController`** (in `restaurant_pos_controller.js`) extends `erpnext.PointOfSale.Controller` and overrides:
   - `make_app()` — renders table grid, initializes tip UI, loads table selector
   - `init_item_cart()` — guards against order locking, copies pos_expenses methods
   - `init_item_selector()` — detaches onScan, checks `_is_order_locked()` before item selection
   - `init_payments()` — locks down UI when order is Ready
   - `init_order_summary()` — skips to table grid if in table mode
   - `make_new_invoice()`, `new_invoice_event()`, `close_pos()` — table-mode aware
   - `on_cart_update()`, `remove_item_from_cart()` — order lock guards
   - `prepare_dom()`, `update_cart_html()` — idempotent DOM, lock guards
   - `toggle_submitted_invoice_summary()`, `go_back_to_tables()`, `select_table()` — draft flow
   - `send_to_kitchen()`, `render_table_badge()`, `send_to_kitchen()` — kitchen integration
5. **`TableSelector`** renders `.pos-table-card` elements in a `.pos-table-grid` inside `.pos-table-grid-wrapper`. Clicks select a table or clear it.
6. **Kitchen Display** (`/kitchen-display`) — separate page with `KitchenDisplayController` that subscribes to `kitchen_order_update` realtime events and renders `.kitchen-card` elements. Note: the page permission grants `System Manager` only, while `kitchen_display.js` gates on `Kitchen User` or `System Manager` — the page denies Kitchen Users what the JS would allow (latent mismatch).

### Profile Scoping

- **`POS Table Profile`** is a table child doctype with a single `pos_profile` Link field.
- Tables without any `applicable_profiles` → hidden from ALL POS sessions.
- `make_app()` queries `POS Table` filtered by `["POS Table Profile", "pos_profile", "=", this.pos_profile]`.
- `get_tables_for_profile(pos_profile)` server-side method filters via the child table.

### Real-time Events

| Event | Publisher | Payload | Consumer |
|---|---|---|---|
| `pos_table_update` | `pos_table_utils.broadcast_table_update` | `{table_number, status, current_invoice, ...}` | `RestaurantPosController` → `table_selector.update_table()` |
| `kitchen_order_update` | `pos_table_utils.broadcast_kitchen_update` | `{invoice, kitchen_status, sent_to_kitchen_at, items, ...}` | `KitchenDisplayController` → render/update cards |

### Order Locking

- `_is_order_locked()` returns `true` when `current_table_doc._kitchen_status === "Ready"`.
- Locked state: item selector hidden, numpad disabled, customer selection disabled, "Print Bill" button added.
- Guarded in: `init_item_cart`, `init_item_selector`, `init_payments`, `update_cart_html`, `remove_item_from_cart`. Note: `_show_tip_dialog` and `_add_tip_to_cart` have no lock check — tips can still be added on Ready orders.

### Cross-App Compatibility

- This app coexists with `pos_expenses`, `awesome_butchery`, and `awesome_dashboard`.
- **Critical**: `page_js` loading order depends on install order (`erpnext` → `pos_expenses` → `awesome_dashboard` → `awesome_butchery` → `awesome_restaurant3`).
- `restaurant_pos.js` uses save-and-delegate `on_page_load` to preserve pos_expenses handlers.
- `frappe.require("point-of-sale.bundle.js")` interception ensures `RestaurantPosController` methods are copied onto the instance AFTER pos_expenses patches.
- `update_cart_html()` guards against butchery's lock bypass by checking `_is_order_locked()` first.

## Hooks

### `hooks.py` Key Settings

- `app_name`, `app_title`, `app_publisher`, `app_description`, `app_license`
- `fixtures = ["Custom Field"]` — ensures custom field fixtures are imported on `bench migrate`
- `custom_fields` dict — defines custom fields on `POS Invoice`, `POS Invoice Item`, `Sales Invoice`, `POS Profile`
- `doc_events`:
  - `"POS Closing Entry"` → `on_submit: "free_tables_if_all_sessions_closed"`
  - `"POS Table"` → `on_update: "broadcast_table_update"`
  - `"POS Invoice"` → `on_update: "broadcast_kitchen_update"`
- `page_js`:
  - `"point-of-sale": "public/js/pos/restaurant_pos.js"`
  - `"kitchen-display": "public/js/kitchen/kitchen_display.js"`

### Doc Events

| DocType | Event | Method |
|---|---|---|
| POS Closing Entry | on_submit | `awesome_restaurant3.awesome_restaurant3.pos_table_utils.free_tables_if_all_sessions_closed` |
| POS Table | on_update | `awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_table_update` |
| POS Invoice | on_update | `awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_kitchen_update` |

## Whitelisted APIs (`/api/method/`)

All methods are accessible via `frappe.call({method: "..."})` or `frappe.xcall()`.

| URL | Method | Description |
|---|---|---|
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_table_update` | `broadcast_table_update(doc, method=None)` | Publishes `pos_table_update` realtime event with table state. Called on `POS Table` `on_update`. |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.free_tables_if_all_sessions_closed` | `free_tables_if_all_sessions_closed(doc=None, method=None)` | On `POS Closing Entry` submit: if no open POS Opening Entries remain, frees all `Occupied` POS Tables (resets status, current_invoice, current_invoice_doctype). |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_kitchen_update` | `broadcast_kitchen_update(doc, method=None)` | Publishes `kitchen_order_update` realtime event. Only fires if `kitchen_status` or `docstatus` has changed. Payload includes invoice, kitchen_status, sent_to_kitchen_at, items, should_remove. |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.send_order_to_kitchen` | `send_order_to_kitchen(invoice_name)` | Marks an invoice as sent to kitchen. Sets `kitchen_status = Received`, sets `sent_to_kitchen_at = now`. Only draft invoices (docstatus 0). Emits `kitchen_order_update` event. |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.mark_order_ready` | `mark_order_ready(invoice_name)` | Requires `Kitchen User` or `System Manager` role. Atomic DB update: sets `kitchen_status = Ready` on `POS Invoice`. Emits comment. If table has `restaurant_table`, publishes `pos_table_update` with `kitchen_status: Ready`. |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.get_kitchen_orders` | `get_kitchen_orders()` | Returns all active kitchen orders (status = `Received`), ordered by `sent_to_kitchen_at`. SQL query joins `tabPOS Invoice` + `tabPOS Invoice Item`. |
| `/api/method/awesome_restaurant3.awesome_restaurant3.pos_table_utils.get_tip_item_code` | `get_tip_item_code(pos_profile)` | Returns the tip item code configured on a `POS Profile` (Link → `custom_tip_item`). Returns `""` if not set. |

### Verified Endpoint URLs

All URLs match the actual Python module path under `awesome_restaurant3/awesome_restaurant3/`:

```
awesome_restaurant3/
├── pos_table_utils.py  ← all /api/method/ entries above originate from here
```

## DocType Schemas

### POS Table (`pos_table.json`)

| Field | Fieldtype | Options | Required | Unique | Notes |
|---|---|---|---|---|---|
| `table_number` | Data | — | Yes | Yes | Naming rule: `field:table_number` |
| `status` | Select | `Free\nOccupied` | No | No | Default: `Free` |
| `column_break_3` | Column Break | — | No | No | Layout |
| `current_invoice` | Data | — | No | No | Read-only |
| `current_invoice_doctype` | Link | DocType | No | No | Link to `DocType` |
| `current_total` | Currency | — | No | No | Read-only |
| `current_item_count` | Int | — | No | No | Read-only |
| `occupied_at` | Datetime | — | No | No | Read-only |
| `applicable_profiles_section` | Section Break | — | No | No | Label: "Applicable POS Profiles" |
| `applicable_profiles` | Table | POS Table Profile | No | No | Child table, options: `POS Table Profile` |

### POS Table Profile (`pos_table_profile.json`)

| Field | Fieldtype | Options | Required | Notes |
|---|---|---|---|---|
| `pos_profile` | Link | POS Profile | Yes | Child table (`istable: 1`), quick_entry: 1 |

### POS Invoice (custom fields added by hooks/patches)

| Field | Fieldtype | Options | Default | Notes |
|---|---|---|---|---|
| `restaurant_table` | Data | — | — | References `POS Table.name` |
| `custom_tip_amount` | Currency | — | — | Read-only, allow_on_submit=1 |
| `kitchen_status` | Select | `\nReceived\nReady` | — | Read-only, allow_on_submit=1 |
| `sent_to_kitchen_at` | Datetime | — | — | Read-only, allow_on_submit=1 |
| `is_created_using_pos` | Check | — | 1 | Hidden=1, Read-only (ERPNext v16 compatibility) |

### POS Invoice Item (custom fields added by hooks/patches)

| Field | Fieldtype | Options | Default | Notes |
|---|---|---|---|---|
| `sent_to_kitchen_at` | Datetime | — | — | allow_on_submit=1, read_only=1 |

### Sales Invoice (custom fields added by hooks/patches)

| Field | Fieldtype | Options | Default | Notes |
|---|---|---|---|---|
| `restaurant_table` | Data | — | — | After `pos_profile` |

### POS Profile (custom fields added by hooks/patches)

| Field | Fieldtype | Options | Default | Notes |
|---|---|---|---|---|
| `custom_tip_item` | Link | Item | — | After `allow_discount_change`, description: "Non-stock item used for adding tips" |

## Development Setup

### Python Dependencies

```toml
# pyproject.toml
[tool.bench.frappe-dependencies]
frappe = ">=16.0.0,<=17.0.0"
```

### Node Dependencies

```json
# package.json
{
  "devDependencies": {
    "cypress": "13.17.0",
    "@4tw/cypress-drag-drop": "^2",
    "@cypress/code-coverage": "^3",
    "@testing-library/cypress": "^10",
    "cypress-real-events": "*",
    "cypress-split": "^1.0.0"
  }
}
```

### Bench Commands (verified against this repo)

```bash
# Install erpnext first (required dependency)
bench get-app erpnext --branch version-16

# Install cross-app dependencies in exact order
bench get-app https://github.com/Stelele/erpnext-point-of-sale-expenses --branch version-16
bench get-app https://github.com/Stelele/awesome_dashboard_scripts --branch version-16
bench get-app https://github.com/Stelele/awesome-butchery --branch version-16

# Install this app
bench --site development.localhost install-app awesome_restaurant3

# Enable tests
bench --site development.localhost set-config allow_tests true
bench set-config -g allow_tests true

# Developer mode (busts CSS/JS caches)
bench --site development.localhost set-config developer_mode 1

# Build frontend assets (always after JS/CSS changes)
bench build --app awesome_restaurant3

# Run Python unit tests
bench --site development.localhost run-tests --app awesome_restaurant3

# Run Cypress UI tests (headless)
bench --site development.localhost run-ui-tests awesome_restaurant3 --headless

# Run a single Cypress spec (path is an example placeholder — no cypress/ dir is committed;
# place your spec under a local cypress/integration/, e.g. cypress/integration/ui_test_pos_table.js)
bench --site development.localhost run-ui-tests awesome_restaurant3 --headless --spec "cypress/integration/ui_test_pos_table.js"
```

### Test Infrastructure

**Python tests** (`awesome_restaurant3/doctype/pos_table/test_pos_table.py`):

- `TestPOSTable.setUpClass` fails due to ERPNext `BootStrapTestData` colliding with existing Price Lists — known framework issue.
- 4 function-based utility tests (`test_pos_table_utils.py`) pass correctly.
- Test helpers: `setup_pos_table_environment()`, `teardown_pos_table_environment()`, `seat_table()`, `complete_order()`.

**UI tests** (`testing/features/*.feature`, run via `bench --site <site> run-ui-tests awesome_restaurant3 --headless`):

- 6 Gherkin feature files covering checkout, concurrent_access, draft_invoice, item_ordering, multi_table, table_selection.
- No `cypress/` spec folder is committed; `cypress.config.js` specPattern is `./cypress/integration/*.js`.
- **Gotchas**: CSRF token requires `cy.visit("/app")` before `cy.call()`. Custom commands (for specs placed under `cypress/support/`, e.g. `pos_commands.js`): `cy.select_table(n)`, `cy.go_back_from_table()`, `cy.clear_table_via_ui(n)`, `cy.assert_table_card_count(n)`, `cy.assert_table_status(n, status)`.

**Before running tests**:

```bash
bench --site development.localhost set-config allow_tests true
bench set-config -g allow_tests true
```

### Patches

Patches are executed via `bench migrate` and run in the order listed in `patches.txt`:

```
[pre_model_sync]
# (empty — no pre-model patches)

[post_model_sync]
awesome_restaurant3.awesome_restaurant3.patches.v1_0.ensure_all_custom_fields
awesome_restaurant3.awesome_restaurant3.patches.v1_0.add_kitchen_fields_and_index
awesome_restaurant3.awesome_restaurant3.patches.v1_0.add_is_created_using_pos_field
```

Each patch calls `create_custom_fields()` and may add DB indexes. Note: `idx_kitchen_queue` is created by both `ensure_all_custom_fields` and `add_kitchen_fields_and_index` (both `CREATE INDEX IF NOT EXISTS`, rerun-safe), and `is_created_using_pos` is added only by `add_is_created_using_pos_field`. On Frappe Cloud, these must run after `bench migrate` succeeds.

### Code Style

- **Python**: tabs (`\t`), double quotes, max 110 chars/line (ruff config in `pyproject.toml`).
- **JavaScript**: tabs, double quotes (pre-commit runs prettier).
- Ruff config ignores: `B017`, `B018`, `B023`, `B904`, `E101`, `E402`, `E501`, `E741`, `F401`, `F403`, `F405`, `F722`, `W191`, `UP030-UP040`.
- Don't add comments unless asked.

### Frappe Cloud Parity

The local bench uses Frappe/ERPNext v17 develop. Production is v16. Maintain a separate v16 bench that mirrors the Frappe Cloud app install order exactly (see README.md for the full benchmark setup).

## Additional Notes

### ERPNext v16 Bug: `is_created_using_pos`

`reset_mode_of_payments` calls `update_multi_mode_option` which accesses `doc.is_created_using_pos`. This field exists on `SalesInvoice` but NOT on `POSInvoice` in ERPNext v16. Fix: add as custom field to POS Invoice (already done via `is_created_using_pos` check in `hooks.py` custom_fields and `add_is_created_using_pos_field.py` patch).

### onScan Handling

- In `init_item_selector()` and restaurant_pos.js setup: always check `onScan.isAttachedTo(document)` BEFORE calling `onScan.detachFrom(document)`.
- Always wrap detach/attach in try-catch — the onScan library throws on uninitialized state.
- Called in: `init_item_selector()`, restaurant_pos.js setup. Note: the `refresh` handler (`restaurant_pos.js:82-91`) uses a bare `detachFrom` guarded only by a `scannerDetectionData` check (no `isAttachedTo`, no try-catch).

### CSS Best Practices

- Keep selectors BEM-scoped with `pos-table-*` prefix to avoid accidental matches.
- `pos-order-locked` class hides `.add-discount-wrapper` and `.reset-customer-btn` with `!important`.
- `.point-of-sale-app > .pos-table-grid-wrapper` and `.point-of-sale-app > .pos-table-badge` need `grid-column: 1 / -1` to span full width.
- Calendar/datepicker overlays leak from POS Invoice forms — cleaned by `_fix_table_grid_css()`.
- `kitchen_display.css` is loaded everywhere via `app_include_css` but only needed on `/kitchen-display` page.

### SPA Navigation & Page Lifecycle

- `on_page_load`: fires **ONCE**, on first page visit.
- `refresh`: fires on **EVERY** SPA revisit (POS Close → redirect, sidebar click).
- `on_page_show`: fires on **EVERY** SPA revisit (after refresh).
- **Critical**: `refresh` handler MUST reset `wrapper.pos._restaurant_make_app_done = false` and clear `wrapper.pos.wrapper.html("")` — otherwise `make_app()` guards prevent re-init.
- Never gate `check_opening_entry()` behind `document.scannerDetectionData`.
- POS Close → redirect is SPA navigation (NOT full reload).