Feature: Item Ordering
  As a restaurant cashier
  I want to add, remove, and modify items in a table's cart
  So that I can accurately build a customer's order

  Background:
    Given a POS profile "Restaurant" is configured
    And the cashier has opened a POS entry
    And the following items exist:
      | item_name | rate   |
      | Burger    | 85.00  |
      | Soda      | 25.00  |
      | Pizza     | 120.00 |
      | Pasta     | 95.00  |
      | Fries     | 45.00  |
    And Table 2 has no existing draft invoice
    And the cashier has selected Table 2 from the table grid

  @happy-path @add-item
  Scenario: Add a single item to an empty cart
    When the cashier adds "Burger" to the cart
    Then the cart displays exactly 1 line item
    And the cart displays "Burger" with quantity 1 and total 85.00
    And the cart total is 85.00

  @add-multiple
  Scenario: Add multiple different items to the cart
    When the cashier adds "Burger" to the cart
    And the cashier adds "Soda" to the cart
    Then the cart displays exactly 2 line items
    And the cart displays "Burger" with quantity 1 and total 85.00
    And the cart displays "Soda" with quantity 1 and total 25.00
    And the cart total is 110.00

  @increment
  Scenario: Increment the quantity of an existing item in the cart
    Given the cashier has added "Pizza" to the cart
    When the cashier increments the quantity of "Pizza"
    Then the cart displays exactly 1 line item
    And the cart displays "Pizza" with quantity 2 and total 240.00
    And the cart total is 240.00

  @decrement
  Scenario: Decrement the quantity of an existing item in the cart
    Given the cashier has added "Pasta" to the cart with quantity 2
    When the cashier decrements the quantity of "Pasta"
    Then the cart displays exactly 1 line item
    And the cart displays "Pasta" with quantity 1 and total 95.00
    And the cart total is 95.00

  @remove-item
  Scenario: Remove an item completely by decrementing when quantity is 1
    Given the cashier has added "Fries" to the cart
    When the cashier decrements the quantity of "Fries"
    Then the cart is empty
    And no items are displayed in the cart
    And the cart total is 0

  @remove-item
  Scenario: Remove an item completely from a cart with multiple items
    Given the cashier has added "Burger" and "Soda" and "Fries" to the cart
    When the cashier removes "Soda" from the cart
    Then the cart displays exactly 2 line items
    And the cart displays "Burger" with quantity 1 and total 85.00
    And the cart displays "Fries" with quantity 1 and total 45.00
    And the cart total is 130.00

  @cart-total
  Scenario: Cart total updates correctly after a sequence of mutations
    Given the cashier has added "Burger" to the cart
    When the cashier increments the quantity of "Burger"
    And the cashier adds "Soda" to the cart
    And the cashier adds "Fries" to the cart
    Then the cart displays exactly 3 line items
    And the cart displays "Burger" with quantity 2 and total 170.00
    And the cart displays "Soda" with quantity 1 and total 25.00
    And the cart displays "Fries" with quantity 1 and total 45.00
    And the cart total is 240.00

  @back-to-tables @auto-save
  Scenario: Navigating back to tables with items in the cart auto-saves a draft invoice
    Given the cashier has added "Pizza" to the cart
    And the cashier has added "Soda" to the cart
    When the cashier navigates back to the table selection page
    Then a draft invoice is created for Table 2
    And the draft invoice contains:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
      | Soda      | 1        | 25.00  |
    And Table 2 is marked as "Occupied"

  @back-to-tables @no-draft
  Scenario: Navigating back to tables with an empty cart does NOT create a draft invoice
    Given the cart is empty
    When the cashier navigates back to the table selection page
    Then no draft invoice exists for Table 2
    And Table 2 is marked as "Free"

  @back-to-tables @draft-update
  Scenario: Modifying a restored cart and navigating back updates the existing draft invoice
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
    And the cashier has selected Table 2
    And the cart is restored with 1x Burger
    When the cashier adds "Fries" to the cart
    And the cashier navigates back to the table selection page
    Then exactly 1 draft invoice exists for Table 2
    And the draft invoice contains:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Fries     | 1        | 45.00  |
    And the draft invoice total is 130.00
    And Table 2 is marked as "Occupied"

  @back-to-tables @draft-delete
  Scenario: Restoring a draft then clearing all items and navigating back deletes the draft
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Pasta     | 2        | 95.00  |
    And the cashier has selected Table 2
    And the cart is restored with 2x Pasta
    When the cashier removes all items from the cart
    And the cashier navigates back to the table selection page
    Then no draft invoice exists for Table 2
    And Table 2 is marked as "Free"

  @back-to-tables @update-in-place
  Scenario: Three rounds of back-and-forth update the same draft, never create duplicates
    Given Table 2 has no existing draft
    When the cashier adds "Burger" to the cart
    And the cashier navigates back to the table selection page
    Then exactly 1 draft invoice exists for Table 2
    And Table 2 is marked as "Occupied"
    When the cashier selects Table 2
    And the cashier adds "Fries" to the cart
    And the cashier navigates back to the table selection page
    Then exactly 1 draft invoice exists for Table 2
    And the draft invoice contains:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Fries     | 1        | 45.00  |
    When the cashier selects Table 2
    And the cashier adds "Soda" to the cart
    And the cashier navigates back to the table selection page
    Then exactly 1 draft invoice exists for Table 2
    And the draft invoice contains:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Fries     | 1        | 45.00  |
      | Soda      | 1        | 25.00  |
