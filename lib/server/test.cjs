# nerdLove — Project Brief (MVP)

## 1) Goal
Create **nerdLove**, a platform where post‑AI specialists (“nerds”) list **1–3 top skills**, get AI‑generated **Gemini Product Suggestions**, and collaborate to vote and invest in the best ideas until they reach a funding threshold and move into production. Home shows a teaser list of relevant suggestions.

## 2) Success Criteria (MVP)
- Users can register/login as **Nerd** or **Client**.
- Nerd profile: name, avatar, short bio, **1–3 skills**.
- Admin can trigger **Gemini** to generate a **Product Suggestion** linked to specific nerds/skills.
- Each suggestion saved in Strapi with **image, description, suggested nerds, graph JSON**.
- Voting (+1/–1) by eligible users; a **Production Group** can be formed from involved nerds.
- Funding model: **percent** or **amount**; when goal reached, status becomes **in‑production**.
- Home page shows **teasers** ranked by relevance.

## 3) Tech Stack
- **Backend:** Strapi v5 (self‑hosted)
- **DB:** PostgreSQL (Neon free tier recommended)
- **Media:** Cloudinary (or Supabase storage via `strapi-provider-upload-supabase`)
- **Auth:** Strapi Users & Permissions
- **Frontend:** Next.js (or Nuxt) consuming REST/GraphQL
- **Payments (later):** Stripe

## 4) Data Model (Strapi)
### Collection Types
- **User** (plugin users-permissions): name, email, role(`admin|nerd|client`), avatar, bio, relations: skills, services
- **Skill**: name, description, category
- **Service**: title, price, durationMin, description, owner(User)
- **Gemini Suggestion**: title, slug, description (rich), image (media), suggestedNerds (M2M → User), skills (M2M → Skill), status(`idea|open-for-votes|forming-group|funding|in-production|archived`), score (float), graph (JSON), aiMeta (JSON), createdByAI (bool)
- **Vote**: user → User, suggestion → Gemini Suggestion, value(int: +1/−1), weight(float?)
- **Production Group**: suggestion (O2O → Gemini Suggestion), owners (M2M → User), investmentGoal (decimal), investmentRaised (decimal), contributionMode(`percent|amount`), contributions (component), governance(`simple-majority|two-thirds|quadratic|owner-weighted`), status(`draft|funding|locked|live`)
- **Investment**: user → User, group → Production Group, amount (decimal), percent (decimal), txRef (string), status(`pledged|captured|refunded`)

### Components
- **investment.contribution**: user(User), amount(decimal?), percent(decimal?), note(string)

## 5) Roles & Permissions
- **admin**: full access.
- **nerd**: CRUD own profile/services; create votes; create investments; join their Production Group; read suggestions.
- **client**: read suggestions; (optional) invest if enabled; book services.

## 6) Status Transitions
**Suggestion:** `idea → open-for-votes → forming-group → funding → in-production → archived`
- To **forming-group**: netVotes ≥ threshold.
- To **funding**: owners set.
- To **in-production**: `investmentRaised ≥ investmentGoal` (or percent sum ≥ 100%).

## 7) APIs (MVP)
### Public/Authenticated
- `POST /api/gemini/suggest` → create suggestion via Gemini for seed nerds/skills.
  - body: `{ seedNerdIds: string[], seedSkills?: string[], brief?: string }`
- `GET /api/gemini-suggestions?populate=*` → list suggestions (filters on status, skills).
- `POST /api/votes` → body: `{ suggestion: id, value: 1 | -1 }` (unique by user+suggestion).
- `POST /api/investments` → `{ group: id, amount?: number, percent?: number }` → recompute totals, flip status if goal met.
- `POST /api/production-groups` → owners array, suggestion id.

### Admin‑only helpers
- `POST /api/gemini/suggest/refresh-image` (re-generate/attach image)
- `POST /api/suggestions/:id/status` → set status (guarded by policy)

## 8) Gemini Integration (server‑side service)
- Build **Strapi service** `gemini.suggest()` which:
  1) Loads seed nerds & skills.
  2) Calls Gemini with a prompt describing nerd skills + market niches.
  3) Returns: `{ title, description, imageUrl, graph:{nodes,links}, meta }`.
  4) Uploads image to media provider; creates **Gemini Suggestion** entry.
- Persist raw AI context in `aiMeta` for traceability.

## 9) Home Page (UX)
- **Search mask** for skills/keywords.
- **Teaser list** of suggestions: image, title, 1‑line description, tags, mini‑avatars of suggested nerds, vote count, funding progress bar.
- Sort by personalized `score` (skill overlap) or trending.

## 10) Circle Visualization (frontend)
- Center node = product; outer ring = nerds; **arrows** = flow steps.
- Use lightweight SVG component fed by `graph` JSON (`nodes: [{id,name,avatar}], links: [{source,target,label}]`).
- Click nerd → open profile; toolbar: Vote, Invest, Join Group.

## 11) Env & Config
```
# Strapi
HOST=0.0.0.0
PORT=1337
APP_KEYS=...
ADMIN_JWT_SECRET=...
JWT_SECRET=...

# DB (Neon recommended)
DATABASE_CLIENT=postgres
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DB
DATABASE_SCHEMA=public

# Media (Cloudinary)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Optional: Supabase storage provider
SUPABASE_API_URL=...
SUPABASE_API_KEY=...
SUPABASE_BUCKET=...
SUPABASE_DIRECTORY=uploads
```

## 12) MVP Roadmap
**Week 1**  – Strapi setup, DB, media, content types, roles, seeds.  
**Week 2**  – Gemini service + suggest endpoint, Home teasers, detail page with SVG circle.  
**Week 3**  – Votes & Groups, funding math, progress bars, basic emails.  
**Week 4**  – Polish permissions, deploy (Render for Strapi + Neon DB, Vercel for frontend), Freenom free domain.

## 13) Acceptance Checklist
- [ ] Create Suggestion via API stores title/desc/image/graph/nerds.
- [ ] Vote adds/updates unique (user,suggestion) and updates net score.
- [ ] Create Production Group from suggestion; only owners can edit.
- [ ] Investments update totals; status flips when goal met.
- [ ] Home shows ranked suggestions with teaser data.
- [ ] Circle graph renders from saved `graph` JSON.
- [ ] Basic e2e happy path works on staging domain.

## 14) Nice‑to‑have (post‑MVP)
- Reputation‑weighted votes; quadratic voting.
- In‑app messaging; calendar/availability.
- Stripe payments & rev‑share; invoices.
- Notifications (email/push) for vote/funding milestones.
- Multi‑tenancy for themed communities.

---
**Owner:** @eggermann  
**Repo:** dailydoase  
**Last updated:** 2025‑08‑13 (Europe/Berlin)
