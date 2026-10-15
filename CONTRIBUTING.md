# Contributing to NatureLite

## Development Workflow

1. **Open an issue first.** Every change — bug fix or feature — starts with a GitHub issue. This aligns intent before code is written.
2. **Branch from `main`.** Create a dedicated branch for each issue. Never commit directly to `main` or `production`.
3. **Keep PRs focused.** One issue per PR. Mixed-concern PRs are harder to review and harder to revert.
4. **Link the PR to its issue.** Use `Closes #<issue>` in the PR description so GitHub closes the issue automatically on merge.

---

## Branch Naming

```
feature/login-page
bug/cart-refresh
hotfix/payment-timeout
docs/readme-update
refactor/order-service
```

Format: `<type>/<short-kebab-description>`

---

## Commit Message Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

```
feat: add WhatsApp order confirmation flow
fix: resolve cart item count not updating on removal
docs: update API setup instructions in README
refactor: simplify order status state machine
test: add unit tests for discount calculation
chore: upgrade NestJS to v10
```

- **feat** — new functionality
- **fix** — bug fix
- **docs** — documentation only
- **refactor** — code restructure, no behavior change
- **test** — adding or updating tests
- **chore** — tooling, dependencies, config

---

## Pull Requests

- Keep PRs small. Reviewers can't give useful feedback on 2000-line diffs.
- Write a descriptive title that starts with the type: `feat:`, `fix:`, etc.
- Every PR must reference an open issue.
- CI must pass before requesting review.
- Attach screenshots for any UI-facing change.
- If the change is complex, add a **Reviewer Notes** section explaining the reasoning.

---

## Coding Standards

- Follow the existing architecture. If you're unsure where something belongs, ask in the issue before building.
- Avoid unnecessary refactoring inside a bug fix or feature PR — open a separate issue for cleanup.
- Keep functions small and single-purpose.
- Write readable code over clever code.
- Add comments only when the **why** is non-obvious. Do not comment what the code already says.

---

## Testing

Before opening a PR, run:

```bash
# Backend
cd backend
npm run lint
npm run test
npm run build

# Frontend
cd frontend
npm run lint
npm run build
```

All checks must pass.

---

## AI Development Guidelines

This repository uses AI coding assistants. AI-generated code is held to the same standard as human-written code.

AI contributors must:

- Never push directly to `main` or `production`
- Never delete or modify code unrelated to the current issue
- Keep changes minimal — only touch what the issue requires
- Update tests when behavior changes
- Update documentation when interfaces or flows change
- Explain reasoning in the PR description, especially for non-obvious decisions

---

## Security

Never commit secrets to this repository under any circumstances.

This includes:

- API keys and tokens
- `.env` files or environment variable files
- Database credentials or connection strings
- Private keys or certificates
- OAuth client secrets

Use environment variables and ensure `.env` is listed in `.gitignore`. If you accidentally commit a secret, rotate it immediately and notify the team.

---

## Questions

If requirements are unclear, open an issue and ask before writing code. Making assumptions leads to rework. A five-minute conversation in an issue saves hours of back-and-forth in a PR review.
