# Kitchen Display System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a kitchen display screen at `/app/kitchen-display` where cooks see order cards in real time with visual + sound alerts, and a "Send to Kitchen" button on the POS.

**Architecture:** Two new custom fields (`kitchen_status`, `sent_to_kitchen_at`) on POS Invoice drive the kitchen queue. Server-side whitelisted methods handle state transitions. A new Frappe page (`kitchen-display`) with its own bundle renders order cards in a responsive grid. Real-time updates via Frappe's `publish_realtime`. POS gets a "Send to Kitchen" button inline with the back-to-tables button.

**Tech Stack:** Frappe v16, ERPNext, Python 3.14+, JavaScript (ES6), jQuery, Frappe Webpack bundling

---

### Task 1: Custom Fields, Page Registration, and Doc Events (hooks.py)

**Files:**
- Modify: `awesome_restaurant3/hooks.py:27-29, 43, 139-169`

- [ ] **Step 1: Add kitchen CSS to app_include_css**

Replace:
```python
app_include_css = "/assets/awesome_restaurant3/css/pos_table.css"
```

With:
```python
app_include_css = [
	"/assets/awesome_restaurant3/css/pos_table.css",
	"/assets/awesome_restaurant3/css/kitchen_display.css",
]
```

- [ ] **Step 2: Add kitchen-display to page_js**

Current:
```python
page_js = {"point-of-sale": "public/js/pos/restaurant_pos.js"}
```

Change to:
```python
page_js = {
	"point-of-sale": "public/js/pos/restaurant_pos.js",
	"kitchen-display": "public/js/kitchen/kitchen_display.js",
}
```

- [ ] **Step 3: Add kitchen custom fields**

In `custom_fields`, add kitchen_status and sent_to_kitchen_at to the "POS Invoice" list. The current entry has `restaurant_table`. Add the two new fields after it:

```python
custom_fields = {
	"POS Invoice": [
		{
			"fieldname": "restaurant_table",
			"label": "Restaurant Table",
			"fieldtype": "Data",
			"insert_after": "pos_profile",
		},
		{
			"fieldname": "kitchen_status",
			"label": "Kitchen Status",
			"fieldtype": "Select",
			"options": "\nReceived\nReady",
			"insert_after": "restaurant_table",
			"allow_on_submit": 0,
			"read_only": 1,
		},
		{
			"fieldname": "sent_to_kitchen_at",
			"label": "Sent to Kitchen At",
			"fieldtype": "Datetime",
			"insert_after": "kitchen_status",
			"read_only": 1,
		},
	],
	"Sales Invoice": [
		{
			"fieldname": "restaurant_table",
			"label": "Restaurant Table",
			"fieldtype": "Data",
			"insert_after": "pos_profile",
		},
	],
}
```

- [ ] **Step 4: Add POS Invoice doc_event for broadcast_kitchen_update**

In `doc_events`, add:
```python
doc_events = {
    "POS Closing Entry": {
        "on_submit": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.free_tables_if_all_sessions_closed"
    },
    "POS Table": {
        "on_update": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_table_update"
    },
    "POS Invoice": {
        "on_update": "awesome_restaurant3.awesome_restaurant3.pos_table_utils.broadcast_kitchen_update"
    },
}
```

- [ ] **Step 5: Run bench migrate to apply custom fields**

```bash
bench --site development.localhost migrate
```

Expected: No errors. Verify the fields exist:

```bash
bench --site development.localhost console
```

Then in the console:
```python
import frappe
meta = frappe.get_meta("POS Invoice")
for df in meta.fields:
    if df.fieldname in ("kitchen_status", "sent_to_kitchen_at"):
        print(f"{df.fieldname}: {df.fieldtype} label={df.label}")
```

Expected: Both fields should print with correct types.

---

### Task 2: Database Index Patch

**Files:**
- Create: `awesome_restaurant3/awesome_restaurant3/patches/v1_0/__init__.py`
- Create: `awesome_restaurant3/awesome_restaurant3/patches/v1_0/add_kitchen_db_index.py`
- Modify: `awesome_restaurant3/patches.txt`

- [ ] **Step 1: Create patches directory `__init__.py`**

```python
```
(Empty file — just needs to exist)

- [ ] **Step 2: Create the DB index patch**

```python
import frappe

def execute():
	"""Add composite index on kitchen_status and sent_to_kitchen_at for kitchen queue queries."""
	frappe.db.sql("""
		CREATE INDEX IF NOT EXISTS idx_kitchen_queue
		ON `tabPOS Invoice` (kitchen_status, sent_to_kitchen_at)
	""")
```

- [ ] **Step 3: Add patch to patches.txt**

Add under `[post_model_sync]`:
```
awesome_restaurant3.awesome_restaurant3.patches.v1_0.add_kitchen_db_index.execute
```

The file should now look like:
```
[pre_model_sync]
# Patches added in this section will be executed before doctypes are migrated
# Read docs to understand patches: https://frappeframework.com/docs/v14/user/en/database-migrations

[post_model_sync]
# Patches added in this section will be executed after doctypes are migrated
awesome_restaurant3.awesome_restaurant3.patches.v1_0.add_kitchen_db_index.execute
```

- [ ] **Step 4: Run bench migrate to apply the patch**

```bash
bench --site development.localhost migrate
```

Expected: No errors. Verify index exists:

```bash
bench --site development.localhost console
```

```python
frappe.db.sql("SHOW INDEX FROM `tabPOS Invoice` WHERE Key_name = 'idx_kitchen_queue'")
```

Expected: Should return the index row.

---

### Task 3: Server-Side Kitchen Utilities

**Files:**
- Modify: `awesome_restaurant3/awesome_restaurant3/awesome_restaurant3/pos_table_utils.py` (append)

- [ ] **Step 1: Add broadcast_kitchen_update function**

Append to `pos_table_utils.py`:

```python
def broadcast_kitchen_update(doc, method=None):
	"""Publish kitchen_order_update event when kitchen_status or docstatus changes."""
	if not doc.has_value_changed("kitchen_status") and not doc.has_value_changed("docstatus"):
		return

	should_remove = (
		doc.kitchen_status == "Ready"
		or doc.kitchen_status == ""
		or doc.docstatus != 0
	)

	frappe.publish_realtime(
		"kitchen_order_update",
		{
			"invoice": doc.name,
			"kitchen_status": doc.kitchen_status,
			"sent_to_kitchen_at": str(doc.sent_to_kitchen_at) if doc.sent_to_kitchen_at else None,
			"restaurant_table": doc.restaurant_table,
			"items": [
				{"item_name": item.item_name, "qty": item.qty}
				for item in doc.items
			],
			"modified": str(doc.modified),
			"should_remove": should_remove,
		},
	)
```

- [ ] **Step 2: Add send_order_to_kitchen function**

```python
@frappe.whitelist()
def send_order_to_kitchen(invoice_name):
	"""Mark an invoice as sent to kitchen."""
	doc = frappe.get_doc("POS Invoice", invoice_name)
	if doc.docstatus != 0:
		frappe.throw("Only draft invoices can be sent to kitchen.")

	if not doc.items:
		frappe.throw("Cannot send an empty order to kitchen.")

	doc.kitchen_status = "Received"
	doc.sent_to_kitchen_at = frappe.utils.now_datetime()
	doc.save(ignore_permissions=True)

	doc.add_comment(
		"Comment",
		"Order sent to kitchen by {0}".format(frappe.session.user),
	)

	return {"kitchen_status": doc.kitchen_status, "sent_to_kitchen_at": str(doc.sent_to_kitchen_at)}
```

- [ ] **Step 3: Add mark_order_ready function**

```python
@frappe.whitelist()
def mark_order_ready(invoice_name):
	"""Mark an order as ready (cook action)."""
	doc = frappe.get_doc("POS Invoice", invoice_name)
	if doc.kitchen_status != "Received":
		frappe.throw("Only received orders can be marked ready.")

	doc.kitchen_status = "Ready"
	doc.save(ignore_permissions=True)

	doc.add_comment(
		"Comment",
		"Order marked Ready by {0}".format(frappe.session.user),
	)

	return {"kitchen_status": doc.kitchen_status}
```

- [ ] **Step 4: Add get_kitchen_orders function**

```python
@frappe.whitelist()
def get_kitchen_orders():
	"""Return all active kitchen orders (status = Received), ordered by sent_to_kitchen_at."""
	invoices = frappe.get_all(
		"POS Invoice",
		filters={
			"kitchen_status": "Received",
			"docstatus": 0,
		},
		fields=["name", "restaurant_table", "sent_to_kitchen_at", "modified"],
		order_by="sent_to_kitchen_at asc",
	)

	result = []
	for inv in invoices:
		if not inv.restaurant_table:
			continue
		doc = frappe.get_doc("POS Invoice", inv.name)
		items = [
			{"item_name": item.item_name, "qty": item.qty}
			for item in doc.items
		]
		result.append({
			"name": inv.name,
			"restaurant_table": inv.restaurant_table,
			"sent_to_kitchen_at": str(inv.sent_to_kitchen_at) if inv.sent_to_kitchen_at else None,
			"modified": str(inv.modified),
			"items": items,
			"has_been_modified": doc.sent_to_kitchen_at and doc.modified and doc.modified > doc.sent_to_kitchen_at,
		})

	return result
```

Note on `has_been_modified`: a rough heuristic — if the invoice was modified after being sent to kitchen, items may have been added. Real-time events will also push `kitchen_order_update` when items change. For Tier 1, `modified > sent_to_kitchen_at` is sufficient to show a "Modified" badge.

- [ ] **Step 5: Run Python tests to verify**

```bash
bench --site development.localhost run-tests --app awesome_restaurant3
```

Expected: All existing tests pass (new functions aren't called by existing tests).

---

### Task 4: Kitchen Display Page Loader + Bundle

**Files:**
- Create: `awesome_restaurant3/public/js/kitchen/kitchen_display.js`
- Create: `awesome_restaurant3/public/js/kitchen/kitchen_display.bundle.js`

- [ ] **Step 1: Create the bundle entry**

`awesome_restaurant3/public/js/kitchen/kitchen_display.bundle.js`:
```javascript
import "./kitchen_display_controller.js";
import "./order_queue.js";
```

- [ ] **Step 2: Create the page loader**

`awesome_restaurant3/public/js/kitchen/kitchen_display.js`:
```javascript
frappe.provide("awesome_restaurant3");

frappe.pages["kitchen-display"].on_page_load = function (wrapper) {
	if (!(frappe.user.has_role("Kitchen User") || frappe.user.has_role("System Manager"))) {
		frappe.set_route("/app");
		return;
	}

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Kitchen Display"),
		single_column: true,
		hide_sidebar: true,
	});

	frappe.require("kitchen_display.bundle.js", function () {
		wrapper.kitchen = new awesome_restaurant3.KitchenDisplayController(wrapper);
	});
};
```

Note: The "Kitchen User" role must be created manually in the Desk (Role list → New). Only "System Manager" role exists by default.

---

### Task 5: Kitchen Display Controller

**Files:**
- Create: `awesome_restaurant3/public/js/kitchen/kitchen_display_controller.js`

- [ ] **Step 1: Write KitchenDisplayController class**

```javascript
class KitchenDisplayController {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.$wrapper = $(wrapper);
		this.$page = wrapper.page;
		this.orders = [];
		this.active = true;
		this.make();
	}

	async make() {
		this.$wrapper.empty();

		this.$last_updated = $(`<div class="kitchen-last-updated"></div>`);
		this.$wrapper.append(this.$last_updated);

		this.$grid = $(`<div class="kitchen-order-grid"></div>`);
		this.$wrapper.append(this.$grid);

		this.queue = new awesome_restaurant3.OrderQueue({
			wrapper: this.$grid,
			events: {
				mark_ready: (invoice_name) => this.mark_ready(invoice_name),
			},
		});

		await this.fetch_orders();
		this.setup_realtime();
		this.setup_sound();
	}

	async fetch_orders() {
		try {
			const orders = await frappe.call({
				method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.get_kitchen_orders",
			});
			this.orders = orders.message || [];
			this.queue.render(this.orders);
			this.update_last_updated();
		} catch (err) {
			frappe.show_alert({ message: __("Failed to load kitchen orders"), indicator: "red" });
		}
	}

	setup_realtime() {
		frappe.realtime.off("kitchen_order_update");
		frappe.realtime.on("kitchen_order_update", (data) => {
			if (!this.active) return;

			const idx = this.orders.findIndex((o) => o.name === data.invoice);

			if (data.should_remove) {
				if (idx !== -1) {
					this.orders.splice(idx, 1);
				}
			} else if (data.kitchen_status === "Received") {
				if (idx !== -1) {
					this.orders[idx] = { ...this.orders[idx], ...this._map_event(data) };
				} else {
					this.orders.push(this._map_event(data));
					this.play_new_order_sound();
				}
			}

			this.orders.sort((a, b) => {
				if (!a.sent_to_kitchen_at) return 1;
				if (!b.sent_to_kitchen_at) return -1;
				return new Date(a.sent_to_kitchen_at) - new Date(b.sent_to_kitchen_at);
			});

			this.queue.render(this.orders);
			this.update_last_updated();
		});
	}

	_map_event(data) {
		return {
			name: data.invoice,
			restaurant_table: data.restaurant_table,
			sent_to_kitchen_at: data.sent_to_kitchen_at,
			modified: data.modified,
			items: data.items || [],
		};
	}

	async mark_ready(invoice_name) {
		const confirmed = await new Promise((resolve) => {
			frappe.confirm(
				__("Mark this order as Ready?"),
				() => resolve(true),
				() => resolve(false),
			);
		});
		if (!confirmed) return;

		try {
			await frappe.call({
				method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.mark_order_ready",
				args: { invoice_name },
			});
			frappe.show_alert({ message: __("Order marked Ready"), indicator: "green" });
			await this.fetch_orders();
		} catch (err) {
			frappe.show_alert({ message: __("Failed to mark order ready"), indicator: "red" });
		}
	}

	setup_sound() {
		this.audio_ctx = null;
		this.last_sound = 0;
	}

	play_new_order_sound() {
		const now = Date.now();
		if (now - this.last_sound < 3000) return;
		this.last_sound = now;

		try {
			if (!this.audio_ctx) {
				this.audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
			}
			const ctx = this.audio_ctx;

			const frequencies = [880, 1100, 1320];
			frequencies.forEach((freq, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = "sine";
				osc.frequency.value = freq;
				gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
				gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(ctx.currentTime + i * 0.15);
				osc.stop(ctx.currentTime + i * 0.15 + 0.5);
			});
		} catch (e) {
			// Sound is supplementary — silent failure is acceptable
		}
	}

	update_last_updated() {
		const time = frappe.datetime.now_time();
		this.$last_updated.text(__("Last updated: {0}", [time]));
	}

	destroy() {
		this.active = false;
		frappe.realtime.off("kitchen_order_update");
		if (this.audio_ctx) {
			this.audio_ctx.close();
			this.audio_ctx = null;
		}
	}
}

awesome_restaurant3.KitchenDisplayController = KitchenDisplayController;
```

---

### Task 6: Order Queue Component

**Files:**
- Create: `awesome_restaurant3/public/js/kitchen/order_queue.js`

- [ ] **Step 1: Write OrderQueue component**

```javascript
awesome_restaurant3.OrderQueue = class {
	constructor({ wrapper, events }) {
		this.wrapper = wrapper;
		this.events = events;
		this.$wrapper = $(this.wrapper);
	}

	render(orders) {
		this.$wrapper.empty();
		if (!orders || orders.length === 0) {
			this.$wrapper.html(
				`<div class="kitchen-empty">${__("No active orders")}</div>`
			);
			return;
		}

		orders.forEach((order, index) => {
			this.$wrapper.append(this._render_card(order, index));
		});
	}

	_render_card(order, index) {
		const elapsed_text = this._format_elapsed(order.sent_to_kitchen_at);
		const is_new = this._minutes_since(order.sent_to_kitchen_at) <= 5;
		const is_late = this._minutes_since(order.sent_to_kitchen_at) > 20;

		const badge_class = is_new
			? "kitchen-card--new"
			: is_late
				? "kitchen-card--late"
				: "kitchen-card--received";

		const status_label = is_new
			? __("NEW")
			: is_late
				? __("LATE")
				: __("RECEIVED");

		const items_html = order.items
			.map((item) => `
				<div class="kitchen-item">
					<span class="kitchen-item__name">${frappe.utils.escape_html(item.item_name)}</span>
					<span class="kitchen-item__qty">x${item.qty}</span>
				</div>
			`)
			.join("");

		const badge = order.has_been_modified
			? `<span class="kitchen-card__badge kitchen-card__badge--modified">${__("Modified")}</span>`
			: "";

		return `
			<div class="kitchen-card ${badge_class}">
				<div class="kitchen-card__header">
					<div class="kitchen-card__table">${frappe.utils.escape_html(order.restaurant_table)}</div>
					<div class="kitchen-card__badges">
						${badge}
						<span class="kitchen-card__badge kitchen-card__badge--status">${status_label}</span>
					</div>
				</div>
				<div class="kitchen-card__items">
					${items_html}
				</div>
				<div class="kitchen-card__footer">
					<span class="kitchen-card__elapsed">${elapsed_text}</span>
					<button class="kitchen-card__ready-btn" data-invoice="${order.name}">
						${__("Ready")}
					</button>
				</div>
			</div>
		`;
	}

	add_event_listeners() {
		this.$wrapper.on("click", ".kitchen-card__ready-btn", (e) => {
			const invoice_name = $(e.currentTarget).data("invoice");
			if (invoice_name) {
				this.events.mark_ready(invoice_name);
			}
		});
	}

	refresh_event_listeners() {
		this.$wrapper.off("click", ".kitchen-card__ready-btn");
		this.add_event_listeners();
	}

	render_and_bind(orders) {
		this.render(orders);
		this.refresh_event_listeners();
	}
};

// Patch render to auto-bind events

const original_render = awesome_restaurant3.OrderQueue.prototype.render;
awesome_restaurant3.OrderQueue.prototype.render = function (orders) {
	original_render.call(this, orders);
	this.refresh_event_listeners();
};

awesome_restaurant3.OrderQueue.prototype.add_event_listeners =
	awesome_restaurant3.OrderQueue.prototype.add_event_listeners;
awesome_restaurant3.OrderQueue.prototype.refresh_event_listeners =
	awesome_restaurant3.OrderQueue.prototype.refresh_event_listeners;
awesome_restaurant3.OrderQueue.prototype.render_and_bind =
	awesome_restaurant3.OrderQueue.prototype.render_and_bind;

Object.assign(awesome_restaurant3.OrderQueue.prototype, {
	_minutes_since(datetime_str) {
		if (!datetime_str) return Infinity;
		const diff = moment().diff(moment(datetime_str), "minutes");
		return diff;
	},

	_format_elapsed(datetime_str) {
		if (!datetime_str) return __("just now");
		const mins = this._minutes_since(datetime_str);
		if (mins < 1) return __("just now");
		if (mins < 60) return __("{0}m ago", [mins]);
		const hours = Math.floor(mins / 60);
		return __("{0}h {1}m ago", [hours, mins % 60]);
	},
});
```

Wait — this pattern of patching render after defining the class is awkward. Let me refactor to bake the event binding into the render method directly.

Actually let me restructure. The current plan has a class definition then monkey-patches its own prototype. That's messy. Let me rewrite the queue component to include events directly.

- [ ] **Step 1 (revised): Write OrderQueue component with built-in event handling**

```javascript
awesome_restaurant3.OrderQueue = class {
	constructor({ wrapper, events }) {
		this.wrapper = wrapper;
		this.events = events;
		this.$wrapper = $(this.wrapper);
		this._setup_delegation();
	}

	_setup_delegation() {
		this.$wrapper.on("click", ".kitchen-card__ready-btn", (e) => {
			const invoice_name = $(e.currentTarget).data("invoice");
			if (invoice_name) {
				this.events.mark_ready(invoice_name);
			}
		});
	}

	render(orders) {
		this.$wrapper.empty();
		if (!orders || orders.length === 0) {
			this.$wrapper.html(
				`<div class="kitchen-empty">${__("No active orders")}</div>`
			);
			return;
		}

		orders.forEach((order) => {
			this.$wrapper.append(this._render_card(order));
		});
	}

	_render_card(order) {
		const elapsed_text = this._format_elapsed(order.sent_to_kitchen_at);
		const mins = this._minutes_since(order.sent_to_kitchen_at);
		const is_new = mins <= 5;
		const is_late = mins > 20;

		const badge_class = is_new
			? "kitchen-card--new"
			: is_late
				? "kitchen-card--late"
				: "kitchen-card--received";

		const status_label = is_new
			? __("NEW")
			: is_late
				? __("LATE")
				: __("RECEIVED");

		const items_html = (order.items || [])
			.map((item) => `
				<div class="kitchen-item">
					<span class="kitchen-item__name">${frappe.utils.escape_html(item.item_name)}</span>
					<span class="kitchen-item__qty">x${item.qty}</span>
				</div>
			`)
			.join("");

		const modified_badge = order.has_been_modified
			? `<span class="kitchen-card__badge kitchen-card__badge--modified">${__("Modified")}</span>`
			: "";

		return `
			<div class="kitchen-card ${badge_class}">
				<div class="kitchen-card__header">
					<div class="kitchen-card__table">${frappe.utils.escape_html(order.restaurant_table)}</div>
					<div class="kitchen-card__badges">
						${modified_badge}
						<span class="kitchen-card__badge kitchen-card__badge--status">${status_label}</span>
					</div>
				</div>
				<div class="kitchen-card__items">${items_html}</div>
				<div class="kitchen-card__footer">
					<span class="kitchen-card__elapsed">${elapsed_text}</span>
					<button class="kitchen-card__ready-btn" data-invoice="${order.name}">
						${__("Ready")}
					</button>
				</div>
			</div>
		`;
	}

	_minutes_since(datetime_str) {
		if (!datetime_str) return Infinity;
		return moment().diff(moment(datetime_str), "minutes");
	}

	_format_elapsed(datetime_str) {
		if (!datetime_str) return __("just now");
		const mins = this._minutes_since(datetime_str);
		if (mins < 1) return __("just now");
		if (mins < 60) return __("{0}m ago", [mins]);
		const hours = Math.floor(mins / 60);
		return __("{0}h {1}m ago", [hours, mins % 60]);
	}
};
```

---

### Task 7: Kitchen Display CSS

**Files:**
- Create: `awesome_restaurant3/public/css/kitchen_display.css`

- [ ] **Step 1: Write kitchen display styles**

```css
.kitchen-order-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 16px;
	padding: 16px;
}

.kitchen-empty {
	grid-column: 1 / -1;
	text-align: center;
	padding: 60px 16px;
	font-size: 18px;
	color: var(--text-muted);
}

.kitchen-last-updated {
	padding: 8px 16px;
	font-size: 12px;
	color: var(--text-muted);
	text-align: right;
}

.kitchen-card {
	background: var(--card-bg, #fff);
	border: 2px solid var(--border-color);
	border-radius: 10px;
	padding: 16px;
	position: relative;
	transition: transform 0.15s ease;
}

.kitchen-card:active {
	transform: scale(0.98);
}

.kitchen-card--new {
	border-color: #22c55e;
	animation: kitchen-pulse 1s ease-in-out 3;
}

.kitchen-card--received {
	border-color: #e98b46;
}

.kitchen-card--late {
	border-color: #ef4444;
}

@keyframes kitchen-pulse {
	0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
	50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
}

.kitchen-card__header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 12px;
}

.kitchen-card__table {
	font-size: 20px;
	font-weight: 700;
}

.kitchen-card__badges {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}

.kitchen-card__badge {
	font-size: 11px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 4px;
	text-transform: uppercase;
	white-space: nowrap;
}

.kitchen-card__badge--status {
	background: rgba(233, 139, 70, 0.15);
	color: #e98b46;
}

.kitchen-card--new .kitchen-card__badge--status {
	background: rgba(34, 197, 94, 0.15);
	color: #22c55e;
}

.kitchen-card--late .kitchen-card__badge--status {
	background: rgba(239, 68, 68, 0.15);
	color: #ef4444;
}

.kitchen-card__badge--modified {
	background: rgba(99, 102, 241, 0.15);
	color: #6366f1;
}

.kitchen-card__items {
	margin-bottom: 12px;
}

.kitchen-item {
	display: flex;
	justify-content: space-between;
	padding: 3px 0;
	border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));
	font-size: 14px;
}

.kitchen-item:last-child {
	border-bottom: none;
}

.kitchen-item__qty {
	color: var(--text-muted);
	font-weight: 600;
}

.kitchen-card__footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding-top: 10px;
	border-top: 1px solid var(--border-color, rgba(0,0,0,0.08));
}

.kitchen-card__elapsed {
	font-size: 12px;
	color: var(--text-muted);
}

.kitchen-card__ready-btn {
	padding: 6px 18px;
	border: none;
	border-radius: 6px;
	background: var(--primary, #2490ef);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
}

.kitchen-card__ready-btn:hover {
	opacity: 0.9;
}

.kitchen-card__ready-btn:active {
	transform: scale(0.96);
}

@media (max-width: 768px) {
	.kitchen-order-grid {
		grid-template-columns: 1fr;
		padding: 10px;
	}
}
```

---

### Task 8: POS "Send to Kitchen" Button

**Files:**
- Modify: `awesome_restaurant3/public/js/pos/restaurant_pos_controller.js`
- Modify: `awesome_restaurant3/public/js/pos/restaurant_table_selector.js`

- [ ] **Step 1: Add "Send to Kitchen" button to POS table badge area**

In `restaurant_pos_controller.js`, modify `render_table_badge()` to include a "Send to Kitchen" button inline with the back button:

```javascript
render_table_badge() {
	this.remove_table_badge();
	const table = this.current_table_doc?.table_number || "";
	const html = `
		<div class="pos-table-badge" id="pos-table-badge">
			<span class="pos-table-badge__arrow">&larr;</span>
			<span class="pos-table-badge__label">${table}</span>
			<button class="pos-table-badge__send-btn" id="pos-send-kitchen-btn">${__("Send to Kitchen")}</button>
		</div>`;
	this.$table_badge = $(html)
		.on("click", (e) => {
			if (!$(e.target).is("#pos-send-kitchen-btn")) {
				this.go_back_to_tables();
			}
		});
	this.$components_wrapper.prepend(this.$table_badge);

	this.$table_badge.on("click", "#pos-send-kitchen-btn", () => {
		this.send_to_kitchen();
	});

	this._fix_table_grid_css();
}
```

- [ ] **Step 2: Add send_to_kitchen() method to controller**

Add after `render_table_badge()`:

```javascript
async send_to_kitchen() {
	if (!this.frm || !this.frm.doc.name) {
		frappe.show_alert({ message: __("No active order to send"), indicator: "orange" });
		return;
	}

	if (!this.frm.doc.items || this.frm.doc.items.length === 0) {
		frappe.show_alert({ message: __("Cannot send empty order"), indicator: "orange" });
		return;
	}

	if (this.frm.is_dirty() || this.frm.is_new()) {
		let save_error = false;
		await this.frm.save(null, null, null, () => (save_error = true));
		if (save_error) {
			frappe.show_alert({ message: __("Failed to save order"), indicator: "red" });
			return;
		}
	}

	try {
		await frappe.call({
			method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.send_order_to_kitchen",
			args: { invoice_name: this.frm.doc.name },
		});
		frappe.show_alert({
			message: __("Order sent to kitchen"),
			indicator: "green",
		});
	} catch (err) {
		frappe.show_alert({ message: __("Failed to send order"), indicator: "red" });
	}
}
```

- [ ] **Step 3: Update POS table badge CSS**

Append to `pos_table.css`:

```css
.pos-table-badge {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.pos-table-badge__send-btn {
	padding: 6px 16px;
	border: none;
	border-radius: 6px;
	background: var(--primary, #2490ef);
	color: #fff;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	margin-left: auto;
}

.pos-table-badge__send-btn:hover {
	opacity: 0.9;
}

.pos-table-badge__send-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
```

- [ ] **Step 4: Show kitchen status on table cards**

In `restaurant_table_selector.js`, the table grid fetches does not currently get `kitchen_status`. But the table grid fetches `POS Table` records, not `POS Invoice` records. The kitchen status lives on the invoice.

For the table grid, we can show an indicator when the linked invoice has `kitchen_status = "Received"`. But the table grid currently doesn't have access to invoice fields beyond what's cached on the POS Table record.

For Tier 1: the TableSelector already shows `current_invoice`, `current_total`, `current_item_count` on occupied cards. We can add a simple visual cue. Instead of overcomplicating the data fetch, let's use the real-time events already being received.

When a `kitchen_order_update` event fires for an invoice whose `restaurant_table` matches a visible card, we can add a badge. But that requires the TableSelector to also listen for kitchen events.

Simplest approach: in the POS controller's `load_table_grid()`, when we subscribe to `pos_table_update`, also subscribe to `kitchen_order_update` and mark table cards accordingly.

Actually, let's not overcomplicate this. For Tier 1, the table card just needs to know if the order has been sent. We can store this as a client-side flag. When `send_order_to_kitchen()` succeeds, set a flag, and update the card.

Let me add a method to the TableSelector:

```javascript
// In restaurant_table_selector.js, after update_table:

mark_kitchen_sent(table_number) {
	const $card = this.$card_map[table_number];
	if (!$card) return;
	
	let badge = $card.find(".pos-table-card__kitchen-badge");
	if (!badge.length) {
		badge = $(`<span class="pos-table-card__kitchen-badge">${__("Sent")}</span>`);
		$card.find(".pos-table-card__name").after(badge);
	}
}
```

And in the POS controller's `send_to_kitchen()`:
```javascript
// After successful send:
if (this.table_selector) {
	this.table_selector.mark_kitchen_sent(this.current_table_doc.table_number);
}
```

And CSS:
```css
.pos-table-card__kitchen-badge {
	display: inline-block;
	font-size: 11px;
	font-weight: 600;
	background: rgba(34, 197, 94, 0.15);
	color: #22c55e;
	padding: 2px 8px;
	border-radius: 4px;
	margin-left: 8px;
	text-transform: uppercase;
}
```

Let me add this to the plan.

- [ ] **Step 4 (revised): Add kitchen-sent marker to table cards**

4a. In `restaurant_table_selector.js`, add method:

```javascript
mark_kitchen_sent(table_number) {
	const $card = this.$card_map[table_number];
	if (!$card) return;

	let badge = $card.find(".pos-table-card__kitchen-badge");
	if (!badge.length) {
		badge = $(`<span class="pos-table-card__kitchen-badge">${__("Sent")}</span>`);
		$card.find(".pos-table-card__name").after(badge);
	}
}
```

4b. In `restaurant_pos_controller.js`, inside `send_to_kitchen()`, after the successful `frappe.call` and alert:

```javascript
if (this.table_selector) {
	this.table_selector.mark_kitchen_sent(this.current_table_doc.table_number);
}
```

So the `send_to_kitchen` method becomes:

```javascript
async send_to_kitchen() {
	if (!this.frm || !this.frm.doc.name) {
		frappe.show_alert({ message: __("No active order to send"), indicator: "orange" });
		return;
	}

	if (!this.frm.doc.items || this.frm.doc.items.length === 0) {
		frappe.show_alert({ message: __("Cannot send empty order"), indicator: "orange" });
		return;
	}

	if (this.frm.is_dirty() || this.frm.is_new()) {
		let save_error = false;
		await this.frm.save(null, null, null, () => (save_error = true));
		if (save_error) {
			frappe.show_alert({ message: __("Failed to save order"), indicator: "red" });
			return;
		}
	}

	try {
		await frappe.call({
			method: "awesome_restaurant3.awesome_restaurant3.pos_table_utils.send_order_to_kitchen",
			args: { invoice_name: this.frm.doc.name },
		});
		frappe.show_alert({
			message: __("Order sent to kitchen"),
			indicator: "green",
		});
		if (this.table_selector) {
			this.table_selector.mark_kitchen_sent(this.current_table_doc.table_number);
		}
	} catch (err) {
		frappe.show_alert({ message: __("Failed to send order"), indicator: "red" });
	}
}
```

4c. In `pos_table.css`, add:

```css
.pos-table-card__kitchen-badge {
	display: inline-block;
	font-size: 11px;
	font-weight: 600;
	background: rgba(34, 197, 94, 0.15);
	color: #22c55e;
	padding: 2px 8px;
	border-radius: 4px;
	margin-left: 8px;
	text-transform: uppercase;
}
```

---

### Task 9: Build and Verify

**Files:**
- None (build step only)

- [ ] **Step 1: Build frontend assets**

```bash
bench build --app awesome_restaurant3
```

Expected: No errors. Bundle files should be generated in `public/dist/js/`.

- [ ] **Step 2: Verify the app loads without errors**

Start bench if not running:
```bash
bench start
```

Then in a browser, visit `/app/kitchen-display`. Expected: page loads with "No active orders" message.

- [ ] **Step 3: Verify custom fields**

```bash
bench --site development.localhost console
```

```python
frappe.get_meta("POS Invoice").get_field("kitchen_status")
# Should return field object with fieldname='kitchen_status'

frappe.get_meta("POS Invoice").get_field("sent_to_kitchen_at")
# Should return field object with fieldname='sent_to_kitchen_at'
```

- [ ] **Step 4: Verify the DB index**

```bash
bench --site development.localhost console
```

```python
rows = frappe.db.sql("SHOW INDEX FROM `tabPOS Invoice` WHERE Key_name = 'idx_kitchen_queue'")
assert len(rows) > 0, "Index not found!"
print("Index exists:", rows)
```

- [ ] **Step 5: End-to-end smoke test (manual)**

1. Open POS, select a Free table, add 2 items
2. Click `Send to Kitchen` button — should see "Order sent to kitchen" toast
3. Table card should show "Sent" badge
4. Open `/app/kitchen-display` in another tab — should see the order card
5. Order card should show: Table number, items with quantities, elapsed time, "NEW" badge, "Ready" button
6. Click "Ready" → confirmation dialog → confirm
7. Order card should disappear
8. "No active orders" message should appear
