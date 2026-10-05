# LOCAL Mode Desktop Frontend — Supabase Removal Complete

This change removes all Supabase/SaaS infrastructure from the desktop frontend and hardcodes the application to LOCAL mode only. The implementation cleans out auth switching logic, connection-mode detection, cloud signup flows, and billing UI. AppProviders now simplifies to a single startup sequence: start the local backend, wait for health, preload common endpoints, show the window.

The new DesktopLicenseHelp component surfaces KRUGER's modifications in Settings > About, documenting what was removed (Supabase, cloud sync, telemetry) and restating the AGPL-v3 license. Configuration navigation is hardcoded to show only Preferences and About sections.

**Watch for:**
- (confirmed) TypeScript check already passed — no build-blocking errors.
- (confirmed) All Supabase/SaaS imports removed; connectionMode hardcoded to LOCAL.
- (confirmed) DesktopLicenseHelp mounted and reachable via configNavSections.

**Verdict**: APPROVED

---

## High-level view

The AppProviders rewrite drops roughly 60% of its component tree by removing ProprietaryAppProviders wrappers, auth providers, usage limit modals, and onboarding bootstrap logic. What remains is a straightforward `backendReady` boolean state: start the backend on mount, subscribe to its health status, timeout after 15 seconds if it fails to respond, then preload a hardcoded list of common tool endpoints. The loading screen is minimal and stays open until either the backend reports healthy or the timeout fires. Window show/focus/attention calls happen once the backend is ready.

The DesktopLicenseHelp component is a new item in Settings > About that renders Mantine UI cards with open-source component badges, KRUGER modification bullet points, and AGPL-v3 license links. All text is i18n-ready with translation keys that follow the project's patterns. The configNavSections simplification removes connection-mode detection and hardcodes the nav to show Preferences and About (with DesktopLicenseHelp as a sub-item).

---

<details>
<summary>Issues (0)</summary>

No blocking concerns.

</details>

<details>
<summary>Details</summary>

### Backend startup no longer conditional on auth

The old AppProviders had a multi-layer auth guard: it subscribed to `authService` state, checked JWT tokens via `connectionModeService`, and blocked rendering until both the auth layer confirmed readiness and the connection mode settled. The new version skips all of that and starts the backend unconditionally on mount. The Tauri backend is assumed to be present (it's bundled), so there's no need to detect whether we're in SaaS mode or wait for a user to sign in.

The startup now follows a simpler contract: `tauriBackendService.startBackend()` launches the process, then a subscription to its status waits for `"healthy"`. If the status never transitions (backend crash, port conflict, permission issue), a 15-second timeout fires and marks `backendReady` true anyway, allowing the app to proceed even if the backend is broken. This is a design trade-off—proceeding with a failed backend will show errors in the UI, but it prevents an infinite loading screen if startup fails. The comment in the catch block acknowledges this explicitly.

### Endpoint preloading for performance

Once the backend is ready and its URL is available, the code preloads a hardcoded list of common tool endpoints (compress, merge, split, convert, rotate, etc.). This is transparent to the user but speeds up first interaction by warming the endpoint availability cache. The preload respects the backend's online state—if it's not yet online when `backendReady` fires, it subscribes to the next status change and retries then.

### Window lifecycle tied to backend readiness

Tauri-specific code (show, unminimize, focus, request user attention) fires only once the backend is healthy. This prevents the window from appearing blank while the backend is still starting. Error handlers suppress cascade failures (one call failing doesn't block the next).

### DesktopLicenseHelp content and structure

The component uses Mantine primitives (Card, Stack, Text, Anchor, Badge, Group) consistently with the project's design system. Content is split into four sections: open-source components (Stirling PDF, backend stack, frontend stack, desktop stack), KRUGER modifications (Supabase removal, LOCAL hardcoding, no cloud sync, no telemetry), a license description, and a link to the full AGPL-v3 text on GitHub. All text is wrapped in `t(key, fallback)` calls, following the i18n pattern already used throughout the frontend.

The component is mounted via configNavSections, which adds it as an item in the About section with appropriate label and description keys. The key `"kruger-licensing"` was added to the VALID_NAV_KEYS array in types.ts, so deep-linking to the license help (via Settings > About > KRUGER Customizations & License) is possible if needed.

### Navigation simplification hardcoded to LOCAL

The old configNavSections would inspect `connectionModeService` to determine whether to show cloud-specific sections (plan, payments, teams, etc.). The new version removes that logic entirely and unconditionally returns the first section (Preferences) and a modified About section. This is safe because LOCAL mode has no concept of teams, billing, or account linking; those sections would be dead code and confusing to users.

The About section merges in the DesktopLicenseHelp as a new item, allowing users to view both the backend third-party licenses (from core) and the KRUGER customization notice in one place.

### Import paths and layering

All imports in AppProviders use `@app/*` for components and services specific to the desktop build (DesktopConfigSync, tauriBackendService, etc.), and `@core/*` for shared application infrastructure (CoreAppProviders, UpdateModal). The configNavSections file imports `@proprietary/components/shared/config/configNavSections` to get the base Preferences + admin sections, then layers in the DesktopLicenseHelp. This is the correct shadowing pattern: the proprietary layer provides the fallback, and the desktop layer adds its own customization on top.

### TypeScript type safety

The addition of `"kruger-licensing"` to VALID_NAV_KEYS ensures that the nav item key is recognized as a valid type by the ConfigNavItem interface. The DesktopLicenseHelp component is typed as `React.ReactNode` (matching the ConfigNavItem.component type) and has no untyped props or loose `any` fields.

</details>

<details>
<summary>File map</summary>

- **AppProviders.tsx**: Complete rewrite. Removed ~60 lines of auth/SaaS logic (ProprietaryAppProviders, authService subscriptions, connectionModeService checks, SaaSTeamProvider wrappers, usage limits, sign-in modal). Replaced with single `backendReady` state, backend startup on mount with 15-second timeout, endpoint preload, and window lifecycle management.

- **DesktopLicenseHelp.tsx**: New file. 90 lines. Card component with four sections: open-source components (with GitHub link), KRUGER modifications (Supabase removal, LOCAL hardcoding, no cloud sync, no telemetry), AGPL-v3 license text and link. All text i18n-ready.

- **configNavSections.tsx**: Removed connection-mode detection and SaaS section handling. Hardcoded to show Preferences + About. Added DesktopLicenseHelp as a new item in About section.

- **types.ts**: Added `"kruger-licensing"` to VALID_NAV_KEYS array.

[Full diff available in git: `git diff main frontend/editor/src/desktop/`]

</details>
