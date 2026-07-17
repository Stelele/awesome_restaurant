Feature: Checkout and Payment
  As a restaurant cashier
  I want to convert a table's cart into a submitted invoice with payment
  So that the table's order is finalized and the table is freed

  Background:
    Given a POS profile "Restaurant" is configured
    And the cashier has opened a POS entry
    And the cashier has selected Table 2 from the table grid

  @happy-path @full-payment
  Scenario: Checkout from a fresh cart creates a POS invoice and submits payment in full
    Given the cashier has added "Burger" to the cart
    And the cashier has added "Soda" to the cart
    And the cart total is 110.00
    When the cashier proceeds to checkout
    And the payment screen is displayed
    And the cashier selects "Cash" as the payment mode
    And the cashier enters 110.00 as the tendered amount
    And the cashier submits the payment
    Then a submitted POS invoice exists for Table 2 with docstatus 1
    And the invoice total is 110.00
    And a payment entry exists for the invoice with mode "Cash" and amount 110.00
    And the invoice is fully paid
    And Table 2 is marked as "Free"

  @draft-conversion
  Scenario: Checkout from a restored draft converts the draft to a submitted invoice
    Given Table 2 has a draft invoice containing:
      | item_name | quantity | rate   |
      | Pizza     | 1        | 120.00 |
      | Soda      | 2        | 25.00  |
    And the cashier selects Table 2
    And the cart is restored with the draft items
    When the cashier proceeds to checkout
    And the cashier submits payment of 170.00 in full
    Then a submitted POS invoice exists for Table 2 with docstatus 1
    And the invoice total is 170.00
    And no draft invoice exists for Table 2 with docstatus 0
    And Table 2 is marked as "Free"

  @multi-mode-payment
  Scenario: Payment with multiple modes splits the total across payment entries
    Given the cart total is 150.00
    When the cashier proceeds to checkout
    And the cashier selects "Cash" as a payment mode with amount 100.00
    And the cashier selects "Card" as a payment mode with amount 50.00
    And the cashier submits the payment
    Then a payment entry exists for the invoice with mode "Cash" and amount 100.00
    And a payment entry exists for the invoice with mode "Card" and amount 50.00
    And the invoice is fully paid
    And the outstanding amount is 0
    And Table 2 is marked as "Free"

  @change-due
  Scenario: Payment with change due calculates and displays the correct change
    Given the cart total is 85.00
    When the cashier proceeds to checkout
    And the cashier selects "Cash" as the payment mode
    And the cashier enters 100.00 as the tendered amount
    Then the change due is displayed as 15.00
    When the cashier submits the payment
    Then the payment is successful
    And Table 2 is marked as "Free"

  @empty-cart-guard
  Scenario: Checkout is prevented when the cart is empty
    Given the cart is empty
    When the cashier attempts to proceed to checkout
    Then checkout is not possible
    And an error message or disabled checkout button is shown
    And the cashier remains on the item selection page

  @table-reference
  Scenario: Submitted invoice includes a reference to the table it was created for
    Given the cashier has added "Pasta" to the cart
    When the cashier proceeds to checkout
    And the cashier submits payment in full
    Then the submitted invoice has a field or custom field referencing "Table 2"

  @no-double-invoice
  Scenario: Checkout from a draft does not leave behind a duplicate draft after submission
    Given Table 2 has a draft invoice with 1x "Fries" at 45.00
    And the cashier selects Table 2
    And the cart is restored
    When the cashier proceeds to checkout
    And the cashier submits payment of 45.00
    Then the invoice count for Table 2 with docstatus 0 is 0
    And the invoice count for Table 2 with docstatus 1 is 1
    And Table 2 is marked as "Free"
