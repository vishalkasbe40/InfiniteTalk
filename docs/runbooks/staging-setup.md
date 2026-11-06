# Runbook: put ExamSaathi online for testing (staging)

Who: the founder, with Claude guiding. Time: about 45 minutes. Cost: free tiers (see notes).
Never paste passwords or keys into chats, issues or files: only into the settings boxes named below.

## Step 1: Database (Supabase + GitHub)
1. **Supabase → Account → Access Tokens → Generate new token.** Name it `github-deploy`. Copy it.
2. **Supabase → your project → Project Settings → General:** copy the **Project ID** (the "reference").
3. You need the **database password** you chose when creating the project. If you don't have it,
   reset it at **Project Settings → Database → Reset database password**.
4. **GitHub → the repository → Settings → Secrets and variables → Actions → New repository secret**,
   three times:
   - `SUPABASE_ACCESS_TOKEN` = the token from 1
   - `SUPABASE_PROJECT_REF` = the Project ID from 2
   - `SUPABASE_DB_PASSWORD` = the password from 3
5. **GitHub → Actions → Deploy database → Run workflow**, type `DEPLOY`, press **Run workflow**.
   Wait for the green tick (about 2 minutes). Re-run it whenever new database changes are merged.

## Step 2: Supabase settings (Authentication)
- Sign In / Providers: anonymous sign-ins **off**; "Allow new users to sign up" **off**; email **on**;
  "Confirm email" **on**; minimum password length **8**; "Secure password change" **on**.
- Multi-factor: TOTP **on**.
- Emails: paste the three templates from `supabase/templates/` (Confirm signup, Magic link,
  Reset password), with the subjects from `supabase/config.toml`.
- URL Configuration: filled in at Step 4.
- Testing note: Supabase's built-in email sender only delivers to members of your Supabase team and
  only a few emails per hour. Use your own (team) email for testing; set up a real email sender
  (Authentication → Emails → SMTP) before inviting students.

## Step 3: Hosting (Vercel)
1. Sign up at vercel.com **with your GitHub account**; allow access to this repository.
2. **Add New → Project → import the repository.**
   - Root Directory: `apps/web` (framework: Next.js; keep the other defaults).
   - Environment Variables (from **Supabase → Project Settings → API**):
     - `SUPABASE_URL` = Project URL
     - `SUPABASE_ANON_KEY` = the `anon` / publishable key
     - `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` / secret key (**secret**: only here)
     - `APP_BASE_URL` = leave as `https://example.invalid` for now (fixed in Step 4)
3. **Deploy.** Copy the address Vercel gives you (e.g. `https://examsaathi-xyz.vercel.app`).

## Step 4: Connect the two
1. **Vercel → Project → Settings → Environment Variables:** set `APP_BASE_URL` to your Vercel address,
   then **Deployments → … → Redeploy**.
2. **Supabase → Authentication → URL Configuration:** Site URL = your Vercel address; Redirect URLs:
   add `<your address>/auth/confirm`.
3. Open `<your address>/api/health`: it should show `{"status":"ok"}`.

## Step 5: Become admin and try it
Follow README → "Becoming the first admin", then add content (README → "Exam and syllabus data").

## Notes
- Vercel Hobby (free) is for personal, non-commercial use; with real students, plan for Vercel Pro.
- Supabase Free pauses a project after a week without activity; Pro adds daily backups/PITR
  (founder decision D10, required before the beta).
- Keep the Supabase dashboard account itself protected with two-step verification.
