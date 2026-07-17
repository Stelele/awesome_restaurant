# POS Table Enhancements — Design Spec

**Date:** 2026-07-17
**App:** `awesome_restaurant3`
**Goal:** Add POS Profile scoping, bulk table creation, UI fixes, and comprehensive test coverage.

---

## 1. POS Profile Scoping

### 1.1 New Child Doctype: `POS Table Profile`

Child table on `POS Table`, scoping which POS Profiles can access each table. Tables without any profile assigned are hidden from all POS sessions.

| Field | Type | Description |
|-------|------|-------------|
| `pos_profile` | Link → POS Profile | Which POS Profile this table is visible for |

Markup: `istable: 1`, `editable_grid: 1`, no permissions, quick entry.

### 1.2 `POS Table` Modifications

Add to `pos_table.json`:

```
field_order: [..., "applicable_profiles_section", "applicable_profiles"]
```

| Field | Type | Label |
|-------|------|-------|
| `applicable_profiles_section` | Section Break | Applicable POS Profiles |
| `applicable_profiles` | Table → POS Table Profile | Applicable POS Profiles |

### 1.3 Controller Filtering

`load_table_grid()` in `restaurant_pos_controller.js` fetches only tables where `applicable_profiles.pos_profile` matches `this.pos_profile`.

---

## 2. Bulk Table Creation

### 2.1 List View Override

`pos_table_list.js` overrides `frappe.listview_settings["POS Table"].primary_action` with a `frappe.ui.Dialog` containing a child table grid for entering multiple table numbers.

### 2.2 Server-Side Batch Insert

`bulk_create_tables(tables)` method in `pos_table.py` — accepts a list of table data, inserts each, returns created + errors.

### 2.3 UI Components

Use `frappe.ui.Dialog` with a `Table` field containing: `table_number` (Data, required), `status` (Select: Free/Occupied, default Free), `pos_profile` (Link → POS Profile, for child table row). Primary action calls the server-side method.

---

## 3. UI Fixes

### 3.1 Table Grid Full Width

**Root cause:** `.point-of-sale-app` is a 10-column CSS grid. `.pos-table-grid-wrapper` and `.pos-table-badge` are direct children but inherit `grid-column: auto` → span 1 column → 1/10th width.

**Fix** in `pos_table.css`:

```css
.point-of-sale-app > .pos-table-grid-wrapper {
  grid-column: 1 / -1;
}

.point-of-sale-app > .pos-table-badge {
  grid-column: 1 / -1;
}
```

### 3.2 Back Button as Left-Aligned Bar

Render `.pos-table-badge` outside the POS components grid, above the item selector and cart. Style as a full-width bar with left alignment using Frappe UI conventions (border, padding, subtle background). Keep click handler for `go_back_to_tables()`.

---

## 4. Comprehensive Test Coverage

### 4.1 File Structure

```
cypress/integration/
  ui_test_pos_table.js          — basic flow (existing, updated)
  ui_test_pos_table_draft.js    — draft save/load/clear/resume
  ui_test_pos_table_realtime.js — cross-session updates, multi-user
  ui_test_pos_table_errors.js   — edge cases, error recovery
```

### 4.2 New Test Helpers

- `setup_tables_with_custom_state(tables_config)` — tables with specific statuses
- `setup_occupied_table_with_draft()` — pre-occupied table with saved draft
- `setup_multi_profile_environment()` — multiple POS profiles + opening entries

### 4.3 Custom Cypress Commands

- `cy.select_table(tableNumber)`, `cy.go_back_from_table()`, `cy.clear_table_via_ui(tableNumber)`
- `cy.assert_table_card_count(count)`, `cy.assert_table_status(tableNumber, status)`

### 4.4 Test Categories (34 scenarios)

| Category | Scenarios |
|----------|-----------|
| Basic flow | Grid render, click → selector, go back with no items, complete sale, UI clear, close POS |
| Draft management | Save draft on back, reload draft, modify draft, submit draft, clear with draft |
| Edge cases | Zero tables, double-click, null frm, deleted doc, double clear, badge during payment, null modified, no event handlers |
| Error handling | DB fail, invoice create fail, draft load fail, delete fail, unknown realtime |
| Realtime updates | Table occupancy remote, table clear remote, handler dedup |
| Multi-user | Two users different tables, same table race, remote clear during work, all sessions closed frees |

---

## 5. Files Changed

| File | Change |
|------|--------|
| `doctype/pos_table_profile/pos_table_profile.json` | **New** — child table doctype |
| `doctype/pos_table/pos_table.json` | Add applicable_profiles field |
| `doctype/pos_table/pos_table.py` | Add validate + bulk_create_tables |
| `doctype/pos_table/pos_table_list.js` | **New** — list view override for bulk create |
| `public/css/pos_table.css` | Add grid-column fixes |
| `public/js/pos/restaurant_pos_controller.js` | Filter by pos_profile, badge rendering |
| `public/js/pos/restaurant_table_selector.js` | Update DOM structure for badge bar |
| `tests/ui_test_helpers.py` | New helper functions |
| `cypress/integration/ui_test_pos_table.js` | Update existing test |
| `cypress/integration/ui_test_pos_table_draft.js` | **New** |
| `cypress/integration/ui_test_pos_table_realtime.js` | **New** |
| `cypress/integration/ui_test_pos_table_errors.js` | **New** |
| `cypress/support/pos_commands.js` | **New** — custom commands |
