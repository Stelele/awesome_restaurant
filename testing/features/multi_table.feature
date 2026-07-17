Feature: Multi-Table Juggling
  As a restaurant cashier
  I want to manage multiple tables independently
  So that I can serve several tables simultaneously without mixing up their orders

  Background:
    Given a POS profile "Restaurant" is configured
    And the cashier has opened a POS entry
    And the following tables exist: Table 1 through Table 6

  @two-tables @independent-carts
  Scenario: Two tables maintain independent carts with no cross-contamination
    When the cashier selects Table 1
    And the cashier adds "Burger" and "Soda" to the cart
    And the cashier navigates back to the table selection page
    When the cashier selects Table 3
    And the cashier adds "Pizza" to the cart
    And the cashier navigates back to the table selection page
    Then Table 1 is marked as "Occupied"
    And Table 3 is marked as "Occupied"
    When the cashier selects Table 1
    Then the cart contains:
      | item_name | quantity | rate   |
      | Burger    | 1        | 85.00  |
      | Soda      | 1        | 25.00  |
    And the cart total is 110.00
    When the cashier navigates back to the table selection page
    And the cashier selects Table 3
    Then the cart contains:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And the cart total is 120.00

  @three-tables @varying-contents
  Scenario: Three tables each with different cart sizes and contents maintain integrity
    Given the cashier has occupied Table 1 with items:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
      | Soda      | 1        | 25.00  |
    And the cashier has occupied Table 3 with items:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And the cashier has occupied Table 6 with items:
      | item_name | quantity | rate   |
      | Pasta     | 2        | 95.00  |
      | Fries     | 2        | 45.00  |
      | Soda      | 3        | 25.00  |
    When the cashier navigates to the table selection page
    Then Table 1 is marked as "Occupied"
    And Table 3 is marked as "Occupied"
    And Table 6 is marked as "Occupied"
    And Table 2, 4, 5 are marked as "Free"
    When the cashier selects Table 1
    Then the cart contains exactly 2 items
    And the cart total is 195.00
    When the cashier navigates back and selects Table 6
    Then the cart contains exactly 3 items
    And the cart total is 355.00
    When the cashier navigates back and selects Table 3
    Then the cart contains exactly 1 item
    And the cart total is 120.00

  @grid-state
  Scenario: Table selection grid correctly shows occupied/free state for all tables
    Given the cashier has occupied Table 2 with 1x "Burger"
    And the cashier has occupied Table 4 with 1x "Pasta"
    And the cashier has occupied Table 5 with 1x "Fries"
    When the cashier navigates to the table selection page
    Then 3 tables are marked as "Occupied"
    And 3 tables are marked as "Free"
    And Table 2 is marked as "Occupied"
    And Table 4 is marked as "Occupied"
    And Table 5 is marked as "Occupied"
    And Table 1 is marked as "Free"
    And Table 3 is marked as "Free"
    And Table 6 is marked as "Free"

  @pay-one-free-one
  Scenario: Paying one occupied table frees it but leaves another occupied table intact
    Given the cashier has occupied Table 1 with 1x "Burger"
    And the cashier has occupied Table 4 with 1x "Pizza"
    And Table 1 and Table 4 are both marked as "Occupied"
    When the cashier selects Table 1
    And the cashier proceeds to checkout
    And the cashier submits payment of 85.00 in full
    Then Table 1 is marked as "Free"
    And Table 4 is still marked as "Occupied"
    When the cashier selects Table 4
    Then the cart contains:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    And the cart total is 120.00

  @rapid-switching
  Scenario: Rapid switching between tables does not lose or mix up cart data
    When the cashier selects Table 1
    And the cashier adds "Burger" to the cart
    And the cashier navigates back to the table selection page
    And the cashier selects Table 3
    And the cashier adds "Pizza" to the cart
    And the cashier navigates back to the table selection page
    And the cashier selects Table 1
    Then the cart contains "Burger" with quantity 1
    And the cart does NOT contain "Pizza"
    When the cashier navigates back to the table selection page
    And the cashier selects Table 3
    Then the cart contains "Pizza" with quantity 1
    And the cart does NOT contain "Burger"

  @isolated-edits
  Scenario: Adding items to one table does not affect another table's draft
    Given the cashier has occupied Table 1 with:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
    When the cashier selects Table 3
    And the cashier adds "Burger" to the cart
    And the cashier navigates back to the table selection page
    And the cashier selects Table 1
    Then the cart contains exactly 1 item
    And the cart contains "Pizza" with quantity 1
    And the cart does NOT contain "Burger"

  @session-close
  Scenario: All tables freed when cashier closes their POS session
    Given the cashier has occupied Table 1 with 1x "Burger"
    And the cashier has occupied Table 3 with 1x "Pizza"
    And the cashier has occupied Table 6 with 1x "Pasta"
    When the cashier closes the POS opening entry
    And the cashier opens a new POS opening entry
    Then Table 1 is marked as "Free"
    And Table 3 is marked as "Free"
    And Table 6 is marked as "Free"
    And no draft invoices exist for Tables 1, 3, or 6
