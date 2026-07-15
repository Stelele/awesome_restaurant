# POS Table Doctype — Design Spec (v2)

**Date:** 2026-07-15
**App:** `awesome_restaurant3`
**Replaces:** Previous session-scoped table design (2026-07-14 spec)
**Goal:** Replace the ephemeral table-count approach with a persistent `POS Table` doctype that supports multi-user real-time shared tabs across POS sessions.

---

## 1. Data Model

### 1.1 New Doctype: `POS Table`

| Field | Type | Description |
|-------|------|-------------|
| `table_number` | Data | Display name, e.g. "Table 1", "Patio 4" |
| `status` | Select: Free / Occupied | Default: Free |
| `current_invoice` | Data | Draft POS Invoice or Sales Invoice name |
| `current_invoice_doctype` | Link: DocType | Filters to "POS Invoice" and "Sales Invoice". Stores the doctype of the linked invoice. |

Permissions: All POS roles can read. Accounts Manager and Sales Manager can create/edit POS Table records.

### 1.2 Removed

- `POS Profile.restaurant_table_count` custom field (Task 1 fixture).
- `POS Invoice.restaurant_table` custom field (replaced by querying POS Table's `current_invoice`).
- `Sales Invoice.restaurant_table` custom field (same).

The table mode gate becomes: `frappe.db.count("POS Table") > 0`.

---

## 2. Server-Side: Hooks & Utilities

### 2.1 `hooks.py` additions

```python
doc_events = {
    "POS Closing Entry": {
        "on_submit": "awesome_restaurant3.pos_table_utils.free_tables_if_all_sessions_closed"
    },
    "POS Table": {
        "on_update": "awesome_restaurant3.pos_table_utils.broadcast_table_update"
    }
}
```

### 2.2 `pos_table_utils.py`

```python
import frappe

def broadcast_table_update(doc, method):
    """Emit real-time event on every POS Table save."""
    frappe.publish_realtime("pos_table_update", {
        "table_number": doc.table_number,
        "status": doc.status,
        "current_invoice": doc.current_invoice,
        "current_invoice_doctype": doc.current_invoice_doctype,
    })

def free_tables_if_all_sessions_closed(doc, method):
    """On POS Closing Entry submit, check if any open sessions remain.
    If none, free all POS Tables and optionally delete orphaned drafts."""
    open_entries = frappe.db.count("POS Opening Entry", {"status": "Open", "name": ("!=", doc.pos_opening_entry)})
    if open_entries == 0:
        tables = frappe.get_all("POS Table", filters={"status": "Occupied"})
        for table in tables:
            table_doc = frappe.get_doc("POS Table", table.name)
            table_doc.status = "Free"
            table_doc.current_invoice = None
            table_doc.current_invoice_doctype = None
            table_doc.save()
```

---

## 3. Frontend Architecture

### 3.1 Files to Create

| File | Purpose |
|------|---------|
| `awesome_restaurant3/pos_table_utils.py` | Server-side real-time broadcast + cleanup |
| `awesome_restaurant3/awesome_restaurant3/doctype/pos_table/pos_table.json` | POS Table doctype schema |
| `awesome_restaurant3/awesome_restaurant3/doctype/pos_table/pos_table.py` | POS Table controller (empty, just doc_meta) |
| `awesome_restaurant3/awesome_restaurant3/doctype/pos_table/pos_table.js` | POS Table client-side (basic setup) |

### 3.2 Files to Modify

| File | Changes |
|------|---------|
| `hooks.py` | Add `doc_events` for POS Closing Entry and POS Table |
| `custom_field.json` | Remove the three custom fields (restaurant_table_count, restaurant_table on both invoices) |
| `restaurant_pos_controller.js` | Major refactor — replace ephemeral state with POS Table doctype queries |
| `restaurant_table_selector.js` | Change from `table_drafts` prop to receiving POS Table doc array |
| `restaurant_pos.bundle.js` | No change needed (imports stay the same) |
| `restaurant_pos.js` | No change needed (page loader stays the same) |
| `pos_table.css` | No change needed |

### 3.3 Files to Delete

| File | Reason |
|------|--------|
| `fixtures/custom_field.json` | Replaced by POS Table doctype |

---

## 4. Controller Flow (RestaurantPosController v2)

### 4.1 `make_app()` — table mode gate

```javascript
async make_app() {
    this.prepare_dom();
    this.prepare_components();
    this.prepare_menu();
    this.prepare_btns();

    const table_count = await frappe.db.count("POS Table");
    if (table_count > 0) {
        this.table_mode = true;
        // No current_table, no table_drafts in-memory object
        this.load_table_grid();
    } else {
        this.make_new_invoice();
    }
}
```

### 4.2 `load_table_grid()`

Fetches all POS Table records, renders the TableSelector, subscribes to real-time updates:

```javascript
async load_table_grid() {
    const tables = await frappe.db.get_list("POS Table", {
        fields: ["name", "table_number", "status", "current_invoice", "current_invoice_doctype", "modified"]
    });
    this.table_selector = new awesome_restaurant3.TableSelector({
        wrapper: this.$components_wrapper,
        tables: tables,
        events: {
            select_table: (table_number) => this.select_table(table_number),
            clear_table: (table_number) => this.clear_table(table_number),
        },
    });
    this.toggle_components(false);

    // Real-time subscription
    frappe.realtime.on("pos_table_update", (data) => {
        this.table_selector.update_table(data);
    });
}
```

### 4.3 `select_table(table_number)`

```javascript
async select_table(table_number) {
    const table = await frappe.db.get_doc("POS Table", { table_number: table_number });
    this.current_table_doc = table;

    if (table.status === "Occupied" && table.current_invoice) {
        this.load_existing_table_draft(table.current_invoice, table.current_invoice_doctype, table_number);
    } else {
        this.make_new_invoice().then(async () => {
            this.frm.doc.restaurant_table = table_number;
            await frappe.db.set_value("POS Table", table.name, {
                status: "Occupied",
                current_invoice: this.frm.doc.name,
                current_invoice_doctype: this.settings.frm_doctype,
            });
            this.table_selector.hide();
            this.render_table_badge();
            this.toggle_components(true);
        });
    }
}
```

### 4.4 Simplified `go_back_to_tables()`

```javascript
async go_back_to_tables() {
    if (this.current_table_doc) {
        const items_count = this.frm?.doc?.items?.length || 0;
        if (items_count === 0) {
            // Free the table silently — no items to preserve
            await frappe.db.set_value("POS Table", this.current_table_doc.name, {
                status: "Free",
                current_invoice: null,
                current_invoice_doctype: null,
            });
        }
    }
    this.current_table_doc = null;
    this.frm = null;
    this.remove_table_badge();
    if (this.payment && this.payment.$component) {
        this.payment.toggle_component(false);
    }
    this.toggle_components(false);
    this.load_table_grid();  // Re-fetches all tables + resubscribes real-time
    this.table_selector.show();
}
```

### 4.5 `clear_table(table_number)`

```javascript
async clear_table(table_number) {
    const table = await frappe.db.get_doc("POS Table", { table_number: table_number });
    if (table.current_invoice) {
        await frappe.model.delete_doc(table.current_invoice_doctype, table.current_invoice);
    }
    await frappe.db.set_value("POS Table", table.name, {
        status: "Free",
        current_invoice: null,
        current_invoice_doctype: null,
    });
    frappe.show_alert({ message: __("{0} cleared", [table_number]), indicator: "green" });
    if (this.current_table_doc?.table_number === table_number) {
        this.current_table_doc = null;
        this.frm = null;
    }
    this.load_table_grid();
    this.table_selector.show();
}
```

### 4.6 `toggle_submitted_invoice_summary(show)` — post-payment

```javascript
toggle_submitted_invoice_summary(show) {
    if (this.table_mode) {
        const table_number = this.current_table_doc?.table_number;
        if (this.current_table_doc) {
            frappe.db.set_value("POS Table", this.current_table_doc.name, {
                status: "Free",
                current_invoice: null,
                current_invoice_doctype: null,
            }).then(() => {
                frappe.show_alert({
                    message: table_number ? __("{0} paid", [table_number]) : __("Invoice submitted"),
                    indicator: "green",
                });
            });
        }
        this.current_table_doc = null;
        this.frm = null;
        this.remove_table_badge();
        this.load_table_grid();
        this.table_selector.show();
        return;
    }
    super.toggle_submitted_invoice_summary(show);
}
```

### 4.7 `close_pos()`

```javascript
close_pos() {
    if (this.frm) {
        super.close_pos();
        return;
    }
    if (!this.$components_wrapper.is(":visible")) return;
    let voucher = frappe.model.get_new_doc("POS Closing Entry");
    voucher.pos_profile = this.pos_profile;
    voucher.user = frappe.session.user;
    voucher.company = this.company;
    voucher.pos_opening_entry = this.pos_opening;
    voucher.period_end_date = frappe.datetime.now_datetime();
    voucher.posting_date = frappe.datetime.now_date();
    voucher.posting_time = frappe.datetime.now_time();
    frappe.set_route("Form", "POS Closing Entry", voucher.name);
}
```

---

## 5. TableSelector Component Changes

### 5.1 Constructor

```javascript
constructor({ wrapper, tables, events }) {
    this.wrapper = wrapper;
    this.tables = tables;       // Array of POS Table doc objects
    this.events = events;
    this.make();
}
```

### 5.2 New method: `update_table(data)`

Called by the real-time subscriber. Finds the card for `data.table_number` and updates its class and content without full re-render.

### 5.3 `render_grid()` changes

Each card derives its state from the doc object:
```javascript
const is_occupied = table.status === "Occupied";
```

No `table_drafts` prop — all state comes from the fetched doc array.

---

## 6. Key Behaviors

| Scenario | Behavior |
|----------|----------|
| No POS Table records exist | Normal POS, no table mode |
| POS Table records exist | Table mode grid |
| Click free table | Create draft, set POS Table Occupied + current_invoice |
| Click occupied table | Load draft from current_invoice |
| Two users click same free table | Both load the same draft (shared tab) |
| User adds item to shared table | Real-time updates to other user's cart |
| Back arrow + 0 items | Set POS Table Free + clear invoice, silently |
| Back arrow + items > 0 | Table stays Occupied (preserved on server) |
| Occupied table → linked draft deleted externally | Detected on click: query returns 404 → auto-free the table, treat as fresh click |
| Clear Table | Delete draft, set POS Table Free |
| Pay (submit) | Set POS Table Free + clear invoice |
| All POS sessions close | Hook sets all POS Tables to Free |
| Page refresh | POS Table records persist → grid restores correctly |

---

## 7. Non-Goals
- Floor plan layouts
- Table reservation system
- Table sections/zones
- Custom table shapes or seat counts
- Kitchen display integration

---

## 8. Migration from v1

The previous implementation (in-memory tables, `restaurant_table_count` field) is fully replaced:
- Custom fields in `fixtures/custom_field.json` → removed
- `pos_table_utils.py` → new
- POS Table doctype → new
- Controller and TableSelector → refactored for server-authoritative state

No data migration needed — there are no existing POS Table records to migrate.
