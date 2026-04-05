import { faker } from "@faker-js/faker";

/**
 * Data types for the user factory.
 */
export interface UserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  fullName: string;
}

export interface UserOverrides {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Factory for generating test user data for __PROJECT_NAME__.
 *
 * Uses faker for realistic data generation with sensible defaults.
 * Override any field by passing partial data to create().
 *
 * @example
 * ```ts
 * // Generate a random user
 * const user = UserFactory.create();
 *
 * // Override specific fields
 * const admin = UserFactory.create({ email: "admin@example.com" });
 *
 * // Generate multiple users
 * const users = UserFactory.createMany(5);
 * ```
 */
export class UserFactory {
  /** Default password meeting typical complexity requirements */
  static readonly DEFAULT_PASSWORD = "TestPass123!";

  /**
   * Create a single user with optional overrides.
   */
  static create(overrides: UserOverrides = {}): UserData {
    const firstName = overrides.firstName ?? faker.person.firstName();
    const lastName = overrides.lastName ?? faker.person.lastName();

    return {
      email: overrides.email ?? faker.internet.email({ firstName, lastName }).toLowerCase(),
      password: overrides.password ?? UserFactory.DEFAULT_PASSWORD,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
    };
  }

  /**
   * Create multiple users with optional shared overrides.
   */
  static createMany(count: number, overrides: UserOverrides = {}): UserData[] {
    return Array.from({ length: count }, () => UserFactory.create(overrides));
  }

  /**
   * Create a user with a specific role-based email pattern.
   * Useful for testing role-based access control.
   */
  static withRole(role: string): UserData {
    return UserFactory.create({
      email: `${role}@__PROJECT_NAME__.test`,
    });
  }
}
