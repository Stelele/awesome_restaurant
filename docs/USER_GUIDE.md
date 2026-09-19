# User Guide: Awesome Restaurant3

## For Restaurant Cashiers

### Getting Started

1. **Open POS** — Log in as a user with Point of Sale access. Open a POS entry and select a `POS Profile` that has tables configured (via `applicable_profiles`).
2. **Table Grid** — The table grid appears inside the POS page, showing `.pos-table-card` elements for each table linked to the profile.
   - **Free tables**: Click to start a new order. The cart opens empty.
    - **Occupied tables**: Click to restore a previous draft invoice into the cart for editing. If the invoice is missing, a new invoice is created.
   - **Ready tables**: Kitchen has marked the order ready. The table badge shows "Order Ready".

### Adding Items to a Table

1. Select a table → the item selection page loads with an empty cart.
2. Use the **Item Selector** to add items. Items appear in the cart with quantity controls.
3. The cart total updates in real time.
4. Draft is auto-saved on every item add — survives browser close/reopen within the same POS session.

### Navigating Back to Tables

- If the cart has items: a draft invoice is auto-saved. The table is marked `Occupied` with a reference to the draft.
- If the cart is empty: the table is freed immediately (status → `Free`, draft deleted).
- Press the **Back** button or click "Tables" in the sidebar to return to the grid.

### Sending to Kitchen

1. While editing a table's order, click the **Send to Kitchen** button on the table badge.
2. The order is published via `kitchen_order_update` realtime event.
3. Kitchen Display page receives the order. Badge updates to "Order Sent".
4. Kitchen staff can mark the order **Ready** — this triggers `mark_order_ready` API and updates the table badge to "Order Ready".

### Checking Out

1. With items in the cart, proceed to checkout. The payment screen appears.
2. Select payment mode (Cash, Card, etc.), enter the tendered amount.
3. Submit payment. If the total matches, the invoice is submitted (docstatus 1) and the table is freed.
4. If the cart is modified before submission, the draft is first saved.

### Kitchen Display Page

1. Navigate to `/kitchen-display` (visible only to `System Manager`; the `mark_order_ready` API additionally accepts the `Kitchen User` role).
2. Orders appear as `.kitchen-card` elements with status badges (NEW, RECEIVED, LATE — READY appears only after staff mark the order ready).
3. Click **Ready** on any card to mark it ready — this calls the `mark_order_ready` API.
4. Orders are re-fetched every 30 seconds and on the `kitchen_order_update` realtime event.
5. New orders play a short sound notification.

### Order Locking (Ready Orders)

When a table's kitchen status is "Ready":

- The item selector is hidden — cashiers cannot add/remove items.
- The numpad is disabled — no manual quantity entry.
- Customer selection is disabled — cannot change the customer/contact.
- A **"Print Bill"** button appears in the totals section.
- Attempts to modify the cart show: "Order is ready for payment. Cannot modify items."

This lock is enforced by `restaurant_pos._is_order_locked()` and guards against bypasses from other apps (e.g., awesome_butchery).

### Concurrent Access (Multiple Cashiers)

- Each cashier opens their own POS entry. Draft persistence and table freeing are global — `free_tables_if_all_sessions_closed` counts ALL open POS Opening Entries across cashiers, not per-entry.
- Any cashier can click an Occupied table: the existing draft loads into the cart for full editing (there is no read-only mode or creator check — `select_table`/`edit_table_draft` never compare `frm.doc.owner`).
- Free tables have no lock — any cashier can start a new order.

## Quick Workflow: Table Cycle

```text
1. Select Free Table 2 → item selection page, empty cart
2. Add "Burger" (1x, 85.00) → cart total: 85.00
3. Add "Soda"   (1x, 25.00) → cart total: 110.00
4. Click "Send to Kitchen" on table badge
   → Order sent, kitchen_status = Received, badge: "Order Sent"
5. Kitchen staff mark "Ready"
   → Table badge: "Order Ready"
6. Proceed to checkout
   → Payment screen, enter 110.00 cash, submit
   → Invoice submitted, table freed (status = Free)
7. Table 2 reverts to Free, ready for next guest
```