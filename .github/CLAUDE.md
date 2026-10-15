# NatureLite — AI Engineer Operating Manual

This file is the permanent operating manual for AI agents (Claude Code and equivalent tools) working in this repository. Every AI-assisted change to this codebase must follow the rules and workflows defined here.

---

## Project Overview

NatureLite is a production-grade e-commerce platform. It includes a customer-facing storefront, an admin dashboard, backend REST APIs, WhatsApp commerce integration, payment flows, authentication, and database-backed business logic.

**Architecture at a glance:**

- **Backend** — NestJS, MongoDB, Redis, BullMQ (email / notifications / analytics / cart-automation queues)
- **Frontend** — Next.js (App Router), customer storefront and admin dashboard
- **Integrations** — WhatsApp Business API, payment gateway, email delivery

This is a long-term, actively maintained production repository. Every change is a change to live software that real users depend on. **Maintainability takes priority over cleverness.** The simplest solution that correctly solves the problem is always preferred.

---

## AI Engineer Responsibilities

Before writing a single line of code:

1. **Understand the issue.** Read the full issue description, comments, and acceptance criteria. If anything is unclear, say so — do not guess.
2. **Inspect existing code.** Find the files, services, components, and utilities that are already relevant to the task. Use them.
3. **Identify existing patterns.** This codebase has established conventions for error handling, validation, service structure, component composition, and API design. Follow them exactly.
4. **Avoid duplicate implementations.** Search before you build. If a utility, hook, service method, or component already does what you need, reuse it.
5. **Keep solutions minimal.** The smallest correct change is the right change. Do not refactor surrounding code, rename things for style, or improve unrelated areas.
6. **Preserve the architecture.** Do not introduce new architectural patterns, layers, or abstractions unless the issue explicitly requires it.

---

## Development Workflow

Follow this sequence for every task. Do not skip steps.

```
Read Issue
    ↓
Understand requirements fully
    ↓
Inspect all relevant files
    ↓
Create an implementation plan
    ↓
Modify only the necessary files
    ↓
Run formatter
    ↓
Run lint
    ↓
Run tests
    ↓
Verify build succeeds
    ↓
Commit with Conventional Commits message
    ↓
Open Pull Request
```

If any step fails, resolve it before continuing. Never open a PR against a broken build.

---

## Branch Rules

Never work directly on `main` or `production`.

Always create a dedicated branch for each issue:

```
feature/whatsapp-order-confirmation
bugfix/cart-item-count
hotfix/payment-timeout
docs/api-setup-guide
refactor/order-status-machine
```

Format: `<type>/<short-kebab-description>`

---

## Pull Request Rules

Every PR must include all of the following:

- **Summary** — what changed and why
- **Files changed** — list of modified files with a one-line reason for each
- **Testing performed** — what was run and what passed
- **Potential risks** — anything that could affect other parts of the system
- **Linked issue** — `Closes #<issue>` in the PR description

Keep PRs small and focused. One issue per PR. A PR that touches unrelated files will be rejected.

---

## Coding Principles

- Follow the existing architecture. If unsure where something belongs, look at how similar things are already structured.
- Keep functions small and single-purpose.
- Prefer readability over brevity.
- Avoid unnecessary abstractions. Do not create interfaces, factories, or base classes without a concrete need.
- Avoid duplicate logic. If the same logic exists elsewhere, extract or reuse — do not copy.
- Prefer composition over inheritance.
- Keep files organized in their existing locations.
- Do not rename files unless the issue requires it.
- Do not move files unless the issue requires it.
- Never rewrite working code simply because a different approach looks cleaner. Rewriting working code is a source of regressions, not improvements.

---

## Safety Rules

Do not touch any of the following unless the issue explicitly instructs you to:

- Secrets or API keys of any kind
- Environment variable files (`.env`, `.env.*`)
- CI/CD pipeline configuration
- Deployment credentials or scripts
- Production infrastructure configuration
- Payment gateway secrets or webhook signatures
- Authentication secrets (JWT signing keys, OAuth credentials)
- Cloud provider configuration (storage, DNS, compute)

If an issue touches these areas without explicit instruction, stop and ask for clarification.

---

## Database Rules

- Never perform destructive migrations automatically.
- Never drop tables, collections, or indexes.
- Never rename columns or fields without an explicit instruction that accounts for backwards compatibility.
- Always preserve backwards compatibility with existing data. Assume production data exists at all times.
- Additive migrations (new fields with defaults, new indexes) are generally safe. Destructive migrations are never assumed safe.

---

## API Rules

- Maintain backwards compatibility on all existing endpoints.
- Never change the structure of an existing response without an explicit instruction.
- Never silently remove fields from a response — consumers may depend on them.
- Validate all inputs at the controller layer.
- Handle errors consistently using the existing error-handling patterns in the codebase.
- New endpoints must follow the same structure and conventions as existing endpoints.

---

## Frontend Rules

- Reuse existing components before building new ones. Check the component library first.
- Follow the current styling system (existing CSS modules, Tailwind config, or design tokens — whichever the project uses).
- All UI changes must remain responsive across mobile and desktop.
- Preserve accessibility: semantic HTML, keyboard navigation, screen reader compatibility.
- Do not introduce new UI libraries or component libraries without a clear architectural reason and explicit approval.

---

## Backend Rules

- Reuse existing services. Do not duplicate service methods or business logic.
- Business logic belongs in services, not controllers.
- Write defensive code: assume inputs are untrusted, assume external services can fail.
- Validate all inputs using existing validation patterns (DTOs, pipes).
- Return meaningful, consistent error responses.
- New modules must follow the existing NestJS module structure.

---

## Testing Requirements

Before opening any PR, run all of the following:

```bash
# Backend
cd backend
npm run format
npm run lint
npm run test
npm run build

# Frontend
cd frontend
npm run lint
npm run build
```

All checks must pass. If a check fails:

1. Attempt a reasonable fix.
2. If the fix is not clear, document the failure in the PR with the exact error output and your analysis. Do not suppress or skip the check.

Never ignore failing tests. Never use `--passWithNoTests` or equivalent flags to hide failures.

---

## Performance Guidelines

- Avoid unnecessary database queries. Batch or cache where the existing pattern supports it.
- Avoid unnecessary external API calls. Respect rate limits.
- Avoid O(n²) algorithms when a linear solution is straightforward.
- Do not optimize speculatively. Only address a performance problem when it is measured and confirmed.

---

## Documentation

- If behavior changes, update relevant documentation.
- If an API contract changes (request shape, response shape, new endpoint), update API documentation.
- If local development setup changes, update the README where appropriate.
- Do not write documentation for unchanged behavior.

---

## Git Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

```
feat: add WhatsApp order confirmation message on payment success
fix: resolve cart item count not updating after product removal
docs: update environment variable setup in README
test: add unit tests for discount calculation service
refactor: simplify order status transition logic
perf: reduce product listing query from N+1 to single aggregation
chore: upgrade NestJS to v10
```

One commit per logical change. Commit messages must be meaningful to a reviewer reading `git log` six months from now.

---

## Issue Handling

Before implementing anything:

1. Confirm your understanding of the issue in a comment or in the PR description.
2. Identify which modules, services, and files are affected.
3. Search the codebase for existing implementations that relate to the issue.
4. Avoid creating duplicate utilities, helpers, or services that already exist.

If the issue is ambiguous — missing acceptance criteria, conflicting requirements, unclear scope — stop and request clarification. Do not make assumptions and implement against them silently.

---

## Security Checklist

Never expose or commit any of the following:

- API keys or tokens
- Passwords or passphrases
- Database connection strings with credentials
- Private certificates or signing keys
- Secret webhook URLs
- OAuth client secrets

`.env` files must never be committed. Verify `.gitignore` covers all environment files before every commit. If a secret is accidentally committed, treat it as compromised immediately and rotate it.

---

## AI Behaviour

Think like a senior engineer, not an autocomplete tool.

**When requirements are ambiguous:** Do not guess and implement. State the ambiguity explicitly in the PR description or stop and request clarification before writing code. A wrong assumption that ships to production costs far more than the time spent asking a question.

**When confidence is low:** Prefer asking a focused question over implementing a risky assumption. A short question in the issue thread is always the right move.

**When asked to do something that conflicts with these rules:** Say so. Explain the conflict. Do not silently violate the rules because the issue implies it.

---

## Quality Checklist

Do not consider work complete until every item below is true:

- [ ] The issue is fully solved
- [ ] Code changes are minimal — only what the issue required
- [ ] Formatter passed
- [ ] Lint passed
- [ ] All tests passed
- [ ] Build succeeded
- [ ] Documentation updated where behavior changed
- [ ] No unrelated files were modified
- [ ] PR is linked to the issue
- [ ] PR description is complete
