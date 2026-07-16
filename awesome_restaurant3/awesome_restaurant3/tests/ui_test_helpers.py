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
    """Clean up test data created by setup_pos_table_environment."""
    for table_name in _CREATED["tables"]:
        try:
            frappe.delete_doc("POS Table", table_name, ignore_permissions=True, delete_permanently=True)
        except Exception:
            frappe.db.rollback()

    if _CREATED["opening_entry"]:
        try:
            frappe.delete_doc("POS Opening Entry", _CREATED["opening_entry"], delete_permanently=True)
        except Exception:
            frappe.db.rollback()

    _CREATED["tables"] = []
    _CREATED["opening_entry"] = None
    frappe.db.commit()


def _cleanup_existing_data(user):
    """Close any existing open POS Opening Entries for the test user."""
    open_entries = frappe.get_all("POS Opening Entry",
        filters={"user": user, "status": "Open"},
        pluck="name",
    )
    for name in open_entries:
        frappe.db.set_value("POS Opening Entry", name, "status", "Closed")
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
