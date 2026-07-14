# Restaurant Table POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional table selection to ERPNext POS via a grid UI, supporting per-table running tabs with session-scoped drafts.

**Architecture:** Custom page loader (`restaurant_pos.js`) replaces the POS page entry point, always instantiating a subclass of `erpnext.PointOfSale.Controller`. The subclass checks `restaurant_table_count` from POS Profile and branches: if > 0, renders a TableSelector grid component before item selection; if 0, delegates entirely to parent. After payment, returns to the table grid instead of invoice summary.

**Tech Stack:** Frappe v16, ES module bundles, vanilla JS (no Vue/React in POS), JQuery, Python 3.14

## Global Constraints

- `restaurant_table_count` on POS Profile defaults to 0 (normal POS flow)
- Drafts are session-scoped; cleared when POS session closes
- Custom field `restaurant_table` added to both POS Invoice and Sales Invoice
- All new JS goes in `awesome_restaurant3/public/js/pos/`
- Use ES module imports for bundle files
- Follow original POS code style: class-based, JQuery DOM, Frappe conventions

---

### Task 1: Custom Field Fixtures

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/fixtures/custom_field.json`

**Interfaces:**
- Produces: Custom fields `POS Profile.restaurant_table_count` (Int), `POS Invoice.restaurant_table` (Data), `Sales Invoice.restaurant_table` (Data)

- [ ] **Step 1: Create the fixtures directory**

```bash
mkdir -p awesome_restaurant3/awesome_restaurant3/fixtures
```

- [ ] **Step 2: Write the custom_field.json fixture**

```json
[
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "restaurant_table_count",
    "fieldtype": "Int",
    "label": "Number of Tables",
    "default": "0",
    "insert_after": "payments",
    "description": "Number of restaurant tables for table-based POS mode. Set to 0 to use standard POS.",
    "translatable": 0
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Invoice",
    "fieldname": "restaurant_table",
    "fieldtype": "Data",
    "label": "Restaurant Table",
    "read_only": 1,
    "insert_after": "pos_profile",
    "description": "Table identifier for restaurant POS mode.",
    "translatable": 0
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "restaurant_table",
    "fieldtype": "Data",
    "label": "Restaurant Table",
    "read_only": 1,
    "insert_after": "pos_profile",
    "description": "Table identifier for restaurant POS mode.",
    "translatable": 0
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/fixtures/custom_field.json
git commit -m "feat: add custom fields for restaurant table POS"
```

---

### Task 2: CSS for Table Grid

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/public/css/pos_table.css`

**Interfaces:**
- Produces: CSS classes `.pos-table-grid`, `.pos-table-card`, `.pos-table-card--occupied`, `.pos-table-card--free`, `.pos-table-badge`

- [ ] **Step 1: Create the CSS directory**

```bash
mkdir -p awesome_restaurant3/awesome_restaurant3/public/css
```

- [ ] **Step 2: Write pos_table.css**

```css
.pos-table-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 1200px) {
  .pos-table-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .pos-table-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding: 12px;
  }
}

.pos-table-card {
  background: #fff;
  border: 2px solid #e2e6e9;
  border-radius: 8px;
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.pos-table-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.pos-table-card--free {
  border-color: #68b771;
  background: #f4faf5;
}

.pos-table-card--free:hover {
  border-color: #3e8e41;
}

.pos-table-card--occupied {
  border-color: #e98b46;
  background: #fef6f0;
}

.pos-table-card--occupied:hover {
  border-color: #c76a24;
}

.pos-table-card__name {
  font-size: 18px;
  font-weight: 700;
  color: #213157;
  margin-bottom: 8px;
}

.pos-table-card--free .pos-table-card__status {
  color: #3e8e41;
  font-size: 13px;
  font-weight: 500;
}

.pos-table-card--occupied .pos-table-card__total {
  font-size: 20px;
  font-weight: 700;
  color: #c76a24;
  margin-bottom: 4px;
}

.pos-table-card__meta {
  font-size: 12px;
  color: #8890a1;
}

.pos-table-card__clear {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 18px;
  font-weight: 700;
  color: #c5c9d0;
  cursor: pointer;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 3px;
}

.pos-table-card__clear:hover {
  color: #e24c4c;
  background: rgba(226, 76, 76, 0.1);
}

.pos-table-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #f4f5f9;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 14px;
  font-weight: 600;
  color: #213157;
  cursor: pointer;
  margin-bottom: 12px;
  margin-left: 20px;
  margin-top: 8px;
}

.pos-table-badge__arrow {
  font-size: 16px;
  color: #8890a1;
}

.pos-table-badge:hover {
  background: #e8e9ef;
}

.pos-table-grid-wrapper {
  width: 100%;
}
```

- [ ] **Step 3: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/public/css/pos_table.css
git commit -m "feat: add table grid CSS for restaurant POS"
```

---

### Task 3: Table Selector Component

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_table_selector.js`

**Interfaces:**
- Consumes: `table_count` (int), `table_drafts` (object map of table name → {name, total, items, modified})
- Produces: `awesome_restaurant3.TableSelector` class with methods: `show()`, `hide()`, `refresh()`, `$component` (jQuery element)
- Events: `select_table(table_name)`, `clear_table(table_name)` fired via `this.events`

- [ ] **Step 1: Create the JS directory**

```bash
mkdir -p awesome_restaurant3/awesome_restaurant3/public/js/pos
```

- [ ] **Step 2: Write restaurant_table_selector.js**

```javascript
awesome_restaurant3.TableSelector = class {
  constructor({ wrapper, table_count, table_drafts, events }) {
    this.wrapper = wrapper;
    this.table_count = table_count;
    this.table_drafts = table_drafts || {};
    this.events = events;

    this.make();
  }

  make() {
    this.$component = $(
      `<div class="pos-table-grid-wrapper"><div class="pos-table-grid"></div></div>`
    ).appendTo(this.wrapper);

    this.$grid = this.$component.find(".pos-table-grid");
    this.render_grid();
  }

  render_grid() {
    this.$grid.empty();
    for (let i = 1; i <= this.table_count; i++) {
      const table_name = __("Table") + " " + i;
      const draft = this.table_drafts[table_name];
      const is_occupied = !!draft;

      const status_class = is_occupied
        ? "pos-table-card--occupied"
        : "pos-table-card--free";

      const elapsed = draft?.modified
        ? this._format_elapsed(draft.modified)
        : "";

      const card_html = `
        <div class="pos-table-card ${status_class}" data-table="${i}">
          ${is_occupied ? '<span class="pos-table-card__clear">&times;</span>' : ""}
          <div class="pos-table-card__name">${table_name}</div>
          ${is_occupied
            ? `<div class="pos-table-card__total">${format_currency(draft.total, frappe.defaults.get_default("currency"))}</div>
               <div class="pos-table-card__meta">${draft.items} item${draft.items !== 1 ? "s" : ""}${elapsed ? " · " + elapsed : ""}</div>`
            : '<div class="pos-table-card__status">' + __("Free") + "</div>"
          }
        </div>`;

      const $card = $(card_html);
      $card.on("click", ".pos-table-card__clear", (e) => {
        e.stopPropagation();
        this._confirm_clear(table_name);
      });
      $card.on("click", (e) => {
        if (!$(e.target).is(".pos-table-card__clear")) {
          this.events.select_table(table_name);
        }
      });
      this.$grid.append($card);
    }
  }

  _confirm_clear(table_name) {
    const draft = this.table_drafts[table_name];
    if (!draft) return;

    frappe.confirm(
      __("Clear {0}? This will delete the draft invoice and free the table.", [table_name]),
      () => {
        this.events.clear_table(table_name);
      }
    );
  }

  _format_elapsed(modified_str) {
    const now = moment();
    const then = moment(modified_str);
    const mins = now.diff(then, "minutes");
    if (mins < 1) return __("just now");
    if (mins < 60) return __("{0}m ago", [mins]);
    const hours = Math.floor(mins / 60);
    return __("{0}h ago", [hours]);
  }

  refresh(drafts) {
    this.table_drafts = drafts || this.table_drafts;
    this.render_grid();
  }

  show() {
    this.$component.show();
  }

  hide() {
    this.$component.hide();
  }

  toggle_component(show) {
    this.$component.toggle(show);
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_table_selector.js
git commit -m "feat: add table selector grid component"
```

---

### Task 4: Restaurant POS Controller Subclass

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos_controller.js`

**Interfaces:**
- Consumes: `erpnext.PointOfSale.Controller` (parent class), `awesome_restaurant3.TableSelector`
- Produces: `awesome_restaurant3.RestaurantPosController` class
- Overrides: `make_app()`, `make_new_invoice()`, `new_invoice_event()`, `toggle_submitted_invoice_summary()`
- Adds: `select_table()`, `load_existing_table_draft()`, `clear_table()`, `go_back_to_tables()`, `render_table_badge()`, `remove_table_badge()`, `_update_table_draft_state()`

- [ ] **Step 1: Write restaurant_pos_controller.js**

```javascript
class RestaurantPosController extends erpnext.PointOfSale.Controller {
  make_app() {
    this.prepare_dom();
    this.prepare_components();
    this.prepare_menu();
    this.prepare_btns();

    const table_count = this.pos_profile_data?.restaurant_table_count;
    if (table_count > 0) {
      this.table_count = table_count;
      this.table_drafts = {};
      this.current_table = null;
      this.table_selector = new awesome_restaurant3.TableSelector({
        wrapper: this.$components_wrapper,
        table_count: this.table_count,
        table_drafts: this.table_drafts,
        events: {
          select_table: (table_name) => this.select_table(table_name),
          clear_table: (table_name) => this.clear_table(table_name),
        },
      });
      this.toggle_components(false);
    } else {
      this.make_new_invoice();
    }
  }

  select_table(table_name) {
    this.current_table = table_name;
    this.table_selector.hide();
    this.render_table_badge();

    if (this.table_drafts[table_name]) {
      const existing_name = this.table_drafts[table_name].name;
      this.load_existing_table_draft(existing_name, table_name);
    } else {
      this.make_new_invoice().then(() => {
        this.frm.doc.restaurant_table = table_name;
        this.table_drafts[table_name] = {
          name: this.frm.doc.name,
          total: 0,
          items: 0,
          modified: this.frm.doc.modified,
        };
        this.toggle_components(true);
      });
    }
  }

  load_existing_table_draft(docname, table_name) {
    const doctype = this.settings.frm_doctype;
    frappe.run_serially([
      () => frappe.dom.freeze(),
      () => this.make_invoice_frm(doctype),
      () => {
        return frappe.db.get_doc(doctype, docname).then((doc) => {
          frappe.model.sync(doc);
          this.frm.refresh(docname);
        });
      },
      () => this.frm.call("reset_mode_of_payments"),
      () => this.cart.load_invoice(),
      () => {
        this.frm.doc.restaurant_table = table_name;
        this.toggle_components(true);
        frappe.dom.unfreeze();
      },
    ]);
  }

  clear_table(table_name) {
    const draft = this.table_drafts[table_name];
    if (!draft) return;

    frappe.model.delete_doc(this.settings.frm_doctype, draft.name, () => {
      delete this.table_drafts[table_name];
      if (this.current_table === table_name) {
        this.current_table = null;
        this.frm = null;
        this.toggle_components(false);
      }
      this.table_selector.refresh(this.table_drafts);
      this.table_selector.show();
      frappe.show_alert({
        message: __("{0} cleared", [table_name]),
        indicator: "green",
      });
    });
  }

  make_new_invoice() {
    return super.make_new_invoice().then(() => {
      if (this.current_table) {
        this.frm.doc.restaurant_table = this.current_table;
      }
    });
  }

  new_invoice_event() {
    if (this.table_count > 0) {
      this.go_back_to_tables();
      return;
    }
    super.new_invoice_event();
  }

  go_back_to_tables() {
    if (this.current_table) {
      this._update_table_draft_state();
    }
    this.current_table = null;
    this.frm = null;
    this.remove_table_badge();
    if (this.payment && this.payment.$component) {
      this.payment.toggle_component(false);
    }
    this.toggle_components(false);
    this.table_selector.refresh(this.table_drafts);
    this.table_selector.show();
  }

  render_table_badge() {
    this.remove_table_badge();
    const html = `
      <div class="pos-table-badge" id="pos-table-badge">
        <span class="pos-table-badge__arrow">&larr;</span>
        <span class="pos-table-badge__label">${this.current_table || ""}</span>
      </div>`;
    this.$table_badge = $(html).on("click", () => this.go_back_to_tables());
    this.$components_wrapper.prepend(this.$table_badge);
  }

  remove_table_badge() {
    if (this.$table_badge) {
      this.$table_badge.remove();
      this.$table_badge = null;
    }
  }

  _update_table_draft_state() {
    const table = this.current_table;
    if (!table || !this.frm?.doc) return;
    this.table_drafts[table] = {
      name: this.frm.doc.name,
      total: this.frm.doc.grand_total || 0,
      items: this.frm.doc.items?.length || 0,
      modified: this.frm.doc.modified,
    };
  }

  toggle_submitted_invoice_summary(show) {
    if (this.table_count > 0) {
      if (this.current_table) {
        delete this.table_drafts[this.current_table];
      }
      const table = this.current_table;
      this.current_table = null;
      this.frm = null;
      this.remove_table_badge();
      this.table_selector.refresh(this.table_drafts);
      this.table_selector.show();
      frappe.show_alert({
        message: table ? __("{0} paid", [table]) : __("Invoice submitted"),
        indicator: "green",
      });
      return;
    }
    super.toggle_submitted_invoice_summary(show);
  }

}

awesome_restaurant3.RestaurantPosController = RestaurantPosController;
```

- [ ] **Step 3: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos_controller.js
git commit -m "feat: add restaurant POS controller subclass"
```

---

### Task 5: ES Module Bundle

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos.bundle.js`

**Interfaces:**
- Imports restaurant_pos_controller.js and restaurant_table_selector.js
- Makes `awesome_restaurant3.RestaurantPosController` and `awesome_restaurant3.TableSelector` available

- [ ] **Step 1: Write restaurant_pos.bundle.js**

```javascript
import "./restaurant_table_selector.js";
import "./restaurant_pos_controller.js";
```

- [ ] **Step 2: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos.bundle.js
git commit -m "feat: add restaurant POS ES module bundle"
```

---

### Task 6: Page Loader Override

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos.js`

**Interfaces:**
- Replaces `frappe.pages["point-of-sale"].on_page_load`
- Loads original `point-of-sale.bundle.js` + `awesome_restaurant3/js/pos/restaurant_pos.bundle.js`
- Instantiates `awesome_restaurant3.RestaurantPosController`

- [ ] **Step 1: Write restaurant_pos.js**

```javascript
frappe.provide("awesome_restaurant3");

frappe.pages["point-of-sale"].on_page_load = function (wrapper) {
  frappe.ui.make_app_page({
    parent: wrapper,
    title: __("Point of Sale"),
    single_column: true,
    hide_sidebar: true,
  });

  frappe.require(
    [
      "point-of-sale.bundle.js",
      "awesome_restaurant3/js/pos/restaurant_pos.bundle.js",
    ],
    function () {
      wrapper.pos = new awesome_restaurant3.RestaurantPosController(wrapper);
      window.cur_pos = wrapper.pos;
    }
  );
};

frappe.pages["point-of-sale"].refresh = function (wrapper) {
  if (document.scannerDetectionData) {
    onScan.detachFrom(document);
    wrapper.pos.wrapper.html("");
    wrapper.pos.check_opening_entry();
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/public/js/pos/restaurant_pos.js
git commit -m "feat: add restaurant POS page loader override"
```

---

### Task 7: Activate Hooks

**Files:**
- Modify: `awesome_restaurant3/awesome_restaurant3/hooks.py`

**Interfaces:**
- Activates `page_js`, `app_include_css`, and `fixtures` hooks

- [ ] **Step 1: Activate app_include_css hook**

```python
# Change:
# app_include_css = "/assets/awesome_restaurant3/css/awesome_restaurant3.css"

# To:
app_include_css = "/assets/awesome_restaurant3/css/pos_table.css"
```

- [ ] **Step 2: Activate page_js hook**

```python
# Change:
# page_js = {"page" : "public/js/file.js"}

# To:
page_js = {"point-of-sale": "public/js/pos/restaurant_pos.js"}
```

- [ ] **Step 3: Activate fixtures hook** (add after `# Apps` section, before `# Includes in <head>`)

```python
# After:
# required_apps = []
#
# Add:
fixtures = ["Custom Field"]
```

- [ ] **Step 4: Verify hooks.py changes have no syntax errors**

```bash
python3 -c "import ast; ast.parse(open('awesome_restaurant3/awesome_restaurant3/hooks.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add awesome_restaurant3/awesome_restaurant3/hooks.py
git commit -m "feat: activate page_js, css, and fixtures hooks for restaurant POS"
```

---

### Task 8: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run bench migrate to apply custom fields**

```bash
bench migrate
```

Expected: No errors. Custom fields are created in the database.

- [ ] **Step 2: Build frontend assets**

```bash
bench build --app awesome_restaurant3
```

Expected: No build errors. ES module bundle compiled successfully.

- [ ] **Step 3: Verify custom fields exist in database**

```bash
bench --site site1.local console
```

In the console:
```python
frappe.db.exists("Custom Field", "POS Profile-restaurant_table_count")
frappe.db.exists("Custom Field", "POS Invoice-restaurant_table")
frappe.db.exists("Custom Field", "Sales Invoice-restaurant_table")
```

Expected: All return `True` (or the actual name)

- [ ] **Step 4: Manual smoke test plan**

1. Open a POS Profile, verify `restaurant_table_count` field is visible
2. Set it to 0, open POS page — verify normal POS flow works unchanged
3. Set it to 4, open POS page — verify table grid shows 4 free tables
4. Click a free table — verify transitions to item selector with "Table N" badge
5. Add items, verify draft is linked to table
6. Click back arrow — verify returns to grid, table shows occupied with total
7. Click occupied table — verify draft loads with existing items
8. Pay the invoice — verify returns to grid with "Table N paid" toast, table is free
9. Click "Clear Table" on an occupied table — verify confirmation dialog, draft deleted
10. Click "Close the POS" — verify POS closes normally

---
