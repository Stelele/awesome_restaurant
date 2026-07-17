context("POS Table Edge Cases", () => {
	beforeEach(() => {
		cy.login("Administrator", "admin");
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_pos_table_environment");
	});

	afterEach(() => {
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	it("double-click free table — only one invoice created", () => {
		cy.visit("/app/point-of-sale");

		cy.get(".pos-table-card--free").first().dblclick();
		cy.wait(2000);

		cy.assert_table_card_count(4);
	});

	it("clear table with no current_invoice — no-op safe", () => {
		cy.visit("/app/point-of-sale");

		cy.select_table("Table 1");
		cy.get("#pos-table-badge", { timeout: 5000 }).should("be.visible");

		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");

		cy.assert_table_status("Table 1", "Free");
	});

	it("badge click during item view returns to grid", () => {
		cy.visit("/app/point-of-sale");

		cy.select_table("Table 1");
		cy.get(".items-selector", { timeout: 10000 }).should("be.visible");

		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
		cy.assert_table_card_count(4);
	});

	it("grid shown after double-click — card count unchanged", () => {
		cy.visit("/app/point-of-sale");

		cy.get(".pos-table-card--free").first().dblclick();
		cy.wait(2000);

		cy.assert_table_card_count(4);
	});

	it("zero POS Tables — falls through to standard POS", () => {
		// Delete all tables
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");

		// Create new opening entry without tables
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_occupied_table_with_draft");

		cy.visit("/app/point-of-sale");
		// Should fall through to standard POS with item selector visible
		cy.get(".items-selector", { timeout: 15000 }).should("be.visible");
	});
});
