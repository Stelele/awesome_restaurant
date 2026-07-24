import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	custom_fields = {
		"POS Invoice": [
			{
				"fieldname": "restaurant_table",
				"label": "Restaurant Table",
				"fieldtype": "Data",
				"insert_after": "pos_profile",
			},
			{
				"fieldname": "custom_tip_amount",
				"label": "Tip Amount",
				"fieldtype": "Currency",
				"insert_after": "restaurant_table",
				"read_only": 1,
				"allow_on_submit": 1,
			},
			{
				"fieldname": "kitchen_status",
				"label": "Kitchen Status",
				"fieldtype": "Select",
				"options": "\nReceived\nReady",
				"insert_after": "custom_tip_amount",
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
		"POS Invoice Item": [
			{
				"fieldname": "sent_to_kitchen_at",
				"label": "Sent to Kitchen At",
				"fieldtype": "Datetime",
				"allow_on_submit": 1,
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
		"POS Profile": [
			{
				"fieldname": "custom_tip_item",
				"label": "Tip Item",
				"fieldtype": "Link",
				"options": "Item",
				"insert_after": "allow_discount_change",
				"description": "Non-stock item used for adding tips to restaurant orders",
			},
		],
	}

	create_custom_fields(custom_fields)

	frappe.db.sql("""
		CREATE INDEX IF NOT EXISTS idx_kitchen_queue
		ON `tabPOS Invoice` (kitchen_status, sent_to_kitchen_at)
	""")
