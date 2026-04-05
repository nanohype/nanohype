# __PROJECT_NAME__ — Login Feature
# Format: __FORMAT__

Feature: User Login
  As a registered user
  I want to log in with my credentials
  So that I can access my account and protected features

  Background:
    Given the __PROJECT_NAME__ application is running
    And the login page is accessible at "/login"

  Scenario: Successful login with valid credentials
    Given a registered user with email "user@example.com"
    And the user has a verified account
    When the user enters email "user@example.com"
    And the user enters a valid password
    And the user clicks the "Sign In" button
    Then the user is redirected to the dashboard
    And the navigation bar displays the user's name
    And a valid session token is stored

  Scenario: Login rejected with incorrect password
    Given a registered user with email "user@example.com"
    When the user enters email "user@example.com"
    And the user enters an incorrect password
    And the user clicks the "Sign In" button
    Then an error message is displayed: "Invalid email or password"
    And no session token is created
    And the password field is cleared
    But the email field retains the entered value

  Scenario: Login rejected with unregistered email
    Given no user exists with email "unknown@example.com"
    When the user enters email "unknown@example.com"
    And the user enters any password
    And the user clicks the "Sign In" button
    Then an error message is displayed: "Invalid email or password"
    And the error message does not reveal whether the email exists

  Scenario: Account lockout after repeated failures
    Given a registered user with email "user@example.com"
    And the account lockout threshold is 5 failed attempts
    When the user enters incorrect passwords 5 times consecutively
    Then the account is temporarily locked
    And a message is displayed: "Account locked. Try again in 15 minutes."
    And a lockout notification email is sent to the user

  Scenario: Login with remember me option
    Given a registered user with email "user@example.com"
    When the user enters valid credentials
    And the user checks the "Remember me" checkbox
    And the user clicks the "Sign In" button
    Then the session token has an extended expiry of 30 days
    And on subsequent visits the user remains authenticated

  Scenario: Redirect to originally requested page after login
    Given a registered user with email "user@example.com"
    And the user attempts to access "/settings/profile" without authentication
    When the user is redirected to the login page
    And the user enters valid credentials
    And the user clicks the "Sign In" button
    Then the user is redirected to "/settings/profile"
    And not to the default dashboard

  Scenario: Login form validation
    When the user leaves the email field empty
    And the user clicks the "Sign In" button
    Then a validation message is displayed: "Email is required"
    When the user enters "not-an-email" in the email field
    And the user clicks the "Sign In" button
    Then a validation message is displayed: "Enter a valid email address"

  Scenario: Login page accessibility
    Given the login page is loaded
    Then all form fields have associated labels
    And the form is navigable using only the keyboard
    And the "Sign In" button is reachable via Tab key
    And error messages are announced to screen readers
    And color is not the sole indicator of field state
