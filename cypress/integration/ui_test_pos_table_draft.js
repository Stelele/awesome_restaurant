context("POS Table Draft Management", () => {
	before(() => {
		cy.login("Administrator", "admin");
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_pos_table_environment");
	});

	after(() => {
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	it("select table, wait for selector, go back — frees empty table", () => {
		cy.visit("/app/point-of-sale");

		cy.get(".pos-table-card--free").first().click();
		cy.get(".items-selector", { timeout: 10000 }).should("be.visible");
		cy.get("#pos-table-badge").should("be.visible");

		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
		cy.assert_table_status("Table 1", "Free");
	});

	it("re-select same table — opens item selector again", () => {
		cy.select_table("Table 1");
		cy.get(".items-selector", { timeout: 10000 }).should("be.visible");
		cy.get("#pos-table-badge").should("be.visible");
		cy.get("#pos-table-badge").should("contain.text", "Table 1");
	});

	it("go back from empty table — grid shown, all free", () => {
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
		cy.assert_table_card_count(4);
	});
});
