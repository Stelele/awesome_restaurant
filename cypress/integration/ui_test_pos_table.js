context("POS Table Grid", () => {
    before(() => {
        cy.login("Administrator", "admin");
        cy.visit("/app");
        cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.setup_pos_table_environment");
    });

    after(() => {
        cy.visit("/app");
        cy.call("awesome_restaurant3.awesome_restaurant3.tests.ui_test_helpers.teardown_pos_table_environment");
    });

    it("renders table grid without filter_items JS errors", () => {
        cy.visit("/app/point-of-sale");

        cy.get(".pos-table-card", { timeout: 15000 }).should("have.length", 4);
        cy.get(".pos-table-card--free").should("have.length", 4);
    });

    it("clicking a free table opens the item selector", () => {
        cy.get(".pos-table-card--free").first().click();
        cy.get(".items-selector", { timeout: 10000 }).should("be.visible");
        cy.get("#pos-table-badge").should("be.visible");
    });

    it("going back returns to table grid and frees empty table", () => {
        cy.get("#pos-table-badge").click();
        cy.get(".pos-table-grid", { timeout: 10000 }).should("be.visible");
        cy.get(".pos-table-card--free").should("have.length", 4);
    });
});
