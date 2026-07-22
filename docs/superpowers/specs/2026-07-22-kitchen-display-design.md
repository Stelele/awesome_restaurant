# Kitchen Display System — Tier 1 Design

**Date:** 2026-07-22
**Status:** Design approved (post-Advocate revisions incorporated)

## Overview

Add a kitchen display screen to the restaurant POS system. Cooks see orders in
real time on a dedicated page, mark them as ready. Tier 1 — absolute minimum
viable feature set for a sit-in restaurant.

---

## Decisions

| Decision | Choice |
|----------|--------|
| Feature scope | Tier 1 — Absolute Minimum |
| Kitchen screen location | Separate Frappe page `/app/kitchen-display` |
| Order status workflow | 2-state: Received → Ready |
| Order trigger | Explicit "Send to Kitchen" button, not automatic |
| Readiness granularity | Per-order (whole order, not per-item) |
| Notification | Visual highlight (primary) + sound alert (supplementary) |
| Theme | Inherit Frappe system theme (dark/light) |

---

## Data Model

### Custom Fields (on POS Invoice only)

| Fieldname | Type | Label | Options / Notes |
|-----------|------|-------|-----------------|
| `kitchen_status` | Select | Kitchen Status | `""` (blank), `"Received"`, `"Ready"`. Default blank. |
| `sent_to_kitchen_at` | Datetime | Sent to Kitchen At | Set when `kitchen_status` first becomes `"Received"`. Read-only. |

Added to `custom_fields` in `hooks.py`. Only POS Invoice — not Sales Invoice
(Sales Invoice has no Tier 1 kitchen use case; if one emerges, add later).

### Database Index

Composite index on `(kitchen_status, sent_to_kitchen_at)` in `POS Invoice` table
to support the kitchen queue query efficiently as invoice volume grows.

### State Machine

```
  [blank]  ──server clicks "Send"──>  Received  ──cook clicks "Ready"──>  Ready
                (set sent_to_kitchen_at timestamp)      (confirmation dialog)
```

- Only invoices with `kitchen_status = "Received"` appear on the kitchen screen
- Marking Ready: confirmation dialog on the kitchen screen ("Mark Table 3 ready?")
- After Ready: card auto-hides after 5 minutes (prevents screen clutter)
- Re-send: resets status to "Received", updates timestamp (goes to queue bottom). Add comment: "Order re-sent to kitchen."
- Invoice paid/submitted → kitchen card auto-removes
- Table cleared → `kitchen_status` reset to blank
- Invoice cancelled → kitchen card auto-removes
- Order was sent, then items modified: card gets "Modified" badge; kitchen_status stays "Received"

### Audit Trail

Every kitchen status change logs a comment on the POS Invoice via
`frappe.get_doc("POS Invoice", name).add_comment("Comment", text)`.
Example: "Order sent to kitchen by Administrator" / "Order marked Ready by Cook1" /
"Order re-sent to kitchen by Administrator".

### Real-time Events

`broadcast_kitchen_update` only fires when `kitchen_status` actually changed
(checked via `doc.has_value_changed("kitchen_status")`). Avoids broadcasting
on every unrelated invoice update (payments, prints, remarks).

---

## Frontend Architecture

### New Files

```
public/js/kitchen/kitchen_display.js              Page loader + hook registration
public/js/kitchen/kitchen_display.bundle.js        Bundle entry (imports)
public/js/kitchen/kitchen_display_controller.js    Main controller class
public/js/kitchen/order_queue.js                   Order card grid component
public/css/kitchen_display.css                     Styles (light/dark, cards, animations)
```

### Page Registration (hooks.py)

```python
page_js = {
    "point-of-sale": "public/js/pos/restaurant_pos.js",
    "kitchen-display": "public/js/kitchen/kitchen_display.js",
}
```

### KitchenDisplayController

- `make()`: fetch orders via `get_kitchen_orders()`, render `OrderQueue`
- Real-time events (primary mechanism): subscribe to `kitchen_order_update`
- Polling fallback on reconnect only (not periodic alongside active socket)
- "Last updated" timestamp visible on screen so cooks know data freshness
- `mark_ready(invoice_name)`: calls server-side with confirmation dialog
- Sound alert: distinct audio file (e.g. bell chime), not oscillator tone; visual highlight is the primary alert
- Kitchen query filters only invoices with `restaurant_table` set (non-empty)

### OrderQueue Component

- Responsive CSS grid: `auto-fill, minmax(280px, 1fr)`
- Each card shows:
  - Table number (from `restaurant_table` field)
  - Items list with quantities
  - Elapsed time since `sent_to_kitchen_at` (human-readable)
  - Status badge
  - "Ready" button (confirmation prompt on click)
- Color coding by elapsed time:
  - ≤ 5 min: green "NEW" badge
  - 5–20 min: orange "RECEIVED" badge
  - > 20 min: red "LATE" badge
- "Modified" badge when items changed after initial send
- New orders: brief pulse animation
- Ready cards: auto-removed after 5 minutes
- Inherits Frappe CSS custom properties for theme (works dark/light)

### POS Changes (restaurant_pos_controller.js)

- "Send to Kitchen" button added inline with existing "back to tables" button
- Disabled when cart has zero items
- Calls `send_order_to_kitchen()` whitelisted method
- Shows success toast
- Table card on grid reflects kitchen status visually

---

## Server-Side

### Whitelisted Methods (pos_table_utils.py)

```python
@frappe.whitelist()
def send_order_to_kitchen(invoice_name):
    """Set kitchen_status = 'Received', sent_to_kitchen_at = now()"""
    # Add audit comment
    # Trigger broadcast_kitchen_update via on_update hook

@frappe.whitelist()
def mark_order_ready(invoice_name):
    """Set kitchen_status = 'Ready'"""
    # Add audit comment
    # Trigger broadcast_kitchen_update via on_update hook

@frappe.whitelist()
def get_kitchen_orders(pos_profile=None):
    """Return invoices with kitchen_status = 'Received', ordered by sent_to_kitchen_at ASC"""
    # SQL: WHERE kitchen_status = 'Received' AND docstatus = 0
    #   AND restaurant_table IS NOT NULL AND restaurant_table != ''
    # ORDER BY sent_to_kitchen_at ASC
```

### Hooks

```python
doc_events = {
    "POS Invoice": {
        "on_update": [
            "awesome_restaurant3.pos_table_utils.broadcast_kitchen_update"
        ],
    },
}
```

### Real-time Event

```python
def broadcast_kitchen_update(doc, method=None):
    """Publish 'kitchen_order_update' event when kitchen_status changes"""
    if not doc.has_value_changed("kitchen_status"):
        return
    frappe.publish_realtime("kitchen_order_update", {...})
```

### Database Index

```sql
CREATE INDEX idx_kitchen_queue ON `tabPOS Invoice` (kitchen_status, sent_to_kitchen_at);
```

Added via a patch in `patches.txt`.

---

## User Roles

New role: **Kitchen User** — has read access to POS Invoice.
Kitchen display page restricted to Kitchen User and System Manager roles.

---

## Gaps — Addressed vs Deferred

| Gap | Tier 1 Plan |
|-----|-------------|
| No order status field | Addressed — `kitchen_status` custom field |
| No kitchen timestamp | Addressed — `sent_to_kitchen_at` custom field |
| No kitchen view/route | Addressed — `/app/kitchen-display` page |
| No kitchen user role | Addressed — Kitchen User role |
| No audit trail for kitchen actions | Addressed — `add_comment` on status changes |
| DB query performance at scale | Addressed — composite index |
| Single invoice per table | Deferred — servers re-send with new items; "Modified" badge alerts kitchen |
| Per-item readiness | Deferred (Tier 2) — known limitation, documented for future |
| No item-level notes | Deferred — future enhancement |
| No prep station categories | Deferred — future enhancement |

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Server re-sends after adding items | Resets to Received, updates timestamp, audit comment, order goes to queue bottom, "Modified" badge on card |
| Items modified after send (no re-send) | Card shows "Modified" badge, kitchen_status stays Received |
| Invoice paid before Ready | Card auto-removes from kitchen (invoice no longer draft) |
| Table cleared before Ready | `kitchen_status` reset to blank, card removed |
| Invoice cancelled | Card auto-removes |
| Multiple POS sessions on same table | Last write wins; single order in kitchen |
| Send with zero items | Button disabled when cart is empty |
| Non-restaurant POS invoice | Hidden from kitchen (filter: restaurant_table is set) |
| Cook accidentally clicks Ready | Confirmation dialog prevents fat-finger errors |
| Ready card still on screen after 5 min | Auto-removed (timer-based cleanup) |
| Browser refresh on kitchen display | Re-fetches all Received orders, no data loss |
| Real-time socket disconnected | Polls on reconnect; "Last updated: [stale]" warning shown |
