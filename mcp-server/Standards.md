
# Standards

## 1. Code Quality & Design Principles
- **Follow DRY (Don’t Repeat Yourself):** Reduce duplication by extracting reusable logic and avoiding copy-paste implementations.
- **Use strongly typed TypeScript models:** Prefer interfaces and typed models over `any` to ensure compile-time safety and clarity of intent.
- **Ensure source code builds successfully:** All committed code must compile locally before being pushed.

## 2. Naming Conventions
- **PascalCase** for:
  - Methods
  - Properties
  - Types (classes, interfaces, enums)
- **camelCase** for:
  - Private fields
  - Method parameters
  - Local variables

## 3. Testing Standards
- All TypeScript resource tests must use Jest.
- All business logic must have unit tests.
- New features must include tests.
- Bug fixes require a test proving the bug.
- All new or modified functionality must include supporting automated tests.
- Tests should be behaviour-focused and clearly describe expected outcomes.
- Prefer descriptive naming and an Arrange/Act/Assert structure.
- Tests must pass before creating a pull request.
- Test files must:
  - Be colocated with the source file they test.
  - Follow the naming convention: `filename.spec.ts`

## 4. Source Control & Workflow
- **Raise a GitHub issue for each unit of work:** Include sufficient detail and link pull requests back to the related issue.
- **Create a single pull request per issue:** Avoid bundling unrelated changes.
- **Work in a separate development branch:** Branch from `main` and never commit directly to `main`.

## 5. Security Standards
- **Never store sensitive data in the repository:**
  - No `client_id`
  - No client secrets
  - No connection strings
  - No API keys
- Use environment variables, secure configuration stores, or secret managers instead.
