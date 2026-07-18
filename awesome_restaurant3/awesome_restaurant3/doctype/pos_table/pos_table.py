import frappe
from frappe.model.document import Document


class POSTable(Document):
	pass


@frappe.whitelist()
def bulk_create_by_prefix(prefix, count, status="Free", profiles=None):
	try:
		count = int(count)
	except (TypeError, ValueError):
		return {"error": "Count must be a number"}

	if count < 1:
		return {"error": "Count must be at least 1"}

	if profiles and isinstance(profiles, str):
		profiles = frappe.parse_json(profiles)

	created = []
	errors = []

	for i in range(1, count + 1):
		table_number = f"{prefix}{i}"
		try:
			doc = frappe.new_doc("POS Table")
			doc.table_number = table_number
			doc.status = status
			if profiles:
				for p in profiles:
					doc.append("applicable_profiles", {"pos_profile": p.get("pos_profile")})
			doc.insert()
			created.append(doc.name)
		except frappe.exceptions.DuplicateEntryError:
			errors.append({"table": table_number, "error": "Table already exists"})
		except Exception as e:
			errors.append({"table": table_number, "error": str(e)})

	return {"created": created, "errors": errors}
