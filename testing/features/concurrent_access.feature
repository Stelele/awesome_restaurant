Feature: Concurrent Access and Table Locking
  As a restaurant cashier
  I want table locks to prevent accidental overwrites
  So that only the cashier who created a table's order can modify it

  Background:
    Given a POS profile "Restaurant" is configured
    And cashier A has opened a POS entry
    And cashier B has opened a POS entry
    And the following tables exist: Table 1 through Table 6
    And cashier A has occupied Table 2 with:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
      | Soda      | 1        | 25.00  |
    And Table 2 is marked as "Occupied" under cashier A's session
    And cashier B navigates to the table selection page

  @read-only
  Scenario: Non-creator can view an occupied table in read-only mode
    When cashier B selects Table 2 from the table grid
    Then the item selection page is displayed
    And cashier B can see the cart contents:
      | item_name | quantity | rate   |
      | Burger    | 2        | 85.00  |
      | Soda      | 1        | 25.00  |
    And the cart total is 195.00
    And the page is in read-only mode
    And the add-item controls are disabled
    And the increment and decrement controls are disabled
    And the checkout button is disabled

  @block-add
  Scenario: Non-creator is blocked from adding items and shown an error message
    When cashier B selects Table 2 from the table grid
    And cashier B attempts to add "Pizza" to the cart
    Then an error message is displayed
    And the error message indicates the table is being served by another cashier
    And the cart is unchanged
    And the cart still contains only "Burger" and "Soda"

  @block-remove
  Scenario: Non-creator is blocked from removing items and shown an error message
    When cashier B selects Table 2 from the table grid
    And cashier B attempts to remove "Burger" from the cart
    Then an error message is displayed
    And the error message indicates the table is being served by another cashier
    And the cart is unchanged
    And the cart still contains "Burger" with quantity 2

  @block-increment
  Scenario: Non-creator is blocked from incrementing item quantities
    When cashier B selects Table 2 from the table grid
    And cashier B attempts to increment the quantity of "Burger"
    Then an error message is displayed
    And the cart is unchanged
    And "Burger" quantity remains 2

  @block-checkout
  Scenario: Non-creator is blocked from checking out another cashier's table
    When cashier B selects Table 2 from the table grid
    And cashier B attempts to proceed to checkout
    Then an error message is displayed
    And the error message indicates the table is being served by another cashier
    And checkout is prevented

  @creator-can-edit
  Scenario: Creator cashier can still edit their table while a non-creator is viewing it
    Given cashier B is viewing Table 2 in read-only mode
    When cashier A selects Table 2
    And cashier A adds "Fries" to the cart
    Then cashier A's edit is successful
    And the cart for Table 2 now contains "Fries" with quantity 1
    And the cart total is 240.00

  @grid-consistency
  Scenario: Both cashiers see the same occupied/free states on the table grid
    Given cashier A has occupied Table 2 and Table 5
    And no other tables are occupied
    When cashier B navigates to the table selection page
    Then cashier B sees Table 2 as "Occupied"
    And cashier B sees Table 5 as "Occupied"
    And cashier B sees Tables 1, 3, 4, 6 as "Free"
    When cashier A navigates to the table selection page
    Then cashier A sees Table 2 as "Occupied"
    And cashier A sees Table 5 as "Occupied"
    And cashier A sees Tables 1, 3, 4, 6 as "Free"

  @ownership-stable
  Scenario: Creator ownership is stable across back-and-forth navigation
    Given cashier A created the draft for Table 2
    When cashier A navigates back to the table selection page
    And cashier B selects Table 2
    And cashier B sees the cart in read-only mode
    And cashier B navigates back to the table selection page
    And cashier A selects Table 2
    Then cashier A has full edit access
    And cashier A can add items to the cart
    And cashier A can remove items from the cart
    And cashier A can proceed to checkout

  @free-table-no-lock
  Scenario: A free table has no lock and either cashier can start a new order
    Given Table 3 has no draft invoice
    And Table 3 is marked as "Free"
    When cashier A selects Table 3
    And cashier A adds "Pizza" to the cart
    Then cashier A's edit is successful
    When cashier A navigates back to the table selection page
    And cashier B selects Table 3
    Then cashier B sees the cart in read-only mode
    And cashier B cannot edit because cashier A is now the creator
