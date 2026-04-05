import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Page object for the login page of __PROJECT_NAME__.
 *
 * Encapsulates all login page interactions and assertions.
 * Tests interact with this object instead of raw selectors,
 * so selector changes only require updates in one place.
 */
export class LoginPage {
  readonly page: Page;

  /** Form field locators */
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly rememberMeCheckbox: Locator;

  /** Feedback locators */
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly loadingSpinner: Locator;

  /** Navigation locators */
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Form fields — prefer accessible locators (role, label, placeholder)
    this.emailInput = page.getByLabel("Email");
    this.passwordInput = page.getByLabel("Password");
    this.submitButton = page.getByRole("button", { name: "Sign In" });
    this.rememberMeCheckbox = page.getByLabel("Remember me");

    // Feedback elements
    this.errorMessage = page.getByRole("alert");
    this.successMessage = page.getByTestId("success-message");
    this.loadingSpinner = page.getByTestId("loading-spinner");

    // Navigation
    this.forgotPasswordLink = page.getByRole("link", { name: "Forgot password" });
    this.signUpLink = page.getByRole("link", { name: "Sign up" });
  }

  /**
   * Navigate to the login page.
   */
  async goto(): Promise<void> {
    await this.page.goto("/login");
    await this.emailInput.waitFor({ state: "visible" });
  }

  /**
   * Fill credentials and submit the login form.
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /**
   * Fill credentials, check remember me, and submit.
   */
  async loginWithRememberMe(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.rememberMeCheckbox.check();
    await this.submitButton.click();
  }

  /**
   * Assert that login succeeded and the dashboard is visible.
   */
  async expectDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/.*dashboard/);
  }

  /**
   * Assert that an error message is displayed with the expected text.
   */
  async expectError(message: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }

  /**
   * Assert that the email field shows a validation error.
   */
  async expectEmailValidation(): Promise<void> {
    await expect(this.emailInput).toHaveAttribute("aria-invalid", "true");
  }

  /**
   * Assert that the form is in a loading state.
   */
  async expectLoading(): Promise<void> {
    await expect(this.submitButton).toBeDisabled();
    await expect(this.loadingSpinner).toBeVisible();
  }

  /**
   * Assert that the form is idle and ready for input.
   */
  async expectReady(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await expect(this.loadingSpinner).not.toBeVisible();
  }
}
