import frappe
from unittest.mock import patch
from frappe.tests.classes import IntegrationTestCase


class TestFreeTablesOnSessionClose(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.db.begin()

	def tearDown(self):
		frappe.db.rollback()
		super().tearDown()

	def test_frees_tables_when_no_open_sessions_remain(self):
		from awesome_restaurant3.awesome_restaurant3.pos_table_utils import free_tables_if_all_sessions_closed

		table = frappe.new_doc("POS Table")
		table.table_number = "FreeTest" + frappe.generate_hash(length=6)
		table.status = "Occupied"
		table.current_invoice = "SINV-TEST-001"
		table.insert()

		with patch.object(frappe.db, "count", return_value=0):
			free_tables_if_all_sessions_closed()

		table.reload()
		self.assertEqual(table.status, "Free")
		self.assertIsNone(table.current_invoice)

	def test_does_not_free_tables_when_sessions_open(self):
		from awesome_restaurant3.awesome_restaurant3.pos_table_utils import free_tables_if_all_sessions_closed

		table = frappe.new_doc("POS Table")
		table.table_number = "KeepTest" + frappe.generate_hash(length=6)
		table.status = "Occupied"
		table.current_invoice = "SINV-KEEP-TEST-001"
		table.insert()

		with patch.object(frappe.db, "count", return_value=5):
			free_tables_if_all_sessions_closed()

		table.reload()
		self.assertEqual(table.status, "Occupied")
