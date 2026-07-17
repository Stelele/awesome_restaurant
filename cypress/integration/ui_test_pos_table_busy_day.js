context("Busy Day Simulation - Holiday Rush", () => {

	before(() => {
		cy.login("Administrator", "admin");
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_pos_table_environment");
	});

	after(() => {
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	it("morning: 4 tables, all free", () => {
		cy.visit("/app/point-of-sale");
		cy.assert_table_card_count(4);
		cy.get(".pos-table-card--free").should("have.length", 4);
	});

	it("round 1: seat 2 tables, go to kitchen view, come back", () => {
		cy.select_table("Table 1");
		cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 1");
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");

		cy.select_table("Table 2");
		cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 2");
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");

		cy.assert_table_card_count(4);
	});

	it("round 2: 3 tables being worked, re-select first", () => {
		cy.select_table("Table 3");
		cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 3");
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");

		cy.select_table("Table 4");
		cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 4");
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");

		cy.select_table("Table 1");
		cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 1");
		cy.go_back_from_table();
		cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
	});

	it("round 3: rapid cycling — select and go back 4 times on same table", () => {
		for (let i = 0; i < 4; i++) {
			cy.select_table("Table 2");
			cy.get("#pos-table-badge", { timeout: 10000 }).should("contain.text", "Table 2");
			cy.go_back_from_table();
			cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
		}
		cy.assert_table_card_count(4);
	});

	it("end of day: all tables still show, grid intact", () => {
		cy.get(".pos-table-card").should("have.length", 4);
		cy.get(".pos-table-grid-wrapper").should("be.visible");
	});
});
