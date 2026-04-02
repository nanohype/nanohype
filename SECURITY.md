# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in a nanohype template, please report it responsibly.

**Do not open a public issue.**

Instead, email security concerns to the repository maintainers via the contact information in the GitHub organization profile. Include:

- Which template is affected
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and provide an initial assessment within 5 business days.

## Scope

This policy covers the template catalog and its skeleton code. Templates are starting points — security of scaffolded projects is the responsibility of the project maintainer once scaffolded.

## Template Security Standards

All template skeleton code should:

- Use parameterized queries (never string interpolation for SQL)
- Validate and sanitize user input at system boundaries
- Store secrets in environment variables, never in code
- Use current, maintained dependencies
- Follow OWASP guidelines for the relevant language/framework
