import { ReactNode, useEffect, useState } from "react";
import { AppProviders as CoreAppProviders } from "@core/components/AppProviders";
import { DesktopConfigSync } from "@app/components/DesktopConfigSync";
import { DesktopQueryCacheReset } from "@app/components/DesktopQueryCacheReset";
import { DesktopBannerInitializer } from "@app/components/DesktopBannerInitializer";
import { SaveShortcutListener } from "@app/components/SaveShortcutListener";
import { LocalProcessingFolders } from "@app/components/LocalProcessingFolders";
import { DiskConflictHost } from "@app/components/shared/DiskConflictHost";
import { DesktopOnboardingModal } from "@app/components/DesktopOnboardingModal";
import { DESKTOP_DEFAULT_APP_CONFIG } from "@app/config/defaultAppConfig";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import UpdateModal from "@core/components/shared/UpdateModal";
import { useDesktopUpdatePopup } from "@app/hooks/useDesktopUpdatePopup";

// Common tool endpoints to preload for faster first-use
const COMMON_TOOL_ENDPOINTS = [
  "/api/v1/misc/compress-pdf",
  "/api/v1/general/merge-pdfs",
  "/api/v1/general/split-pages",
  "/api/v1/convert/pdf/img",
  "/api/v1/convert/img/pdf",
  "/api/v1/general/rotate-pdf",
  "/api/v1/misc/add-watermark",
  "/api/v1/security/add-password",
  "/api/v1/security/remove-password",
  "/api/v1/general/extract-pages",
];

/**
 * Desktop application providers
 * Hardcoded LOCAL mode only: no SaaS, no auth switching, no connection-mode logic.
 * Wraps CoreAppProviders with desktop-specific initialization.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [backendReady, setBackendReady] = useState(false);
  const updatePopup = useDesktopUpdatePopup();

  // Prevent drag-drop file navigation (Linux WebKit renders PDF fullscreen and orphans UI)
  useEffect(() => {
    const preventNavigation = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", preventNavigation);
    window.addEventListener("drop", preventNavigation);
    return () => {
      window.removeEventListener("dragover", preventNavigation);
      window.removeEventListener("drop", preventNavigation);
    };
  }, []);

  // Start backend on mount and wait until healthy
  useEffect(() => {
    const startBackend = async () => {
      try {
        await tauriBackendService.startBackend();
        // Subscribe to status and wait for healthy
        const unsubscribe = tauriBackendService.subscribeToStatus(
          (status) => {
            if (status === "healthy") {
              setBackendReady(true);
              unsubscribe();
            }
          },
        );
        // Set a timeout to avoid infinite loading if backend fails
        const timeout = setTimeout(() => {
          console.error(
            "[AppProviders] Backend did not become healthy within timeout",
          );
          setBackendReady(true);
          unsubscribe();
        }, 15000);
        return () => clearTimeout(timeout);
      } catch (err) {
        console.error("[AppProviders] Failed to start backend:", err);
        // Always mark ready to avoid infinite loading, even if startup failed
        setBackendReady(true);
      }
    };

    const cleanup = startBackend();
    return () => {
      cleanup.then((c) => c?.());
    };
  }, []);

  // Preload endpoint availability once backend is healthy
  useEffect(() => {
    if (!backendReady) return;

    const backendUrl = tauriBackendService.getBackendUrl();
    if (!backendUrl) {
      console.debug(
        "[AppProviders] Backend URL not available yet, skipping endpoint preload",
      );
      return;
    }

    if (!tauriBackendService.isOnline) {
      console.debug(
        "[AppProviders] Backend not online yet, will retry on next status change",
      );
      // Subscribe to status changes and retry preload when backend comes online
      const unsubscribe = tauriBackendService.subscribeToStatus(() => {
        if (tauriBackendService.isOnline) {
          console.debug(
            "[AppProviders] Preloading common tool endpoints for local backend",
          );
          void endpointAvailabilityService.preloadEndpoints(
            COMMON_TOOL_ENDPOINTS,
            backendUrl,
          );
          unsubscribe();
        }
      });
      return unsubscribe;
    }

    console.debug(
      "[AppProviders] Preloading common tool endpoints for local backend",
    );
    void endpointAvailabilityService.preloadEndpoints(
      COMMON_TOOL_ENDPOINTS,
      backendUrl,
    );
  }, [backendReady]);

  // Show and focus window once backend is ready
  useEffect(() => {
    if (!backendReady) return;
    if (!isTauri()) return;

    const currentWindow = getCurrentWindow();
    currentWindow
      .show()
      .then(() => currentWindow.unminimize().catch(() => {}))
      .then(() => currentWindow.setFocus().catch(() => {}))
      .then(() => currentWindow.requestUserAttention(1).catch(() => {}))
      .catch(() => {});
  }, [backendReady]);

  const { state: popupState, actions: popupActions } = updatePopup;
  const updatePopupModal = popupState.updateSummary && (
    <UpdateModal
      opened={popupState.showModal}
      onClose={popupActions.dismissModal}
      onRemindLater={popupActions.remindLater}
      currentVersion={popupState.currentVersion}
      updateSummary={popupState.updateSummary}
      machineInfo={{
        machineType: navigator.platform?.toLowerCase().includes("mac")
          ? "Client-mac"
          : navigator.platform?.toLowerCase().includes("linux")
            ? "Client-unix"
            : "Client-win",
        activeSecurity: false,
        licenseType: "NORMAL",
      }}
      desktopInstall={
        popupState.tauriInstallReady
          ? {
              state: popupState.state,
              progress: popupState.progress,
              errorMessage: popupState.errorMessage,
              canInstall: popupState.canInstall,
              actions: popupActions,
            }
          : undefined
      }
    />
  );

  if (!backendReady) {
    return (
      <CoreAppProviders
        appConfigRetryOptions={{
          maxRetries: 3,
          initialDelay: 500,
        }}
        appConfigProviderProps={{
          initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
          bootstrapMode: "blocking",
          autoFetch: true,
        }}
      >
        <DesktopQueryCacheReset />
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "16px",
            backgroundColor: "#ffffff",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: "500", color: "#333" }}>
            Starting Stirling PDF...
          </div>
          <div style={{ fontSize: "12px", color: "#999" }}>
            Initializing backend
          </div>
        </div>
        {updatePopupModal}
      </CoreAppProviders>
    );
  }

  return (
    <CoreAppProviders
      appConfigRetryOptions={{
        maxRetries: 5,
        initialDelay: 1000,
      }}
      appConfigProviderProps={{
        initialConfig: DESKTOP_DEFAULT_APP_CONFIG,
        bootstrapMode: "blocking",
        autoFetch: true,
      }}
    >
      <DesktopQueryCacheReset />
      <DesktopConfigSync />
      <DesktopBannerInitializer />
      <SaveShortcutListener />
      <LocalProcessingFolders />
      <DiskConflictHost />
      {children}
      <DesktopOnboardingModal />
      {updatePopupModal}
    </CoreAppProviders>
  );
}
