import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields({
		"POS Invoice": [
			{
				"fieldname": "is_created_using_pos",
				"label": "Is Created Using POS",
				"fieldtype": "Check",
				"insert_after": "is_pos",
				"hidden": 1,
				"read_only": 1,
			},
		],
	})
