# GitHub web workspaces

Laplace supports two Git storage modes. Local workspaces use a selected folder and its
existing repository. Web workspaces clone a GitHub repository into the browser's
Origin Private File System (OPFS), without requesting a local folder. Both modes use
the same Git worker, guarded commit/fetch/sync/push operations, Markdown gateway,
attachments, save queue, and hydration protection. Browser storage without Git remains
available separately; opening a web workspace does not migrate or replace its notes.

Open a local folder from the workspace selector, then open Source Control. If the folder
has no Git repository, choose **Configure GitHub synchronization**, enter a GitHub HTTPS
repository URL and commit author, and authorize with **Connect with GitHub** or a personal
access token. Saving
initializes Git and configures the remote in the current folder; existing notes remain
in place. Use Sync first to download existing remote notes without creating an unrelated
local commit. Nonconflicting local notes and local Laplace settings remain as working
changes; conflicting note paths stop the import before files are changed. Unstage any
local staged changes before this initial download. Commit retained local changes afterward.
A remote with unrelated history
is protected by the existing divergence checks and is not merged automatically.
The workspace selector has no separate GitHub button. Previously created web workspaces
can still be reopened from the selector and survive page reloads. Closing a
web workspace requires explicit confirmation to delete its browser copy, including
unpushed commits. The remote repository is unchanged.

OPFS and IndexedDB belong to an origin and browser profile. Unsynced work remains in
that browser, and clearing site data removes it. Laplace requests persistent browser
storage, but the browser decides whether to grant it. A failed clone is discarded only
from its newly allocated OPFS directory; registered workspaces are never replaced.

## Personal access tokens

In Repository settings, use the Personal access token section instead of web sign-in.
Choose the token type, enter your GitHub username and paste the token in Access token:

- **Classic:** grant the `repo` scope for private repositories and pushing commits.
  Authorize SSO for the organization when required.
- **Fine-grained:** choose the repository owner and the repositories to synchronize,
  then grant **Contents: Read and write** under repository permissions. Organization
  policies may require approval before the token can access the repository.

Use **Test connection** to check read access, then save. This check does not verify push
permissions. Tokens with read-only access can fetch but cannot push commits. Editing
GitHub Actions workflow files may require additional workflow permissions. Both token
types use the same encrypted, workspace-and-repository-scoped browser storage as OAuth.
Existing credentials remain compatible. Clear credentials and save to remove the local
copy; revoke or rotate the token in GitHub when needed.

Tokens do not require the OAuth service or a client secret. Browser Git still requires
a trusted CORS gateway: use the configured GitHub service, the automatic Vite proxy in
local development, or an explicitly configured proxy.

Reference: [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Deploy the GitHub service

GitHub OAuth code exchange requires a server-held client secret, and Git smart HTTP
requires a CORS gateway in browsers. The optional service in `services/github` supplies
both without storing notes or credentials on the server. The SPA remains static and
can still be hosted on GitHub Pages. Local Git and existing manual token configuration
continue to work without this service.

1. Register a GitHub OAuth App. Set its callback URL to
   `https://YOUR-SERVICE/auth/callback` and its homepage to the deployed Laplace URL.
2. In `services/github/wrangler.toml`, set `APP_ORIGIN` to the exact SPA origin
   (scheme and host, without `/Laplace/`) and `GITHUB_CLIENT_ID` to the OAuth App's ID.
   Deploy this module using Cloudflare Workers or adapt its standard Fetch handler to
   your host. Use a dedicated service origin; its OAuth cookie uses the `__Host-` prefix.
3. Configure `GITHUB_CLIENT_SECRET` and a cryptographically random `SESSION_SECRET`
   of at least 32 bytes using the host's secret manager. For Wrangler, run
   `wrangler secret put GITHUB_CLIENT_SECRET` and `wrangler secret put SESSION_SECRET`
   from `services/github`, then `wrangler deploy`.
4. Build the SPA with `VITE_GITHUB_SERVICE_URL=https://YOUR-SERVICE`. This is a public
   endpoint URL. Never put a client secret or access token in any `VITE_*` variable.
   Rebuild and deploy the SPA after changing this value. Without it, the sign-in button
   explains that web authorization is not configured.

OAuth uses a random state, a signed expiring HttpOnly/Secure/SameSite cookie, and S256
PKCE. The callback exchanges the authorization code server-side and posts the result
only to the configured SPA origin. The SPA validates the popup window, service origin,
and original state; cancellation, closing, and timeout release the listener. The token
stays in memory until settings are saved or a clone succeeds, then uses the existing
encrypted, workspace-and-repository-scoped credential store. Tokens never go into
workspace files, Git configuration, URLs, or service logs. OAuth uses the `repo` scope
to support private repositories and push; GitHub OAuth Apps do not offer per-repository
selection for this scope. Organization policies may require separate approval. Revoke
the app under GitHub Settings → Applications when access should be removed.

The gateway accepts only the configured SPA origin and GitHub smart HTTP repository
endpoints. It rejects redirects and arbitrary hosts, forwards only required Git
headers, and marks responses `no-store`. Deploy it behind appropriate hosting quotas
and rate limits. HTTPS is required. Do not enable response/body logging for auth or Git
requests. The GitHub service must remain reachable for network Git operations; note
editing and local commits remain available offline.

During local Vite development on localhost or another loopback address, GitHub Git
requests use Vite's same-origin `/api/git-proxy`, even when a GitHub service URL is
configured. An explicitly entered CORS proxy still takes precedence; leave that field
empty to use the automatic selection. Production builds use the configured service.
OAuth uses the service's configured `APP_ORIGIN` independently; testing authorization
on localhost requires a separate development service configured for that local origin.

Reference: [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
