# __PROJECT_NAME__ — Checkout Feature
# Format: __FORMAT__

Feature: Checkout Process
  As a customer with items in my cart
  I want to complete the checkout process
  So that I can purchase my selected items and receive an order confirmation

  Background:
    Given the __PROJECT_NAME__ application is running
    And the user is authenticated
    And the user has at least one item in the cart

  Scenario: Successful checkout with valid payment
    Given the cart contains 2 items totaling $49.98
    And the user navigates to the checkout page
    When the user enters a valid shipping address
    And the user selects "Standard Shipping" as the delivery method
    And the user enters valid payment card details
    And the user clicks "Place Order"
    Then an order is created with status "confirmed"
    And the order confirmation page displays the order number
    And a confirmation email is sent to the user's email address
    And the cart is emptied
    And the inventory is decremented for each purchased item

  Scenario: Checkout with insufficient inventory
    Given the cart contains an item with only 1 unit in stock
    And another user purchases the last unit before checkout completes
    When the user clicks "Place Order"
    Then the order is not created
    And a message is displayed: "Some items in your cart are no longer available"
    And the unavailable items are flagged in the cart
    And available items remain in the cart

  Scenario: Payment declined by processor
    Given the user has entered all checkout information
    When the user submits payment with a card that will be declined
    Then the order is not created
    And a message is displayed: "Payment could not be processed. Please try a different payment method."
    And no charge is applied to the card
    And the user remains on the payment step
    And all previously entered information is preserved

  Scenario: Apply valid discount code
    Given the cart subtotal is $100.00
    And a discount code "SAVE20" exists for 20% off
    When the user enters discount code "SAVE20"
    And the user clicks "Apply"
    Then the discount of $20.00 is applied to the order
    And the order total is updated to $80.00 plus shipping and tax
    And the discount code is displayed with a "Remove" option

  Scenario: Apply expired discount code
    Given the cart subtotal is $100.00
    And a discount code "EXPIRED10" has an expiry date in the past
    When the user enters discount code "EXPIRED10"
    And the user clicks "Apply"
    Then the discount is not applied
    And a message is displayed: "This discount code has expired"
    And the order total remains unchanged

  Scenario: Shipping address validation
    When the user enters an incomplete shipping address
    And the user attempts to proceed to payment
    Then validation errors are displayed for each missing required field
    And the user cannot proceed until all required fields are completed
    And required fields include: street address, city, state/province, postal code, country

  Scenario: Order total calculation
    Given the cart contains items totaling $75.00
    And the shipping cost for "Standard Shipping" is $5.99
    And the applicable tax rate is 8.25%
    When the user selects "Standard Shipping"
    Then the subtotal displays $75.00
    And the shipping displays $5.99
    And the tax displays $6.67
    And the order total displays $87.66

  Scenario: Guest checkout without account
    Given the user is not authenticated
    And the user has items in a guest cart
    When the user navigates to checkout
    Then the user is offered options to "Sign In" or "Continue as Guest"
    When the user selects "Continue as Guest"
    Then the user can enter shipping and payment information
    And the user must provide an email address for order confirmation
    And the order is created without an associated user account
