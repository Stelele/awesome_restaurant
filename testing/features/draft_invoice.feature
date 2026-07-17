Feature: Draft Invoice Lifecycle
  As a restaurant cashier
  I want draft invoices to persist, update, and clean up correctly
  So that table orders are never lost and the system stays consistent

  Background:
    Given a POS profile "Restaurant" is configured
    And the cashier has opened a POS entry
    And the following tables exist: Table 1 through Table 6

  @persistence @immediate-save
  Scenario: Draft is created immediately when the first item is added to the cart
    Given the cashier has selected Table 2
    And the cart is empty
    When the cashier adds "Burger" to the cart
    Then a draft invoice exists for Table 2 under the current POS opening entry
    And the draft invoice contains "Burger" with quantity 1
    And Table 2 is marked as "Occupied"

  @persistence @browser-crash
  Scenario: Draft survives browser tab close and reopen without having navigated back
    Given the cashier has selected Table 2
    And the cashier has added "Burger" to the cart
    And the cashier has added "Soda" to the cart
    And a draft invoice exists for Table 2 (auto-saved on item add)
    When the browser tab is closed without navigating back
    And the browser tab is reopened
    And the cashier reopens the same POS opening entry
    And the cashier navigates to the table selection page
    Then Table 2 is marked as "Occupied"
    When the cashier selects Table 2
    Then the cart contains:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Soda      | 1        | 25.00  |
    And the cart total is 110.00

  @persistence @session-close
  Scenario: Closing POS session frees all tables under that cashier and cleans up drafts
    Given the cashier has occupied Table 2 with items:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And the cashier has occupied Table 5 with items:
      | item_name | quantity | rate   |
      | Pasta     | 2        | 95.00  |
    And Table 2 is marked as "Occupied"
    And Table 5 is marked as "Occupied"
    When the cashier closes the POS opening entry
    Then all draft invoices under that POS opening entry are deleted
    When the cashier opens a new POS opening entry
    And the cashier navigates to the table selection page
    Then Table 2 is marked as "Free"
    And Table 5 is marked as "Free"
    And no draft invoices exist for Table 2
    And no draft invoices exist for Table 5

  @persistence @session-scope
  Scenario: Closing cashier A's session frees only A's tables, not cashier B's tables
    Given cashier A has an active POS opening entry
    And cashier B has an active POS opening entry
    And cashier A has occupied Table 2 with items:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
    And cashier B has occupied Table 4 with items:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And Table 2 is marked as "Occupied" under cashier A's session
    And Table 4 is marked as "Occupied" under cashier B's session
    When cashier A closes their POS opening entry
    Then Table 2 is marked as "Free"
    And no draft invoice exists for Table 2 under cashier A
    But Table 4 is still marked as "Occupied" under cashier B's session
    And the draft invoice for Table 4 still exists

  @persistence @no-cross-contamination
  Scenario: Drafts are scoped to the POS opening entry that created them
    Given the cashier's current POS opening entry has OP-001 as its identifier
    When the cashier adds "Pizza" to Table 3's cart
    And the cashier navigates back to the table selection page
    Then a draft invoice exists for Table 3
    And the draft invoice's pos_opening_entry is OP-001
    And the draft invoice's pos_profile is "Restaurant"

  @draft-delete @empty-cart
  Scenario: Draft invoice is fully deleted from the database when cart is emptied
    Given Table 6 has a draft invoice with 1x "Fries"
    And the cashier selects Table 6
    And the cart is restored with 1x "Fries"
    When the cashier removes "Fries" from the cart
    And the cashier navigates back to the table selection page
    Then no POS Invoice record exists in the database for Table 6 with docstatus 0
    And Table 6 is marked as "Free"

  @draft-to-submitted @checkout
  Scenario: Draft is upgraded to a submitted invoice on checkout, not duplicated
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
    And the cashier selects Table 2
    And the cart is restored
    When the cashier proceeds to checkout
    And the cashier submits payment of 170.00
    Then a submitted invoice exists for Table 2 with docstatus 1
    And the submitted invoice contains:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
    And no draft invoice exists for Table 2 with docstatus 0
    And Table 2 is marked as "Free"

  @draft-integrity
  Scenario: Draft invoice total matches the sum of its line items
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Soda      | 2        | 25.00  |
      | Fries     | 1        | 45.00  |
    When the cashier selects Table 2
    Then the cart total is 180.00
    And the draft invoice total in the database is 180.00

  @edge-case
  Scenario: Draft invoice with zero items is treated as non-existent
    Given Table 3 has no draft invoice
    When the cashier selects Table 3
    And the cart is empty
    And the cashier navigates back to the table selection page
    Then Table 3 is marked as "Free"
    And no draft invoice is created for Table 3
