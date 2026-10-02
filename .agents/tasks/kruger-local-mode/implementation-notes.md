# Implementation Notes

## Changes Made

### 1. AppProviders.tsx Rewrite
**File**: `frontend/editor/src/desktop/components/AppProviders.tsx`

- **Removed**: All SaaS/auth/connection-mode logic
  - ProprietaryAppProviders → CoreAppProviders (no Supabase providers)
  - connectionModeService subscriptions
  - authService checks
  - SaaSTeamProvider, ToolActionsContext, UsageLimitModalHost, SignInModal wrappers
  - DesktopSaasOnboardingBootstrap, ClassificationBackgroundRunner
  - All JWT and auth state management

- **Simplified**: Backend startup and health monitoring
  - Single `backendReady` boolean state (replaces `authChecked`)
  - Hardcoded LOCAL mode (no connection mode switching)
  - Backend starts on mount with status subscription (replaces private waitUntilHealthy call)
  - Simple 15-second timeout to prevent infinite loading
  - Preload endpoints once backend is healthy

- **Kept**: All desktop-specific components
  - DesktopConfigSync, DesktopQueryCacheReset, DesktopBannerInitializer
  - SaveShortcutListener, LocalProcessingFolders, DiskConflictHost
  - DesktopOnboardingModal (shows welcome slide only in local mode)
  - UpdateModal for auto-updates
  - Drag-drop prevention

### 2. DesktopLicenseHelp Component
**File**: `frontend/editor/src/desktop/components/shared/config/DesktopLicenseHelp.tsx`

- **New component**: Displays KRUGER customizations and open-source license information
- **Content**:
  - Title: "KRUGER Customizations & Licensing"
  - Section 1: Open Source Components (Stirling PDF, Backend, Frontend, Desktop)
  - Section 2: KRUGER Modifications (Supabase removal, LOCAL hardcoding, no cloud sync, no telemetry)
  - Section 3: License (AGPL-v3 with links to GitHub)
- **Styled**: Using Mantine primitives (Card, Stack, Text, Anchor, Badge, Group)
- **i18n-ready**: All text uses translation keys

### 3. ConfigNavSections Simplification
**File**: `frontend/editor/src/desktop/components/shared/config/configNavSections.tsx`

- **Simplified**: Removed all connection mode detection and SaaS mode handling
- **Now hardcoded to LOCAL mode**: Shows only Preferences + About sections
- **Added**: DesktopLicenseHelp as a new item in the About section
- **Removed imports**: connectionModeService, authService, cloudConfigNavSections

### 4. Type Definition Update
**File**: `frontend/editor/src/core/components/shared/config/types.ts`

- **Added**: "kruger-licensing" to VALID_NAV_KEYS array to support the new license help nav item

## Build Status

- **TypeScript check**: No errors in modified files
  - `AppProviders.tsx` ✓
  - `DesktopLicenseHelp.tsx` ✓
  - `configNavSections.tsx` ✓
  - `types.ts` ✓

- **Pre-existing errors**: 
  - Cloud/SaaS layers have unrelated TypeScript errors (not caused by this change)
  - Desktop layer has pre-existing imports from missing @cloud modules (expected in LOCAL mode)

## Behavior Changes

1. **App Launch**: No connection mode selection on first launch
2. **Settings > About**: Now includes "KRUGER Customizations & License" section
3. **Backend**: Starts automatically on app launch, no Supabase connection attempt
4. **Onboarding**: Welcome slide shown once, no sign-in slide
5. **No telemetry/tracking**: All cloud/SaaS infrastructure removed

## Next Steps

1. Run `task desktop:build:dev:windows` to create MSI
2. Test desktop app launch and settings panel
3. Verify license help component displays correctly
