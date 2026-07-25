# Awesome Restaurant3 — Agent Instructions

## Project Overview

Frappe v16 custom app providing restaurant-style POS table management. Extends ERPNext's point-of-sale with a grid-based table selector.

## Key Commands

```bash
# Build frontend assets (always after JS/CSS changes)
bench build --app awesome_restaurant3

# Server-side Python tests
bench --site development.localhost set-config allow_tests true
bench --site development.localhost run-tests --app awesome_restaurant3

# Cypress UI tests (headless)
bench --site development.localhost run-ui-tests awesome_restaurant3 --headless

# Run a single Cypress spec
bench --site development.localhost run-ui-tests awesome_restaurant3 --headless --spec "cypress/integration/ui_test_pos_table.js"
```

## Critical Setup Notes

- `bench start` must be running for Cypress tests and browser testing
- `allow_tests true` needed in BOTH site config AND global config: `bench set-config allow_tests true` AND `bench set-config -g allow_tests true`
- `developer_mode 1` on the site to bust CSS/JS caches: `bench --site development.localhost set-config developer_mode 1`
- Admin password is `admin`. Always use `Administrator` / `admin` for login
- Node 24, Python 3.14+

## Cross-App Compatibility

This app MUST coexist with `pos_expenses`, `awesome_butchery`, and `awesome_dashboard` on the same POS page.

### page_js Loading Order

- Frappe concatenates ALL `page_js` scripts from all installed apps **in app installation order**
- Each script's `frappe.pages["point-of-sale"].on_page_load` **overwrites** the previous handler — Frappe does NOT auto-chain
- **ALWAYS** use the save-and-delegate pattern in `restaurant_pos.js`:
  ```js
  var _orig = frappe.pages["point-of-sale"].on_page_load;
  frappe.pages["point-of-sale"].on_page_load = function(wrapper) {
    _orig(wrapper);  // let pos_expenses / erpnext run first
    // ... restaurant setup ...
  };
  ```

### frappe.require Interception Chain

Both this app and `pos_expenses` intercept `frappe.require("point-of-sale.bundle.js")`. When `on_page_load` runs:
- `pos_expenses` handler runs first (outermost `on_page_load`)
- It installs its `frappe.require` wrapper, then calls restaurant's handler
- Restaurant's handler installs ANOTHER `frappe.require` wrapper (overwrites pos_expenses)
- Restaurant's wrapper is **outermost** when erpnext default calls `frappe.require("point-of-sale.bundle.js")`
- Interception order: restaurant wrapper → pos_expenses wrapper → original frappe.require
- Callback fire order: pos_expenses patches Controller → restaurant loads bundle → erpnext creates instance

### Preserving pos_expenses Buttons

pos_expenses replaces `erpnext.PointOfSale.Controller` with an extended class that overrides `prepare_btns()`. To preserve these buttons:

- **DO NOT** use `Object.setPrototypeOf(pos, RestaurantPosController.prototype)` — this replaces the prototype chain, losing pos_expenses methods
- **DO** copy RestaurantPosController methods directly onto the instance as own properties
- **DO** explicitly copy pos_expenses methods if the prototype chain is broken:
  ```js
  if (typeof pos.open_expense_modal !== "function") {
    pos.prepare_btns = erpnext.PointOfSale.Controller.prototype.prepare_btns;
    pos.open_expense_modal = erpnext.PointOfSale.Controller.prototype.open_expense_modal;
    // ... etc
  }
  ```

### RestaurantPosController Inheritance Order

`RestaurantPosController extends erpnext.PointOfSale.Controller` must evaluate AFTER pos_expenses patches. The `frappe.require` interception ensures this, but bundle caching on SPA navigations can cause the extends clause to evaluate before the patch. Always verify with `typeof pos.open_expense_modal === 'function'` after setup.

## SPA Navigation & Page Lifecycle

### on_page_load vs refresh vs on_page_show

- `on_page_load`: fires **ONCE**, on first page visit (full page load)
- `refresh`: fires on **EVERY** SPA revisit (POS Close → redirect, sidebar click)
- `on_page_show`: fires on **EVERY** SPA revisit (after refresh)

### POS Close → Redirect Is SPA Navigation

`pos_expenses` redirects to `/point-of-sale` via `frappe.set_route()` after closing session. This is SPA, NOT full reload. The `refresh` handler fires, NOT `on_page_load`.

### Critical: Reset Guards in refresh

```js
frappe.pages["point-of-sale"].refresh = function(wrapper) {
  wrapper.pos._restaurant_make_app_done = false; // MUST reset
  wrapper.pos.wrapper.html("");                   // clear stale DOM
  wrapper.pos.check_opening_entry();              // re-init (shows opening entry dialog if closed)
};
```

- Do NOT gate `check_opening_entry()` behind `document.scannerDetectionData`
- ALWAYS reset `_restaurant_make_app_done` before re-init — the guard prevents `make_app()` from running on revisit otherwise

## Controller Initialization Flow

### Initial Setup Sequence

1. `_wait_for_profile` poll: waits for `pos.pos_profile` to be set
2. Sets `frm_doctype` default to `"POS Invoice"` if settings AJAX hasn't completed
3. Monkey-patches `erpnext.PointOfSale.Controller.prototype.make_app` to no-op (prevents standard POS render)
4. Detaches `onScan` (with `isAttachedTo` + try-catch), removes stale `.point-of-sale-app` divs
5. Resets all component state (`cart`, `item_selector`, `payment`, etc.)
6. Copies RestaurantPosController methods onto instance
7. Copies pos_expenses methods if unreachable
8. Calls `pos.make_app()` — restaurant setup
9. Restores original `make_app` after async completes

### make_app() Idempotency

- Sets `this._restaurant_make_app_done = true` after first render
- Guards against duplicate calls from AJAX callbacks: `if (this._restaurant_make_app_done) return;`
- Reset to `false` in the `refresh` handler for SPA navigation re-init

### prepare_dom() Idempotency

- Check if `.point-of-sale-app` already exists in the wrapper before appending
- Multiple `prepare_dom()` calls (from duplicated `make_app()`) must not create extra divs

### Blocking Standard Controller Rendering

The standard erpnext controller's `prepare_app_defaults()` AJAX chain calls `this.make_app()` at the end. We monkey-patch `erpnext.PointOfSale.Controller.prototype.make_app` to no-op during our setup window. This prevents the standard POS from flashing before the restaurant grid renders.

### onScan Handling

- `ItemSelector.bind_events()` calls `onScan.attachTo(document)` — can throw if already attached
- Always check `onScan.isAttachedTo(document)` BEFORE calling `onScan.detachFrom(document)`
- Always wrap detach/attach in try-catch — the onScan library throws on uninitialized state
- Called in: `init_item_selector()`, restaurant_pos.js setup, refresh handler

## Custom Field & Fixture Deployment

### Custom Fields on Frappe Cloud

`custom_fields` in `hooks.py` may NOT apply on Frappe Cloud during deployment. Always provide ALL three:
1. `custom_fields` dict in `hooks.py` (works locally)
2. `fixtures/custom_field.json` with ALL fields in the `fixtures/` directory
3. `fixtures = ["Custom Field"]` in `hooks.py`
4. A patch in `patches/` that calls `create_custom_fields()` — belt-and-suspenders

### Fixture JSON Format

Each record in `fixtures/custom_field.json` MUST have:
- `"name": "{dt}-{fieldname}"` (e.g. `"POS Invoice-restaurant_table"`)
- `"doctype": "Custom Field"`
- `"module": "Awesome Restaurant3"`

Without the `name` field, `import_file_by_path` throws `KeyError: 'name'`.

### ERPNext v16 Bug: is_created_using_pos

`reset_mode_of_payments` calls `update_multi_mode_option` which accesses `doc.is_created_using_pos`. This field exists on `SalesInvoice` but NOT on `POSInvoice` in ERPNext v16. Fix: add as custom field to POS Invoice.

## External App Interactions

### pos_expenses (pos_extension.js)

- Overrides `prepare_btns()` — clears page actions, adds 5 inner toolbar buttons
- Buttons: Add Expense, Reprint Invoices, Refund, New Invoice, Close POS
- Redirects to `/point-of-sale` on Closing Entry submit (SPA navigation)
- Uses `doctype_js` on "POS Closing Entry" — no conflict with our `doc_events`
- No `app_include_css` or `app_include_js` — zero global CSS leakage
- Requires `frappe.require("point-of-sale.bundle.js")` interception to patch Controller

### awesome_butchery (pos_quick_qty.js)

- Polls every 50ms initially, then 500ms forever for `erpnext.PointOfSale.ItemSelector`
- Monkey-patches `ItemSelector.prototype.bind_events`
- Replaces `.item-wrapper` click handler with quantity dialog
- Only activates when POS Profile has `show_quantity_dialog = 1`
- **Order lock bypass**: for existing cart items, directly modifies frm without checking `_is_order_locked()`
- **Fixed in our code**: `RestaurantPosController.update_cart_html()` now checks `_is_order_locked()` before allowing modifications
- CSS: `.qty-dialog-numpad-wrapper` — well-scoped, no conflicts
- Uses `window.cur_pos` to access controller — works because the instance object persists

### awesome_dashboard (awesome_dashboard_scripts)

- **No frontend impact** — zero JS/CSS files
- Only ships fixtures (Role: Awesome Dashboard User, 17 Custom DocPerm)
- Server-side API queries POS Invoice data for dashboard metrics
- Does NOT hook into the POS page in any way

## CSS

- `pos_table.css` and `kitchen_display.css` loaded via `app_include_css` — affects **every** desk page globally
- Keep selectors BEM-scoped with `pos-table-*` prefix to avoid accidental matches
- `pos-order-locked` class hides `.add-discount-wrapper` and `.reset-customer-btn` with `!important`
- Sticky cart/payment sections use `z-index: 1` — could overlap with toolbar elements
- `kitchen_display.css` only needed on kitchen-display page but currently loaded everywhere
- Tip UI styles (`.add-tip-wrapper`, `.tip-amount-container`) — unscoped classes, but specific enough

## Architecture Notes

### Restaurant POS Flow
- `page_js = {"point-of-sale": "public/js/pos/restaurant_pos.js"}` in hooks.py injects JS onto the standard ERPNext POS page
- `restaurant_pos.js` uses save-and-delegate `on_page_load` pattern for cross-app compatibility
- `restaurant_pos.js` intercepts `frappe.require("point-of-sale.bundle.js")` to chain-load `restaurant_pos.bundle.js` AFTER the standard bundle
- `RestaurantPosController` extends `erpnext.PointOfSale.Controller` and overrides `make_app()`, `init_item_cart()`, `init_item_selector()`, `init_payments()`, `init_order_summary()`, `make_new_invoice()`, `new_invoice_event()`, `close_pos()`, `on_cart_update()`, `remove_item_from_cart()`, `toggle_submitted_invoice_summary()`, `prepare_dom()`, `update_cart_html()`
- `TableSelector` renders `.pos-table-card` elements in a `.pos-table-grid` inside `.pos-table-grid-wrapper`

### POS Profile Scoping
- Child doctype `POS Table Profile` with a single Link field `pos_profile`
- Tables without any profiles → hidden from ALL POS sessions
- `get_tables_for_profile(pos_profile)` server-side method filters via child table
- `applicable_profiles` child table is always cleaned in `validate()` to strip empty rows
- `make_app()` queries tables filtered by CURRENT `pos_profile` — not global count

### CSS / Layout
- `.point-of-sale-app` is a 10-column CSS grid from ERPNext
- `.pos-table-grid-wrapper` and `.pos-table-badge` need `grid-column: 1 / -1` to span full width
- CSS rules in `pos_table.css` may be cached by Frappe dev server — consider inline JS fixes (`_fix_table_grid_css()`) if CSS changes don't appear
- Calendar/datepicker overlays leak from POS Invoice forms — cleaned by `_fix_table_grid_css()`

### Draft Flow
- `go_back_to_tables()`: items > 0 → `await this.frm.save()` (draft saved); items == 0 → free the table
- `load_existing_table_draft()`: fetches doc via `frappe.db.get_doc`, syncs with `frappe.model.sync`, refreshes form, loads cart

### Order Locking
- `_is_order_locked()` returns true when `current_table_doc._kitchen_status === "Ready"`
- Locked orders: item selector hidden, numpad disabled, customer selection disabled
- "Print Bill" button added for locked orders
- `update_cart_html()` overridden to guard against butchery's lock bypass

## Pre-Deploy Testing Checklist

Before deploying to Frappe Cloud, verify EVERY item:

- [ ] Page loads with EXACTLY 1 `.point-of-sale-app` div (no duplicates)
- [ ] Restaurant table grid renders for profiles WITH linked tables
- [ ] Standard POS renders for profiles WITHOUT linked tables (no blank page)
- [ ] pos_expenses buttons (Add Expense, Reprint Invoices, Refund, New Invoice, Close POS) appear in Menu
- [ ] Closing POS session → redirect — page reinitializes correctly (NOT blank)
- [ ] Clicking tables (free, occupied, ready) — no duplicate elements, no `onScan` errors
- [ ] Navigate back and forth 5+ times — no cumulative DOM growth
- [ ] Tip button ONLY shows for restaurant-table profiles (not standard POS)
- [ ] Tip button IS visible for restaurant-table profiles
- [ ] Butchery quantity dialog works (if `show_quantity_dialog` enabled on profile)
- [ ] Order lock prevents cart modifications on ready orders
- [ ] `bench migrate` succeeds with no fixture errors or KeyError
- [ ] Custom fields (restaurant_table, kitchen_status, is_created_using_pos, etc.) exist on POS Invoice

## Test Infrastructure

### Test helpers (`tests/ui_test_helpers.py`)
- `setup_pos_table_environment()` — creates 4 tables, POS Profile, Opening Entry, test item/warehouse. Deletes all existing tables first. Assigns `_Test POS Profile` to each table's `applicable_profiles`.
- `teardown_pos_table_environment()` — deletes ALL tables, invoices, opening entries, profiles, items, customers, warehouses in dependency order. Never use `frappe.db.rollback()` inside exception handlers — use `pass` instead.
- `seat_table(table_number, qty)` — creates draft invoice with items for a table (API-only, not from UI)
- `complete_order(table_number)` — submits invoice and frees table

### Cypress Gotchas
- **CSRF token**: `cy.call()` needs `frappe.csrf_token` from a loaded Frappe page. Always call `cy.visit("/app")` before any `cy.call()` in `before`/`after` hooks.
- **Session management**: `cy.login()` uses `cy.session()` for caching. After login, you're on the Cypress spec runner page, not a Frappe page — hence the `cy.visit("/app")` rule above.
- **Cypress plugins** (testing-library, drag-drop, etc.): The `run-ui-tests` CLI installs them into `../frappe/node_modules/`, but the app's Webpack can't resolve sibling node_modules. These MUST be in the app's own `package.json` devDependencies.
- **Custom commands** in `cypress/support/pos_commands.js`: `cy.select_table(n)`, `cy.go_back_from_table()`, `cy.clear_table_via_ui(n)`, `cy.assert_table_card_count(n)`, `cy.assert_table_status(n, status)`.
- **SpecPattern** in `cypress.config.js`: only `./cypress/integration/*.js`. Test files must be directly in that directory.

### Python Tests
- The `TestPOSTable` class fails `setUpClass` due to ERPNext's `BootStrapTestData` colliding with existing Price Lists. This is a pre-existing framework issue — the 4 function-based utility tests (`test_pos_table_utils.py`) pass correctly.

## Code Style
- Python: tabs (`\t`), double quotes, 110 line length (see `pyproject.toml` ruff config)
- JavaScript: tabs, double quotes (pre-commit runs prettier)
- Don't add comments unless asked

## Data Cleanup
- The `before` hooks in tests create data; `after` hooks run `teardown_pos_table_environment`
- Teardown order: POS Tables → Invoices (cancel first) → Opening Entries (cancel first) → Profiles → Stock Recos → Prices → Items → Customers → Warehouses
- Use `list(frappe.get_all(...))` to avoid cursor issues when iterating and deleting
- Infrastructure data (`_Test POS Profile`, `_Test Item`, `_Test POS Warehouse`, `Walk In Customer`) is created once via `get_or_create_*` and stays across runs

## Frappe Cloud Parity Bench

The local bench uses Frappe/ERPNext v17 develop — production is v16. To catch production-only bugs, maintain a separate v16 bench that mirrors the Frappe Cloud app install order exactly.

### Setup

```bash
bench init ../frappe-bench-version-16 --frappe-branch version-16
cd ../frappe-bench-version-16

# Apps in Frappe Cloud install order (critical for page_js load sequence)
bench get-app erpnext --branch version-16
bench get-app https://github.com/Stelele/erpnext-point-of-sale-expenses --branch version-16
bench get-app https://github.com/Stelele/awesome_dashboard_scripts --branch version-16
bench get-app https://github.com/Stelele/awesome-butchery --branch version-16
bench get-app https://github.com/Stelele/awesome_restaurant --branch version-16

bench new-site development.localhost --admin-password admin

# Install in Frappe Cloud order
bench --site development.localhost install-app erpnext
bench --site development.localhost install-app pos_expenses
bench --site development.localhost install-app awesome_dashboard
bench --site development.localhost install-app awesome_butchery
bench --site development.localhost install-app awesome_restaurant3

bench --site development.localhost set-config developer_mode 1
```

### Install Order Matters

Frappe Cloud app order (from Apps page):
1. Frappe Framework (v16.28.0)
2. Builder
3. Insights
4. **ERPNext** (v16.29.0)
5. Email Delivery Service
6. Print Designer
7. **Pos Expenses**
8. **Awesome Dashboard**
9. **Awesome Butchery**
10. **Awesome Restaurant3**

`page_js` for `point-of-sale` is set by ERPNext (`point_of_sale.js`), pos_expenses (`pos_extension.js`), and awesome_restaurant3 (`restaurant_pos.js`). These load in install order:
- `point_of_sale.js` → `pos_extension.js` → `restaurant_pos.js`

So `pos_extension.js` wraps `point_of_sale.js`, and `restaurant_pos.js` wraps `pos_extension.js`. This is the same order our code expects (saves `_orig_on_page_load`, delegates to pos_expenses first).

### Testing in the Parity Bench

- Set `developer_mode 0` to test production asset caching
- Always test SPA navigation: POS Close → redirect (NOT full page reload)
- Always test with `pos_expenses` AND `awesome_butchery` AND `awesome_dashboard` installed
- Verify `Object.getOwnPropertyNames` on `erpnext.PointOfSale.Controller.prototype` includes `open_expense_modal` after on_page_load
- Verify `typeof pos.open_expense_modal === 'function'` after setup
