import frappe
from frappe.tests.classes import IntegrationTestCase


class TestPOSTable(IntegrationTestCase):
    def test_default_status_is_free_on_insert(self):
        """A new POS Table should default to Free status."""
        table = frappe.new_doc("POS Table")
        table.table_number = "Test Table 1"
        table.insert()
        self.assertEqual(table.status, "Free")

    def test_table_number_is_mandatory(self):
        """table_number field is required."""
        table = frappe.new_doc("POS Table")
        with self.assertRaises(frappe.ValidationError):
            table.insert()

    def test_status_options_free_and_occupied(self):
        """Status should only accept Free or Occupied."""
        table = frappe.new_doc("POS Table")
        table.table_number = "Test Table 2"
        table.status = "InvalidStatus"
        with self.assertRaises(frappe.ValidationError):
            table.insert()

