import frappe


def broadcast_table_update(doc, method=None):
    """Emit real-time event on every POS Table save."""
    frappe.publish_realtime(
        "pos_table_update",
        {
            "table_number": doc.table_number,
            "status": doc.status,
            "current_invoice": doc.current_invoice,
            "current_invoice_doctype": doc.current_invoice_doctype,
        },
    )


def free_tables_if_all_sessions_closed(doc=None, method=None):
    """On POS Closing Entry submit, check if any open sessions remain.
    If none, free all Occupied POS Tables."""
    open_entries = frappe.db.count("POS Opening Entry", {"status": "Open"})
    if open_entries == 0:
        tables = frappe.get_all("POS Table", filters={"status": "Occupied"})
        for table in tables:
            frappe.db.set_value(
                "POS Table",
                table.name,
                {
                    "status": "Free",
                    "current_invoice": None,
                    "current_invoice_doctype": None,
                },
			)


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


@frappe.whitelist()
def send_order_to_kitchen(invoice_name):
	"""Mark an invoice as sent to kitchen."""
	if frappe.session.user == "Guest":
		frappe.throw("You do not have permission to perform this action.")

	doc = frappe.get_doc("POS Invoice", invoice_name)
	if doc.docstatus != 0:
		frappe.throw("Only draft invoices can be sent to kitchen.")

	if not doc.items:
		frappe.throw("Cannot send an empty order to kitchen.")

	now = frappe.utils.now_datetime()
	for item in doc.items:
		if not item.sent_to_kitchen_at:
			item.sent_to_kitchen_at = now
	doc.kitchen_status = "Received"
	if not doc.sent_to_kitchen_at:
		doc.sent_to_kitchen_at = now
	doc.save(ignore_permissions=True)

	doc.add_comment(
		"Comment",
		"Order sent to kitchen by {0}".format(frappe.session.user),
	)

	return {"kitchen_status": doc.kitchen_status, "sent_to_kitchen_at": str(doc.sent_to_kitchen_at)}


@frappe.whitelist()
def mark_order_ready(invoice_name):
	"""Mark an order as ready (cook action)."""
	if "Kitchen User" not in frappe.get_roles() and "System Manager" not in frappe.get_roles():
		frappe.throw("You do not have permission to perform this action.")

	# Atomic update to avoid TOCTOU race
	frappe.db.set_value("POS Invoice", invoice_name, "kitchen_status", "Ready")

	invoice = frappe.get_cached_doc("POS Invoice", invoice_name)
	invoice.add_comment(
		"Comment",
		"Order marked Ready by {0}".format(frappe.session.user),
	)

	if invoice.restaurant_table:
		table_doc = frappe.get_cached_doc("POS Table", invoice.restaurant_table)
		frappe.publish_realtime(
			"pos_table_update",
			{
				"table_number": table_doc.table_number,
				"status": table_doc.status,
				"current_invoice": table_doc.current_invoice,
				"current_invoice_doctype": table_doc.current_invoice_doctype,
				"current_total": table_doc.current_total,
				"current_item_count": table_doc.current_item_count,
				"occupied_at": str(table_doc.occupied_at) if table_doc.occupied_at else None,
				"kitchen_status": "Ready",
			},
		)

	return {"kitchen_status": "Ready"}


@frappe.whitelist()
def get_kitchen_orders():
	"""Return all active kitchen orders (status = Received), ordered by sent_to_kitchen_at."""
	items_data = frappe.db.sql("""
		SELECT
			si.name,
			si.pos_profile,
			si.restaurant_table,
			si.sent_to_kitchen_at,
			si.modified,
			sii.name AS item_row_name,
			sii.item_name,
			sii.qty,
			sii.item_code,
			sii.sent_to_kitchen_at AS item_sent_at
		FROM `tabPOS Invoice` si
		LEFT JOIN `tabPOS Invoice Item` sii ON sii.parent = si.name
		WHERE si.kitchen_status = 'Received'
			AND si.docstatus = 0
			AND si.restaurant_table IS NOT NULL
			AND si.restaurant_table != ''
		ORDER BY si.sent_to_kitchen_at ASC
	""", as_dict=True)

	tip_codes = {}
	orders = {}
	for row in items_data:
		if row.item_row_name is None:
			continue
		if row.name not in orders:
			orders[row.name] = {
				"name": row.name,
				"restaurant_table": row.restaurant_table,
				"sent_to_kitchen_at": str(row.sent_to_kitchen_at) if row.sent_to_kitchen_at else None,
				"modified": str(row.modified),
				"items": [],
				"has_been_modified": bool(
					row.sent_to_kitchen_at and row.modified
					and row.modified > row.sent_to_kitchen_at
				),
			}
			if row.pos_profile:
				tip_codes[row.name] = frappe.db.get_value(
					"POS Profile", row.pos_profile, "custom_tip_item"
				) or ""

		if tip_codes.get(row.name) == row.item_code:
			continue

		is_new = row.item_sent_at is None
		orders[row.name]["items"].append({
			"item_name": row.item_name,
			"qty": row.qty,
			"is_new": is_new,
		})

	return list(orders.values())


@frappe.whitelist()
def get_tip_item_code(pos_profile):
	"""Return the tip item code configured on a POS Profile."""
	value = frappe.db.get_value("POS Profile", pos_profile, "custom_tip_item")
	return value or ""
