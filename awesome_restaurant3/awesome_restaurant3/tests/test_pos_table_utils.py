import frappe
from unittest.mock import patch
from frappe.tests.classes import IntegrationTestCase


class TestBroadcastTableUpdate(IntegrationTestCase):
    def test_broadcast_on_table_status_change(self):
        """Changing POS Table status should broadcast real-time update."""
        table = frappe.new_doc("POS Table")
        table.table_number = "BcStatus" + frappe.generate_hash(length=6)
        table.insert()

        with patch.object(frappe, "publish_realtime") as mock_publish:
            table.status = "Occupied"
            table.save()
            mock_publish.assert_any_call("pos_table_update", {
                "table_number": table.table_number,
                "status": "Occupied",
                "current_invoice": None,
                "current_invoice_doctype": None,
            })

    def test_broadcast_on_table_insert(self):
        """Inserting a new POS Table should broadcast real-time update."""
        with patch.object(frappe, "publish_realtime") as mock_publish:
            table = frappe.new_doc("POS Table")
            table.table_number = "BcInsert" + frappe.generate_hash(length=6)
            table.insert()
            mock_publish.assert_any_call("pos_table_update", {
                "table_number": table.table_number,
                "status": "Free",
                "current_invoice": None,
                "current_invoice_doctype": None,
            })


class TestFreeTablesOnSessionClose(IntegrationTestCase):
    def setUp(self):
        self.table = frappe.new_doc("POS Table")
        self.table.table_number = "FreeTest" + frappe.generate_hash(length=6)
        self.table.status = "Occupied"
        self.table.current_invoice = "SINV-TEST-001"
        self.table.insert()

    def test_frees_tables_when_no_open_sessions_remain(self):
        """All POS Tables should be freed when no open POS Opening Entries exist."""
        from awesome_restaurant3.awesome_restaurant3.pos_table_utils import (
            free_tables_if_all_sessions_closed,
        )

        with patch.object(frappe.db, "count", return_value=0):
            free_tables_if_all_sessions_closed()

        self.table.reload()
        self.assertEqual(self.table.status, "Free")
        self.assertIsNone(self.table.current_invoice)

    def test_does_not_free_tables_when_sessions_open(self):
        """Tables should NOT be freed when there are still open sessions."""
        from awesome_restaurant3.awesome_restaurant3.pos_table_utils import (
            free_tables_if_all_sessions_closed,
        )

        with patch.object(frappe.db, "count", return_value=5):
            free_tables_if_all_sessions_closed()

        self.table.reload()
        self.assertEqual(self.table.status, "Occupied")
