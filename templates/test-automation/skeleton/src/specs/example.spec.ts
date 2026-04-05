import { test, expect } from "../fixtures/base.js";

/**
 * Example test suite for __PROJECT_NAME__.
 *
 * Framework: __FRAMEWORK__
 * Language: __LANGUAGE__
 *
 * Demonstrates the use of custom fixtures (loginPage, testUser),
 * page objects, and data factories. Replace these examples with
 * actual test cases for your application.
 */

test.describe("Login", () => {
  test("should display login form with all fields", async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.submitButton).toBeEnabled();
  });

  test("should login successfully with valid credentials", async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);
    await loginPage.expectDashboard();
  });

  test("should show error for invalid credentials", async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, "wrong-password");
    await loginPage.expectError("Invalid email or password");
  });

  test("should show validation error for empty email", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login("", "any-password");
    await loginPage.expectEmailValidation();
  });

  test("should support remember me option", async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.loginWithRememberMe(testUser.email, testUser.password);
    await loginPage.expectDashboard();
  });

  test("should navigate to forgot password page", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.forgotPasswordLink.click();
    await expect(loginPage.page).toHaveURL(/.*forgot-password/);
  });
});

test.describe("Authenticated Navigation", () => {
  test("should access dashboard when authenticated", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    await expect(authenticatedPage).toHaveURL(/.*dashboard/);
    await expect(authenticatedPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("should display user profile in navigation", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/dashboard");
    await expect(authenticatedPage.getByTestId("user-profile")).toBeVisible();
  });
});
