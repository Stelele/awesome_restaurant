import frappe
from frappe.tests.utils import whitelist_for_tests

_CREATED = {"tables": [], "opening_entry": None}


@whitelist_for_tests()
def setup_pos_table_environment():
    """Set up test data for POS Table UI tests."""
    _CREATED["tables"] = []

    company = frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        company = frappe.get_list("Company", limit=1, pluck="name")[0]

    warehouse = get_or_create_test_warehouse(company)

    stock_test_item(warehouse, company)

    pos_profile = get_or_create_test_pos_profile(company, warehouse)

    _cleanup_existing_data(frappe.session.user)

    for table_name in frappe.get_all("POS Table", pluck="name"):
        try:
            frappe.delete_doc("POS Table", table_name, ignore_permissions=True, delete_permanently=True)
        except Exception:
            pass
    frappe.db.commit()

    for i in range(1, 5):
        table = frappe.get_doc({
            "doctype": "POS Table",
            "table_number": f"Table {i}",
            "status": "Free",
        })
        table.append("applicable_profiles", {"pos_profile": pos_profile})
        table.insert()
        _CREATED["tables"].append(table.name)

    opening = frappe.new_doc("POS Opening Entry")
    opening.pos_profile = pos_profile
    opening.user = frappe.session.user
    opening.company = company
    opening.period_start_date = frappe.utils.now_datetime()
    opening.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
    opening.insert(ignore_permissions=True)
    opening.submit()
    _CREATED["opening_entry"] = opening.name

    frappe.db.commit()

    return {"table_count": 4, "pos_profile": pos_profile}


@whitelist_for_tests()
def teardown_pos_table_environment():
    """Clean up ALL test data — operational + infrastructure — in dependency order."""
    _CREATED["tables"] = []
    _CREATED["opening_entry"] = None

    # 1. POS Tables (no deps)
    for name in list(frappe.get_all("POS Table", pluck="name")):
        try:
            frappe.delete_doc("POS Table", name, ignore_permissions=True, delete_permanently=True)
        except Exception:
            pass

    # 2. Invoices (cancel submitted, then delete)
    for doctype in ("POS Invoice", "Sales Invoice"):
        for name in list(frappe.get_all(doctype, pluck="name")):
            try:
                doc = frappe.get_doc(doctype, name)
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc(doctype, name, ignore_permissions=True, delete_permanently=True)
            except Exception:
                pass

    # 3. Leave opening entries intact — _cleanup_existing_data in setup handles them

    frappe.db.commit()


def _cleanup_existing_data(user):
    """Cancel any existing open POS Opening Entries for the test user."""
    open_entries = frappe.get_all("POS Opening Entry",
        filters={"user": user, "docstatus": 1},
        pluck="name",
    )
    for name in open_entries:
        try:
            doc = frappe.get_doc("POS Opening Entry", name)
            doc.cancel()
        except Exception:
            pass
    frappe.db.commit()


def get_or_create_test_warehouse(company):
    warehouse = frappe.db.get_value("Warehouse", {"warehouse_name": "_Test POS Warehouse", "company": company}, "name")
    if not warehouse:
        warehouse_doc = frappe.get_doc({
            "doctype": "Warehouse",
            "warehouse_name": "_Test POS Warehouse",
            "company": company,
            "parent_warehouse": f"All Warehouses - {frappe.db.get_value('Company', company, 'abbr')}",
        })
        warehouse_doc.insert()
        warehouse = warehouse_doc.name
    return warehouse


def stock_test_item(warehouse, company):
    """Ensure test item has stock in the warehouse."""
    item_code = "_Test Item"
    if not frappe.db.exists("Item", item_code):
        item_doc = frappe.get_doc({
            "doctype": "Item",
            "item_code": item_code,
            "item_name": item_code,
            "item_group": "Products",
            "stock_uom": "Nos",
            "is_stock_item": 1,
            "is_sales_item": 1,
            "include_item_in_manufacturing": 0,
        })
        item_doc.insert()

    abbr = frappe.db.get_value("Company", company, "abbr")
    company_warehouse = f"Stores - {abbr}"

    if frappe.db.exists("Item Price", {"item_code": item_code, "price_list": "Standard Selling"}):
        return

    item_price = frappe.get_doc({
        "doctype": "Item Price",
        "item_code": item_code,
        "price_list": "Standard Selling",
        "price_list_rate": 100,
    })
    item_price.insert()
    frappe.db.commit()


def get_or_create_test_pos_profile(company, warehouse):
    profile_name = "_Test POS Profile"
    existing = frappe.db.exists("POS Profile", profile_name)
    if existing:
        return profile_name

    income_account = frappe.db.get_value(
        "Account",
        {"company": company, "root_type": "Income", "is_group": 0},
        "name",
    )
    expense_account = frappe.db.get_value(
        "Account",
        {"company": company, "root_type": "Expense", "account_type": "Cost of Goods Sold", "is_group": 0},
        "name",
    ) or frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 0}, "name")

    pos_profile = frappe.get_doc({
        "doctype": "POS Profile",
        "name": profile_name,
        "company": company,
        "warehouse": warehouse,
        "selling_price_list": "Standard Selling",
        "currency": frappe.db.get_value("Company", company, "default_currency"),
        "income_account": income_account,
        "expense_account": expense_account,
        "cost_center": frappe.db.get_value("Company", company, "cost_center"),
        "write_off_account": expense_account,
        "write_off_cost_center": frappe.db.get_value("Company", company, "cost_center"),
        "print_format": "POS Invoice",
        "payments": [{"mode_of_payment": "Cash", "default": 1}],
        "update_stock": 0,
    })
    pos_profile.insert()
    frappe.db.commit()

    return profile_name


@whitelist_for_tests()
def setup_tables_with_custom_state(tables_config):
	tables_config = frappe.parse_json(tables_config) if isinstance(tables_config, str) else tables_config
	created = []
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.get_list("Company", limit=1, pluck="name")[0]
	warehouse = get_or_create_test_warehouse(company)
	pos_profile = get_or_create_test_pos_profile(company, warehouse)
	for config in tables_config:
		table = frappe.get_doc({
			"doctype": "POS Table",
			"table_number": config["table_number"],
			"status": config.get("status", "Free"),
			"current_invoice": config.get("current_invoice"),
			"current_invoice_doctype": config.get("current_invoice_doctype"),
		})
		table.append("applicable_profiles", {"pos_profile": pos_profile})
		table.insert()
		created.append(table.name)
	frappe.db.commit()
	return {"created": created}


@whitelist_for_tests()
def setup_occupied_table_with_draft(pos_profile=None):
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.get_list("Company", limit=1, pluck="name")[0]

	warehouse = get_or_create_test_warehouse(company)
	stock_test_item(warehouse, company)

	if not pos_profile:
		pos_profile = get_or_create_test_pos_profile(company, warehouse)

	_cleanup_existing_data(frappe.session.user)

	opening = frappe.new_doc("POS Opening Entry")
	opening.pos_profile = pos_profile
	opening.user = frappe.session.user
	opening.company = company
	opening.period_start_date = frappe.utils.now_datetime()
	opening.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
	opening.insert(ignore_permissions=True)
	opening.submit()

	table = frappe.get_doc({
		"doctype": "POS Table",
		"table_number": "_Test Occupied",
		"status": "Occupied",
	})
	table.append("applicable_profiles", {"pos_profile": pos_profile})
	table.insert()

	frappe.db.commit()

	return {
		"table": table.name,
		"pos_profile": pos_profile,
		"opening_entry": opening.name,
	}


@whitelist_for_tests()
def setup_multi_profile_environment():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.get_list("Company", limit=1, pluck="name")[0]

	warehouse = get_or_create_test_warehouse(company)
	stock_test_item(warehouse, company)

	profile_a = _create_test_profile("_Test Profile A", company, warehouse)
	profile_b = _create_test_profile("_Test Profile B", company, warehouse)

	return {"profile_a": profile_a, "profile_b": profile_b}


def _create_test_profile(name, company, warehouse):
	if frappe.db.exists("POS Profile", name):
		return name

	income_account = frappe.db.get_value(
		"Account",
		{"company": company, "root_type": "Income", "is_group": 0},
		"name",
	)
	expense_account = frappe.db.get_value(
		"Account",
		{"company": company, "root_type": "Expense", "account_type": "Cost of Goods Sold", "is_group": 0},
		"name",
	) or frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 0}, "name")

	pos_profile = frappe.get_doc({
		"doctype": "POS Profile",
		"name": name,
		"company": company,
		"warehouse": warehouse,
		"selling_price_list": "Standard Selling",
		"currency": frappe.db.get_value("Company", company, "default_currency"),
		"income_account": income_account,
		"expense_account": expense_account,
		"cost_center": frappe.db.get_value("Company", company, "cost_center"),
		"write_off_account": expense_account,
		"write_off_cost_center": frappe.db.get_value("Company", company, "cost_center"),
		"print_format": "POS Invoice",
		"payments": [{"mode_of_payment": "Cash", "default": 1}],
		"update_stock": 0,
	})
	pos_profile.insert()
	frappe.db.commit()

	return pos_profile.name


@whitelist_for_tests()
def setup_busy_day_environment():
    """Set up a 3-terminal restaurant environment for a busy day simulation."""
    company = frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        company = frappe.get_list("Company", limit=1, pluck="name")[0]

    warehouse = get_or_create_test_warehouse(company)
    stock_test_item(warehouse, company)

    profiles = {
        "waiter_a": _create_test_profile("Busy Waiter A", company, warehouse),
        "waiter_b": _create_test_profile("Busy Waiter B", company, warehouse),
        "cashier": _create_test_profile("Busy Cashier", company, warehouse),
    }

    _cleanup_existing_data(frappe.session.user)

    for table_name in frappe.get_all("POS Table", pluck="name"):
        try:
            frappe.delete_doc("POS Table", table_name, ignore_permissions=True, delete_permanently=True)
        except Exception:
            frappe.db.rollback()

    for entry in frappe.get_all("POS Opening Entry", pluck="name"):
        try:
            doc = frappe.get_doc("POS Opening Entry", entry)
            if doc.docstatus == 1:
                doc.cancel()
            frappe.delete_doc("POS Opening Entry", entry, delete_permanently=True)
        except Exception:
            frappe.db.rollback()

    frappe.db.commit()

    table_assignments = [
        ("T1", profiles["waiter_a"]), ("T2", profiles["waiter_a"]),
        ("T3", profiles["waiter_a"]), ("T4", profiles["waiter_a"]),
        ("T5", profiles["waiter_b"]), ("T6", profiles["waiter_b"]),
        ("T7", profiles["waiter_b"]), ("T8", profiles["cashier"]),
    ]

    for table_number, profile in table_assignments:
        table = frappe.get_doc({
            "doctype": "POS Table",
            "table_number": table_number,
            "status": "Free",
        })
        table.append("applicable_profiles", {"pos_profile": profile})
        table.insert()

    opening_entries = {}
    for key, profile in profiles.items():
        if key == "waiter_a":
            opening = frappe.new_doc("POS Opening Entry")
            opening.pos_profile = profile
            opening.user = frappe.session.user
            opening.company = company
            opening.period_start_date = frappe.utils.now_datetime()
            opening.append("balance_details", {"mode_of_payment": "Cash", "opening_amount": 0})
            opening.insert(ignore_permissions=True)
            opening.submit()
            opening_entries[key] = opening.name

    frappe.db.commit()

    return {
        "table_count": 8,
        "profiles": profiles,
        "opening_entries": opening_entries,
    }


@whitelist_for_tests()
def complete_order(table_number):
    """Complete a sale for the given table: submit the invoice and free the table."""
    tables = frappe.get_all("POS Table",
        filters={"table_number": table_number},
        fields=["name", "current_invoice", "current_invoice_doctype"],
    )
    table = tables[0] if tables else None
    if not table or not table.current_invoice:
        return {"error": "No open invoice for table " + table_number}

    invoice = frappe.get_doc(table.current_invoice_doctype, table.current_invoice)
    if invoice.docstatus != 0:
        return {"error": "Invoice not in draft state"}

    invoice.is_pos = 1
    invoice.pos_profile = frappe.db.get_value("POS Opening Entry",
        {"user": frappe.session.user, "status": "Open"}, "pos_profile")

    if not invoice.payments:
        cash_mop = frappe.db.get_value("Mode of Payment", "Cash", "name") or "Cash"
        invoice.append("payments", {
            "mode_of_payment": cash_mop,
            "amount": invoice.grand_total or invoice.total or 0,
        })

    invoice.submit()

    frappe.db.set_value("POS Table", table.name, {
        "status": "Free",
        "current_invoice": None,
        "current_invoice_doctype": None,
    })

    frappe.db.commit()
    return {"status": "completed", "invoice": invoice.name, "table": table_number}


@whitelist_for_tests()
def seat_table(table_number, item_code=None, qty=1):
    """Create a draft invoice for a table (simulates a waiter seating customers)."""
    tables = frappe.get_all("POS Table",
        filters={"table_number": table_number},
        fields=["name", "status"],
    )
    if not tables:
        return {"error": f"Table {table_number} not found"}

    table = tables[0]
    if table.status == "Occupied":
        return {"error": f"Table {table_number} is already occupied"}

    company = frappe.db.get_single_value("Global Defaults", "default_company")
    pos_profile = frappe.db.get_value("POS Opening Entry",
        {"user": frappe.session.user, "status": "Open"}, "pos_profile")
    if not pos_profile:
        return {"error": "No open POS Opening Entry"}

    if not item_code:
        item_code = "_Test Item"

    item = frappe.get_doc("Item", item_code)
    rate = item.standard_rate or frappe.db.get_value("Item Price",
        {"item_code": item_code, "price_list": "Standard Selling"}, "price_list_rate") or 100

    if not frappe.db.exists("Customer", "Walk In Customer"):
        frappe.get_doc({
            "doctype": "Customer",
            "customer_name": "Walk In Customer",
            "customer_type": "Individual",
            "customer_group": "_Test Customer Group",
            "territory": "All Territories",
        }).insert()
        frappe.db.commit()

    invoice_type = frappe.db.get_single_value("POS Settings", "invoice_type") or "POS Invoice"
    invoice = frappe.new_doc(invoice_type)
    invoice.is_pos = 1
    invoice.company = company
    invoice.pos_profile = pos_profile
    invoice.customer = "Walk In Customer"
    invoice.append("payments", {
        "mode_of_payment": "Cash",
        "amount": qty * rate,
    })
    invoice.append("items", {
        "item_code": item_code,
        "qty": qty,
        "rate": rate,
        "item_name": item.item_name,
        "stock_uom": item.stock_uom,
        "uom": item.stock_uom,
    })
    invoice.insert()

    frappe.db.set_value("POS Table", table.name, {
        "status": "Occupied",
        "current_invoice": invoice.name,
        "current_invoice_doctype": invoice_type,
    })

    frappe.db.commit()
    return {
        "status": "seated",
        "table": table_number,
        "invoice": invoice.name,
        "item": item_code,
        "qty": qty,
    }


@whitelist_for_tests()
def add_item_to_order(table_number, item_code=None, qty=1):
    """Add an item to the draft invoice for the given table."""
    tables = frappe.get_all("POS Table",
        filters={"table_number": table_number},
        fields=["name", "current_invoice", "current_invoice_doctype"],
    )
    table = tables[0] if tables else None
    if not table or not table.current_invoice:
        return {"error": "No open invoice for table " + table_number}

    if not item_code:
        item_code = "_Test Item"

    if not frappe.db.exists(table.current_invoice_doctype, table.current_invoice):
        return {"error": f"Invoice {table.current_invoice} not yet saved to DB"}

    invoice = frappe.get_doc(table.current_invoice_doctype, table.current_invoice)
    if invoice.docstatus != 0:
        return {"error": "Invoice not in draft state"}

    existing = next((i for i in invoice.items if i.item_code == item_code), None)
    if existing:
        existing.qty += qty
    else:
        item = frappe.get_doc("Item", item_code)
        invoice.append("items", {
            "item_code": item_code,
            "qty": qty,
            "rate": item.standard_rate or frappe.db.get_value("Item Price",
                {"item_code": item_code, "price_list": "Standard Selling"}, "price_list_rate") or 100,
            "item_name": item.item_name,
            "stock_uom": item.stock_uom,
            "uom": item.stock_uom,
        })

    invoice.save()
    frappe.db.commit()
    return {"status": "added", "invoice": invoice.name, "item": item_code, "qty": qty}


