# Implementation Plan: KRUGER Local-Only Desktop Mode

## Overview
Rewrite the desktop AppProviders to hardcode local-only mode, remove Supabase/SaaS dependencies, and simplify initialization logic. Add a desktop license help component in the settings About section.

---

## Phase 1: Rewrite AppProviders for Local-Only Mode

### 1. Update `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\AppProviders.tsx`

**What:** Strip AppProviders to local-only operation, removing all connection-mode switching, SaaS/Supabase providers, authentication flow, and related state management.

**Changes:**
- Replace `ProprietaryAppProviders` with `CoreAppProviders` (imported as explicit alias to avoid confusion)
- Hardcode `connectionMode = 'local'` as a constant—no state variable, no switching
- Wrap backend startup in `tauriBackendService.startBackend()` + `waitUntilHealthy` on mount (already in code, keep it)
- Replace `authChecked` with `backendReady` boolean state—simpler, no JWT/auth state needed
- Show a loading screen until backend is healthy (already in code, keep it)

**Remove these imports and features:**
- `ProprietaryAppProviders` (never imported, breaks build—replace with `CoreAppProviders`)
- `SaaSTeamProvider` and its wrapper
- `DesktopSaasOnboardingBootstrap`
- `UsageLimitModalHost`
- `SignInModal` and `OPEN_SIGN_IN_EVENT`
- `ClassificationBackgroundRunner`
- `connectionModeService` subscriptions and mode-switching logic
- `authService` calls
- `selfHostedServerMonitor` calls
- `JWT_EXPIRED_PROMPTED_KEY` constant
- `pendingSignIn` state and related dispatch logic
- `ToolActionsContext.Provider` (entire wrapper—not needed in local mode)
- All `appKey` remounting logic for SaaS provider tree

**Keep these imports and features:**
- `CoreAppProviders` (from `@core/components/AppProviders`)
- `DesktopConfigSync`, `DesktopBannerInitializer`, `SaveShortcutListener`, `LocalProcessingFolders`, `DiskConflictHost`
- `DesktopOnboardingModal` (keep—will render welcome slide only; sign-in slide check inside it is harmless when `authService.isAuthenticated()` returns false)
- `UpdateModal` / `useDesktopUpdatePopup`
- `endpointAvailabilityService.preloadEndpoints` call
- `DesktopQueryCacheReset`
- Window show/focus logic (replace `authChecked` with `backendReady`)

**Imports to keep (verify they resolve in desktop or lower layer):**
```typescript
import { ReactNode, useEffect, useState } from "react";
import { AppProviders as CoreAppProviders } from "@core/components/AppProviders";
import { DesktopConfigSync } from "@app/components/DesktopConfigSync";
import { DesktopQueryCacheReset } from "@app/components/DesktopQueryCacheReset";
import { DesktopBannerInitializer } from "@app/components/DesktopBannerInitializer";
import { SaveShortcutListener } from "@app/components/SaveShortcutListener";
import { LocalProcessingFolders } from "@app/components/LocalProcessingFolders";
import { DiskConflictHost } from "@app/components/shared/DiskConflictHost";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";
import { useFirstLaunchCheck } from "@app/hooks/useFirstLaunchCheck";
import { useBackendInitializer } from "@app/hooks/useBackendInitializer";
import { DESKTOP_DEFAULT_APP_CONFIG } from "@app/config/defaultAppConfig";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import UpdateModal from "@core/components/shared/UpdateModal";
import { useDesktopUpdatePopup } from "@app/hooks/useDesktopUpdatePopup";
```

**Remove these imports:**
```typescript
// Remove:
import { ProprietaryAppProviders }  // ← never exported, causes build error
import { SaaSTeamProvider }
import { DesktopSaasOnboardingBootstrap }
import UsageLimitModalHost
import { SignInModal }
import { OPEN_SIGN_IN_EVENT }
import { ToolActionsContext }
import { useBackendInitializer }  // ← already imported, keep only if needed
import { connectionModeService, JWT_EXPIRED_PROMPTED_KEY }
import { STIRLING_SAAS_URL }
import { selfHostedServerMonitor }
import { authService }
```

**Logic simplification:**
- Remove all `connectionMode` state, `appKey` remounting, and `lastAppliedMode` refs
- Remove `firstLaunchInitiated` guard—simpler to just always call startup logic
- Keep drag-drop prevention effect (unrelated to auth)
- Collapse first-launch and auth-checking effects into one that:
  - Waits for `backendReady === false` to start
  - Calls `tauriBackendService.startBackend()`
  - Waits for healthy (already in code)
  - Sets `backendReady = true`
  - Preloads endpoints once healthy
- Replace `authChecked` with `backendReady` in window show/focus effect

**Files to modify:**
- `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\AppProviders.tsx`

**Verify:**
- `npm run frontend:check` passes (TypeScript, linter)
- No `ProprietaryAppProviders` reference remains
- `CoreAppProviders` is imported and used
- Desktop dev build starts without connection-mode errors

---

## Phase 2: Check DesktopOnboardingModal Dependencies

### 2. Verify `DesktopOnboardingModal` does not require auth-state changes

**What:** Confirm that `DesktopOnboardingModal` (already in src/desktop) handles the case where `authService.isAuthenticated()` returns `false` gracefully, and does not require sign-in state to be exposed.

**Findings from code inspection:**
- DesktopOnboardingModal calls `authService.isAuthenticated()` in a useEffect to determine if sign-in is needed
- When authenticated returns `false`, it shows only the welcome slide (step 0) and skips the sign-in slide
- The sign-in slide check (`if (needsSignIn)`) is harmless—it's just a boolean that gates the UI
- **Decision:** Keep DesktopOnboardingModal as-is. In local mode, `authService.isAuthenticated()` will return `false`, the modal will show the welcome slide only, and the sign-in slide will not render. This is the desired behavior.

**Files to review:**
- `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\DesktopOnboardingModal.tsx`

**Verify:**
- Run the app and confirm the welcome slide shows on first launch
- Confirm the sign-in slide does not appear
- Confirm dismissing the welcome slide closes the modal

---

## Phase 3: Create DesktopLicenseHelp Component

### 3. Create `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\shared\config\DesktopLicenseHelp.tsx`

**What:** Add a simple Mantine-based modal/card component that displays open-source license info and KRUGER customization notes. Mount it in the Settings > About section.

**Component design:**
- Export a React component `DesktopLicenseHelp` that returns a simple card or section div
- Display:
  - Title: "KRUGER Customization & Licensing"
  - Body text: "Stirling PDF is open-source under the GNU Affero General Public License (AGPL). KRUGER customizations preserve this license. All modifications remain open under the same terms."
  - List of open-source components used (e.g., PDFBox, LibreOffice, PDF.js, Mantine UI, React)
  - Link or instruction to view full AGPL license text (point to LICENSE file or GitHub)
- Style with Mantine primitives (Stack, Card, Text, Badge, Group)
- Translations: use i18n keys like `settings.desktop.licensing.title`, `settings.desktop.licensing.body`

**Implementation note:**
- Do NOT call authService, connectionModeService, or any SaaS-related services
- Import only from `@app` or `@core` (Mantine, React, i18n)

**Files to create:**
- `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\shared\config\DesktopLicenseHelp.tsx`

**Verify:**
- Component renders without errors
- No auth or connection-mode calls in the component
- Styled consistently with existing SettingsCard/AboutSection

---

## Phase 4: Mount DesktopLicenseHelp in Settings About Section

### 4. Override core AboutSection in desktop layer

**What:** Create `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\core\components\shared\config\configSections\AboutSection.tsx` shadow in the desktop layer that includes the new DesktopLicenseHelp card.

**Approach:**
- Create desktop/components/shared/config/configSections/AboutSection.tsx
- Import the core AboutSection
- Wrap it with DesktopLicenseHelp prepended (add the license card before the Help section)
- Re-export with the same signature so the desktop build uses the desktop version

**Alternative (simpler):**
- Modify `configNavSections.tsx` in desktop to inject DesktopLicenseHelp into the about section's items directly
- Since configNavSections in desktop already customizes sections, add DesktopLicenseHelp as a new item in the about section

**Decision: Use the simpler approach**—modify `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\shared\config\configNavSections.tsx` to add a new item after the standard About section that renders DesktopLicenseHelp.

**Files to modify:**
- `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\shared\config\configNavSections.tsx` — add a "KRUGER Licensing" item to the about section
- `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\src\desktop\components\shared\config\DesktopLicenseHelp.tsx` — create the component

**Verify:**
- Open Settings > About in the desktop app
- Confirm "KRUGER Customization & Licensing" section appears
- Confirm it displays license info correctly
- No TypeScript errors

---

## Phase 5: Verify Build System

### 5. Confirm desktop build command

**What:** Verify the correct build command for the desktop MSI on Windows.

**Finding:**
From `.taskfiles/desktop.yml`:
- Standard build: `task desktop:build` runs `npx tauri build` in the frontend/editor directory after dependencies are prepared
- Dev build (no bundling): `task desktop:build:dev` runs `npx tauri build --no-bundle`
- Windows-specific dev build: `task desktop:build:dev:windows` runs `npx tauri build --bundles nsis --config '{"bundle":{"createUpdaterArtifacts":false}}'`

**Command for Windows MSI:**
- Production: `task desktop:build` (produces NSIS installer in `frontend/editor/src-tauri/target/release/bundle/nsis/`)
- Dev (faster, no updater artifacts): `task desktop:build:dev:windows`

**Verify:**
- No build-time errors when running `task desktop:build:dev:windows`
- MSI file is generated in the expected location
- App launches without connection-mode errors

---

## Summary of Changes

| Component | File | Change | Impact |
|-----------|------|--------|--------|
| AppProviders | `frontend/editor/src/desktop/components/AppProviders.tsx` | Hardcode local mode, remove SaaS/auth/connection-switching logic | Desktop app no longer requires Supabase or auth service |
| DesktopOnboardingModal | `frontend/editor/src/desktop/components/DesktopOnboardingModal.tsx` | No change required | Welcome slide only; sign-in slide hidden when auth fails |
| DesktopLicenseHelp | `frontend/editor/src/desktop/components/shared/config/DesktopLicenseHelp.tsx` | **New file** | Displays open-source license and KRUGER customization notes |
| configNavSections | `frontend/editor/src/desktop/components/shared/config/configNavSections.tsx` | Add DesktopLicenseHelp to About section | Settings > About now shows KRUGER licensing info |
| Desktop build | `.taskfiles/desktop.yml` | Reference only | Build command: `task desktop:build` or `task desktop:build:dev:windows` |

---

## Verification Checklist

- [ ] AppProviders.tsx builds without `ProprietaryAppProviders` error
- [ ] `npm run frontend:check` passes
- [ ] Desktop dev app launches and shows loading screen until backend is healthy
- [ ] Welcome slide appears on first launch, sign-in slide does not
- [ ] Dismissing welcome slide closes onboarding modal
- [ ] Settings > About shows "KRUGER Customization & Licensing" section
- [ ] License info renders correctly without auth/connection errors
- [ ] All imports resolve to desktop/cloud/proprietary/core layers (no SaaS-only imports)
- [ ] `task desktop:build:dev:windows` completes successfully
- [ ] Desktop MSI file is generated
- [ ] Installed MSI launches app without connection-mode UI

