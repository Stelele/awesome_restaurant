Feature: Table Selection
  As a restaurant cashier
  I want to see all available tables and their occupancy status
  So that I can select a table to start or resume an order

  Background:
    Given a POS profile "Restaurant" is configured
    And the following tables exist:
      | table_name | table_number |
      | Table 1    | 1            |
      | Table 2    | 2            |
      | Table 3    | 3            |
      | Table 4    | 4            |
      | Table 5    | 5            |
      | Table 6    | 6            |
    And the cashier has opened a POS entry for profile "Restaurant"

  @happy-path @grid-display
  Scenario: All tables shown as free on a fresh POS session with no prior drafts
    Given no draft invoices exist for the current POS opening entry
    When the cashier navigates to the table selection page
    Then the table grid displays all 6 tables
    And Table 1 is marked as "Free"
    And Table 2 is marked as "Free"
    And Table 3 is marked as "Free"
    And Table 4 is marked as "Free"
    And Table 5 is marked as "Free"
    And Table 6 is marked as "Free"
    And no tables are marked as "Occupied"

  @state-display
  Scenario: Table marked as occupied when a draft invoice exists from earlier in the same session
    Given the cashier previously added items to Table 2 and navigated back
    And a draft invoice exists for Table 2 under the current POS opening entry
    When the cashier navigates to the table selection page
    Then Table 2 is marked as "Occupied"
    And Table 1 is marked as "Free"
    And Table 3 is marked as "Free"
    And Table 4 is marked as "Free"
    And Table 5 is marked as "Free"
    And Table 6 is marked as "Free"

  @happy-path @navigate-to-items
  Scenario: Selecting a free table navigates to the item selection page with an empty cart
    Given Table 3 has no draft invoice
    And Table 3 is marked as "Free"
    When the cashier selects Table 3
    Then the page navigates to the item selection page
    And the selected table label displays "Table 3"
    And the cart is empty
    And no items are displayed in the cart
    And the cart total is 0

  @draft-restore @navigate-to-items
  Scenario: Selecting an occupied table restores the draft invoice items into the cart
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
      | Soda      | 1        | 25.00  |
    And Table 2 is marked as "Occupied"
    When the cashier selects Table 2
    Then the page navigates to the item selection page
    And the selected table label displays "Table 2"
    And the cart contains exactly 2 line items
    And the cart displays "Burger" with quantity 2 and total 170.00
    And the cart displays "Soda" with quantity 1 and total 25.00
    And the cart total is 195.00

  @state-transition @draft-delete
  Scenario: Occupied table returns to free after its draft invoice is deleted by emptying cart
    Given Table 5 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And Table 5 is marked as "Occupied"
    When the cashier selects Table 5
    And the cashier removes all items from the cart
    And the cashier navigates back to the table selection page
    Then Table 5 is marked as "Free"
    And no draft invoice exists for Table 5

  @state-transition @payment
  Scenario: Occupied table returns to free after successful payment completes
    Given Table 4 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Pasta     | 2        | 95.00  |
    And Table 4 is marked as "Occupied"
    When the cashier selects Table 4
    And the cashier proceeds to checkout
    And the cashier submits payment of 190.00 in full
    Then the payment is successful
    And Table 4 is marked as "Free"
    And no draft invoice exists for Table 4

  @grid-display @multiple-occupied
  Scenario: Grid correctly reflects multiple occupied and free tables simultaneously
    Given a draft invoice exists for Table 1
    And a draft invoice exists for Table 4
    And a draft invoice exists for Table 6
    And no draft invoices exist for Tables 2, 3, or 5
    When the cashier navigates to the table selection page
    Then Table 1 is marked as "Occupied"
    And Table 2 is marked as "Free"
    And Table 3 is marked as "Free"
    And Table 4 is marked as "Occupied"
    And Table 5 is marked as "Free"
    And Table 6 is marked as "Occupied"
    And 3 tables are marked as "Occupied"
    And 3 tables are marked as "Free"

  @session-scope
  Scenario: All tables show as free when cashier opens a new POS session with no prior drafts
    Given the current POS opening entry is closed
    And the cashier opens a new POS opening entry
    When the cashier navigates to the table selection page
    Then all 6 tables are marked as "Free"
    And no tables are marked as "Occupied"
