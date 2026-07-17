Cypress.Commands.add("select_table", (tableNumber) => {
	cy.get(`.pos-table-card[data-table="${tableNumber}"]`).click();
});

Cypress.Commands.add("go_back_from_table", () => {
	cy.get("#pos-table-badge").click();
});

Cypress.Commands.add("clear_table_via_ui", (tableNumber) => {
	cy.get(`.pos-table-card[data-table="${tableNumber}"] .pos-table-card__clear`).click();
	cy.get(".modal:visible .btn-primary").click();
});

Cypress.Commands.add("assert_table_card_count", (count) => {
	cy.get(".pos-table-card").should("have.length", count);
});

Cypress.Commands.add("assert_table_status", (tableNumber, status) => {
	const selector = `.pos-table-card[data-table="${tableNumber}"]`;
	if (status === "Occupied") {
		cy.get(selector).should("have.class", "pos-table-card--occupied");
	} else {
		cy.get(selector).should("have.class", "pos-table-card--free");
	}
});
