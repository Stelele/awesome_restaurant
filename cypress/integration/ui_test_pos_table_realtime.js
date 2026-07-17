context("POS Table Realtime", () => {
	before(() => {
		cy.login("Administrator", "admin");
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_pos_table_environment");
	});

	after(() => {
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	it("realtime update — table occupied remotely updates card", () => {
		cy.visit("/app/point-of-sale");
		cy.assert_table_card_count(4);

		cy.call("frappe.client.set_value", {
			doctype: "POS Table",
			name: "Table 1",
			fieldname: "status",
			value: "Occupied",
		});
		cy.wait(1000);

		cy.assert_table_status("Table 1", "Occupied");
	});

	it("realtime update — table freed remotely updates card", () => {
		cy.call("frappe.client.set_value", {
			doctype: "POS Table",
			name: "Table 1",
			fieldname: "status",
			value: "Free",
		});
		cy.wait(1000);

		cy.assert_table_status("Table 1", "Free");
	});

	it("go back after remote table clear while on that table", () => {
		cy.select_table("Table 1");
		cy.get("#pos-table-badge", { timeout: 5000 }).should("be.visible");

		cy.call("frappe.client.set_value", {
			doctype: "POS Table",
			name: "Table 1",
			fieldname: "status",
			value: "Free",
		});

		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
		cy.assert_table_card_count(4);
	});
});
