import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { LoginPage } from "../pages/login.page.js";
import { UserFactory, type UserData } from "../factories/user.factory.js";

/**
 * Custom test fixtures for __PROJECT_NAME__.
 *
 * Extends the base Playwright test with shared page objects, data
 * factories, and authentication state. Tests import { test, expect }
 * from this module instead of from @playwright/test directly.
 */

/** Fixture type declarations */
type TestFixtures = {
  /** Login page object, initialized and ready */
  loginPage: LoginPage;
  /** Pre-built test user data from the factory */
  testUser: UserData;
  /** Authenticated page with a valid session */
  authenticatedPage: Page;
};

export const test = base.extend<TestFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  testUser: async ({}, use) => {
    const user = UserFactory.create();
    await use(user);
  },

  authenticatedPage: async ({ browser }, use) => {
    // Create a new context with stored authentication state.
    // In a real project, this would load from a stored auth state file
    // or perform login via API to avoid UI login in every test.
    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    // Authenticate via API or UI setup
    const user = UserFactory.create();
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(user.email, user.password);
    await loginPage.expectDashboard();

    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
