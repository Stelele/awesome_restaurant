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

## Architecture Notes

### Restaurant POS Flow
- `page_js = {"point-of-sale": "public/js/pos/restaurant_pos.js"}` in hooks.py injects JS onto the standard ERPNext POS page
- `restaurant_pos.js` overrides `frappe.pages["point-of-sale"].on_page_load` — **must load `point-of-sale.bundle.js` FIRST, then `restaurant_pos.bundle.js` SECOND** (the custom bundle extends `erpnext.PointOfSale.Controller` which only exists after the standard POS bundle loads)
- `RestaurantPosController` extends `erpnext.PointOfSale.Controller` and overrides `make_app()`, `load_table_grid()`, `select_table()`, `go_back_to_tables()`, etc.
- `TableSelector` renders `.pos-table-card` elements in a `.pos-table-grid` inside `.pos-table-grid-wrapper`

### POS Profile Scoping
- Child doctype `POS Table Profile` with a single Link field `pos_profile`
- Tables without any profiles → hidden from ALL POS sessions
- `get_tables_for_profile(pos_profile)` server-side method filters via child table
- `applicable_profiles` child table is always cleaned in `validate()` to strip empty rows

### CSS / Layout
- `.point-of-sale-app` is a 10-column CSS grid from ERPNext
- `.pos-table-grid-wrapper` and `.pos-table-badge` need `grid-column: 1 / -1` to span full width
- CSS rules in `pos_table.css` may be cached by Frappe dev server — consider inline JS fixes (`_fix_table_grid_css()`) if CSS changes don't appear
- Calendar/datepicker overlays leak from POS Invoice forms — cleaned by `_fix_table_grid_css()`

### Draft Flow
- `go_back_to_tables()`: items > 0 → `await this.frm.save()` (draft saved); items == 0 → free the table
- `load_existing_table_draft()`: fetches doc via `frappe.db.get_doc`, syncs with `frappe.model.sync`, refreshes form, loads cart

## Code Style
- Python: tabs (`\t`), double quotes, 110 line length (see `pyproject.toml` ruff config)
- JavaScript: tabs, double quotes (pre-commit runs prettier)
- Don't add comments unless asked

## Data Cleanup
- The `before` hooks in tests create data; `after` hooks run `teardown_pos_table_environment`
- Teardown order: POS Tables → Invoices (cancel first) → Opening Entries (cancel first) → Profiles → Stock Recos → Prices → Items → Customers → Warehouses
- Use `list(frappe.get_all(...))` to avoid cursor issues when iterating and deleting
- Infrastructure data (`_Test POS Profile`, `_Test Item`, `_Test POS Warehouse`, `Walk In Customer`) is created once via `get_or_create_*` and stays across runs
