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
        frappe.db.commit()
