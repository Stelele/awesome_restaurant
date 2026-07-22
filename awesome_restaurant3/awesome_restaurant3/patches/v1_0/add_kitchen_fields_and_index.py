import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Add kitchen_status and sent_to_kitchen_at custom fields to POS Invoice, plus composite DB index."""
	create_custom_fields({
		"POS Invoice": [
			{
				"fieldname": "kitchen_status",
				"label": "Kitchen Status",
				"fieldtype": "Select",
				"options": "\nReceived\nReady",
				"insert_after": "restaurant_table",
				"allow_on_submit": 1,
				"read_only": 1,
			},
			{
				"fieldname": "sent_to_kitchen_at",
				"label": "Sent to Kitchen At",
				"fieldtype": "Datetime",
				"insert_after": "kitchen_status",
				"allow_on_submit": 1,
				"read_only": 1,
			},
		],
	})

	frappe.db.sql("""
		CREATE INDEX IF NOT EXISTS idx_kitchen_queue
		ON `tabPOS Invoice` (kitchen_status, sent_to_kitchen_at)
	""")
