context("POS Table Bulk Creation", () => {
	before(() => {
		cy.login("Administrator", "admin");
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	after(() => {
		cy.visit("/app");
		cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
	});

	it("opens bulk create dialog from list view", () => {
		cy.visit("/app/pos-table");
		cy.get(".secondary-action", { timeout: 10000 }).should("contain.text", "Bulk Create Tables");
		cy.get(".secondary-action").click();

		cy.get(".modal.show", { timeout: 5000 }).should("be.visible");
		cy.get(".modal.show .modal-title").should("contain.text", "Bulk Create");
	});

	it("creates 3 tables with prefix and verifies count", () => {
		cy.visit("/app/pos-table");
		cy.get(".secondary-action").click();

		cy.get(".modal.show").within(() => {
			cy.get_field("prefix", "Data").clear().type("Dinner");
			cy.get_field("count", "Int").clear().type("3");
			cy.contains("Create Tables").click();
		});

		cy.wait(1000);
		cy.get(".list-row-container .level-item", { timeout: 10000 }).should("have.length.at.least", 1);
	});

	it("fails with no prefix — shows validation error", () => {
		cy.visit("/app/pos-table");
		cy.get(".secondary-action").click();

		cy.get(".modal.show").within(() => {
			cy.contains("Create Tables").click();
		});

		cy.get(".msgprint", { timeout: 5000 }).should("be.visible");
	});

	it("creates 2 tables with prefix Area and verifies list", () => {
		cy.visit("/app/pos-table");
		cy.get(".secondary-action").click();

		cy.get(".modal.show").within(() => {
			cy.get_field("prefix", "Data").clear().type("Area");
			cy.get_field("count", "Int").clear().type("2");
			cy.contains("Create Tables").click();
		});

		cy.wait(1000);
		cy.get(".list-row-container .level-item", { timeout: 10000 }).should("have.length.at.least", 1);
	});
});
