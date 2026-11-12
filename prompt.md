You are working on NatureLite WhatsApp Store. Read this fully before touching any code.

---

## THE PROJECT

NatureLite is a WhatsApp-first e-commerce store. Customers order via WhatsApp. Admins manage everything via a web dashboard.

**Backend** — NestJS + MongoDB + Redis (Upstash) + BullMQ  
**Frontend** — Next.js 14 (App Router) + TypeScript + Tailwind CSS + Radix UI  

Backend runs on port **7001**. Frontend runs on port **8001**.

---

## BACKEND MODULES

auth, users, products, categories, orders, cart, payments, wallet, coupons, wishlist, whatsapp, chatbot, notifications, email, media, analytics, settings, stores, subscriptions, raw-materials, delivery-collections, store-stock, store-sales, reminders, queues, ucm, admin, feedback, audit, interakt

**Key integrations:** 360dialog (WhatsApp API), Cloudinary (images), Razorpay (payments), Google Gemini (AI chatbot), Upstash Redis (queue/cache)

---

## FRONTEND PAGES

- `/` — public store
- `/admin` — admin dashboard (products, orders, analytics, settings, etc.)
- `/admin-login` — admin auth
- `/department` — department view
- `/invoice` — invoice renderer

**Key libraries:** React Query (server state), Zustand (client state), React Hook Form + Zod (forms), Framer Motion + GSAP (animations), Three.js (3D), Recharts (charts), Radix UI (components)

---

## CODE RULES — FOLLOW ALL OF THESE

### General
- Write real solutions. No hacks, no workarounds, no "this will do for now."
- If something is broken, fix the root cause. Do not patch over it.
- Do not add features that were not asked for.
- Do not add comments that explain what the code does — the code should explain itself. Only comment WHY if it is truly non-obvious.
- No console.log left in production code.

### OOP & Architecture
- Use classes properly. Each class has one responsibility.
- Keep business logic in services, not controllers or resolvers.
- Use dependency injection. Never instantiate services manually.
- DTOs validate all incoming data. Never trust raw request bodies.
- Separate concerns: controller → service → repository/model. Do not mix layers.
- Use interfaces and abstract classes when multiple implementations exist.

### Backend (NestJS)
- Every endpoint must have proper DTO validation using `class-validator`.
- Use guards for auth, not inline checks in controllers.
- Errors must use NestJS `HttpException` or built-in exceptions — never `throw new Error()` in controllers.
- Database queries belong in the service layer. Never query MongoDB directly from a controller.
- Use Mongoose schemas properly — define types, add indexes where needed.
- Queue jobs go through BullMQ — never do heavy work synchronously in a request handler.

### Frontend (Next.js)
- Use React Query for all API calls. No raw `useEffect` + `fetch` combos.
- Forms use React Hook Form + Zod. No uncontrolled inputs for forms.
- Components stay small and focused. If a component is over 200 lines, split it.
- Keep pages thin — extract logic into hooks and components.
- Use Tailwind classes. Do not write inline styles unless Tailwind cannot do it.
- TypeScript must be strict. No `any`. Define proper types and interfaces.
- Handle loading, error, and empty states for every data fetch.

### Git
- Never commit `.env` files.
- Never commit `package-lock.json` or `yarn.lock` unless you specifically added a new package.
- Never commit anything inside `node_modules/`.
- Write clear commit messages that say what changed and why.

---

## CAVEMAN MODE — THINK BEFORE YOU CODE

Before writing a single line of code, think like a caveman. Break the problem down to its most primitive level.

Ask yourself:
- What is broken or missing? (not "what do I think is wrong" — what is *actually* wrong)
- What is the simplest possible fix?
- What will break if I change this?
- Do I actually need to add code, or can I fix it by removing code?

Say your thinking out loud in plain simple words before writing code. No fancy words. No assumptions. Just: "This broken because X. Fix is Y. Risk is Z."

If you cannot explain the problem in one sentence, you do not understand it yet. Keep thinking.

Only write code after the thinking is clear.

---

## BEFORE YOU WRITE CODE

1. Read the relevant existing module/component first.
2. Understand the pattern already used — follow it.
3. If the existing pattern is wrong, fix it properly, do not add a second bad pattern next to it.
4. When in doubt, simpler is better.

---

Now tell me what you need.
