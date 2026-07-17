import frappe
from frappe.model.document import Document


class POSTable(Document):
	def validate(self):
		if self.applicable_profiles:
			self.applicable_profiles = [
				row for row in self.applicable_profiles if row.pos_profile
			]


@frappe.whitelist()
def bulk_create_tables(tables):
	tables = frappe.parse_json(tables)
	created = []
	errors = []

	for row in tables:
		try:
			doc = frappe.new_doc("POS Table")
			doc.table_number = row.get("table_number")
			doc.status = row.get("status", "Free")
			doc.insert()
			created.append(doc.name)
		except frappe.exceptions.DuplicateEntryError:
			errors.append({"table": row.get("table_number"), "error": "Table already exists"})
		except Exception as e:
			errors.append({"table": row.get("table_number"), "error": str(e)})

	total = len(created) + len(errors)
	if errors:
		frappe.msgprint(
			f"Created {len(created)} of {total} tables."
		)

	return {"created": created, "errors": errors}


@frappe.whitelist()
def get_tables_for_profile(pos_profile):
	tables = frappe.get_all("POS Table",
		filters=[
			["POS Table Profile", "pos_profile", "=", pos_profile]
		],
		fields=["name", "table_number", "status", "current_invoice", "current_invoice_doctype", "modified"],
		order_by="table_number",
	)
	return tables


@frappe.whitelist()
def bulk_create_by_prefix(prefix, count, status="Free", profiles=None):
	"""Create tables using prefix + count pattern (e.g. prefix=T, count=5 → T1→T5)."""
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
