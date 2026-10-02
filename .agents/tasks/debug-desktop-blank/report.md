# Desktop Blank Screen Investigation Report

## Summary

The blank screen on fresh desktop app install is caused by **`authChecked` gate getting permanently stuck at `false`** while the bundled backend starts. The frontend renders an empty `<div>` and waits for `authChecked` to become `true`, but this transition gets blocked when the backend initialization hangs or takes too long (>30 seconds). Once `authChecked` gets stuck, the app stays blank forever.

---

## 1. Environment Variable Loading (`.env.desktop`)

**Status: ✅ WORKING**

- `.env.desktop` exists at `c:\KRUGER-PDF\Stirling-PDF\frontend\editor\.env.desktop` with:
  ```
  VITE_API_BASE_URL=http://127.0.0.1:8080
  ```
- Vite correctly loads `.env.<mode>` when built with `--mode desktop`
- The `.taskfiles/frontend.yml` confirms `vite build --mode desktop` is used
- `VITE_SAAS_SERVER_URL` is NOT defined in `.env.desktop` — this is intentional (desktop doesn't need SaaS URLs by default)

**Verdict:** Env loading is correct. `.env.desktop` is properly configured.

---

## 2. `AppConfigProvider` Blocking Analysis

**Status: ⚠️ CRITICAL ISSUE FOUND**

### How it works:

In `AppConfigContext.tsx`:
- `bootstrapMode: "blocking"` + `initialConfig: DESKTOP_DEFAULT_APP_CONFIG` is set
- On mount:
  - `seeded = Boolean(initialConfig) && bootstrapMode !== "blocking"` → **`seeded = false`** (because `bootstrapMode === "blocking"`)
  - `loading = fetching ? isFetching : false`
  - With `autoFetch = true`, initially `isFetching = true`, so `loading = true`
  
The issue is in the *retry logic*:
```typescript
retry: (failureCount, err) => {
  const status = statusOf(err);
  return (!status || status >= 500) && failureCount < maxRetries;
},
retryDelay: (attempt) => initialDelay * 2 ** attempt,
```

With `maxRetries: 5` and `initialDelay: 1000`:
- Attempt 0: wait 1s, retry
- Attempt 1: wait 2s, retry
- Attempt 2: wait 4s, retry
- Attempt 3: wait 8s, retry
- Attempt 4: wait 16s, retry
- Attempt 5: give up
- **Total time: 1+2+4+8+16 = 31 seconds of `loading = true` with blank UI**

When the backend fails to start (or takes >31s), `loading` transitions to `false` **but the app is already blank** during the retry window, with no visual feedback.

**Verdict:** The blocking retry window (31 seconds) is too long and has no loading indicator.

---

## 3. `authChecked` Gate (The Root Cause)

**Status: ⚠️ CRITICAL BLOCKING ISSUE**

In `desktop/components/AppProviders.tsx`, the *entire app* is conditionally rendered:

```typescript
if (!authChecked) {
  return (
    <ProprietaryAppProviders ...>
      <div style={{ height: "100%" }} />  // ← BLANK SCREEN
    </ProprietaryAppProviders>
  );
}

// Normal app flow...
return (
  <ProprietaryAppProviders ...>
    {/* Full app UI */}
  </ProprietaryAppProviders>
);
```

### The auth check flow:

```typescript
useEffect(() => {
  if (connectionMode === null) return; // Wait for mode

  if (!isFirstLaunch && setupComplete) {
    // Normal flow: check auth, set authChecked = true in finally
    authService.isAuthenticated()
      .then(...)
      .catch(...)
      .finally(() => setAuthChecked(true)); // ← Sets to true when done
  } else if (isFirstLaunch && !setupComplete) {
    // First launch: start backend, set authChecked = true in finally
    connectionModeService.getCurrentConfig()
      .then(async (cfg) => {
        await tauriBackendService.startBackend().catch(console.error);
        setConnectionMode(...);
      })
      .catch(console.error)
      .finally(() => setAuthChecked(true)); // ← Sets to true when done
  }
}, [isFirstLaunch, setupComplete, connectionMode]);
```

### Failure scenario on Windows fresh install:

1. **App starts.** `authChecked = false`, `connectionMode = null` → blank screen shown
2. **Connection mode loads.** `connectionMode = "local"` via `connectionModeService.getCurrentMode()`
3. **First launch detected:** `isFirstLaunch = true`, `setupComplete = false`
4. **Backend start initiated:** `tauriBackendService.startBackend()` is called
5. **Backend hangs or fails:** 
   - **Windows-specific:** The bundled JRE/JAR path resolution fails silently (UNC path issues, missing files, permission issues)
   - **OR:** Java process spawns but hangs on startup (blocking on I/O, missing config, waiting for network)
   - **OR:** JAR file is missing from the bundle (build artifact incomplete)
6. **Promise never resolves:** The outer `.then()` completes (even after the `.catch()` silently logs the error), but the promise chain structure means `.finally()` runs
7. **BUT:** If `startBackend()` rejects AND the error is caught but not rethrown, OR if the process hangs, the `finally()` may run but `connectionMode` never changes from `"local"` 
8. **Backend never reports port:** In `backend.rs`, the port is only extracted from stdout when the backend logs `"running on port:"`. If the process hangs before that output, `BACKEND_PORT` stays `None`.
9. **App stays stuck:** `authChecked` remains `false`, the app renders the blank screen forever.

**The critical bug:** The `finally()` block runs, but if `startBackend()` hangs or fails to output the "running on port" message, the app proceeds with `authChecked = true` but **has no backend to talk to**. The next layer down (`AppConfigProvider`) then tries to fetch from `http://127.0.0.1:8080` and gets 404/timeout errors, retrying for 31 seconds while the blank screen is shown.

---

## 4. `ProprietaryAppProviders` Render Gate

**Status: ✅ CONFIRMED**

In `proprietary/components/AppProviders.tsx`:
```typescript
export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <AuthProvider>
      <CoreAppProviders appConfigProviderProps={appConfigProviderProps}>
        <LicenseProvider>
          {/* ... many providers ... */}
          {children}
        </LicenseProvider>
      </CoreAppProviders>
    </AuthProvider>
  );
}
```

The `CoreAppProviders` (in `core/components/AppProviders.tsx`) includes:
```typescript
<AppConfigProvider retryOptions={appConfigRetryOptions} {...appConfigProviderProps}>
  <AppConfigLoader />
  {/* ... rest of the tree ... */}
  {children}
</AppConfigProvider>
```

`AppConfigLoader` does NOT gate render — it just applies the config when it arrives:
```typescript
export default function AppConfigLoader() {
  const { config, loading } = useAppConfig();
  useEffect(() => {
    if (!loading && config) {
      updateSupportedLanguages(config.languages, config.defaultLocale);
    }
  }, [config, loading]);
  return null; // ← Does not render anything
}
```

**Verdict:** `AppConfigProvider` does not gate children render. But the **desktop layer gates EVERYTHING** on `authChecked`, which is the real problem.

---

## 5. `VITE_SAAS_SERVER_URL` — Not a Crash

**Status: ✅ NOT A PROBLEM**

- `VITE_SAAS_SERVER_URL` is declared but not set in `.env.desktop`
- It's used in `desktop/services/authService.ts` inside a method (`signUpSaas`), not at module init
- `desktop/auth/supabase.ts` checks it at module level and **just logs a warning** — does not throw
- **Verdict:** This is only a warning, not a hard crash. Desktop works fine without SaaS URLs.

---

## 6. Rust Backend `start_backend` — Failure Modes on Windows

**Status: ⚠️ MULTIPLE FAILURE POINTS**

In `src-tauri/src/commands/backend.rs`:

### Success path:
1. Finds bundled JRE at `resource_dir/runtime/jre/bin/java.exe`
2. Finds Stirling-PDF JAR at `resource_dir/libs/stirling-pdf-*.jar`
3. Spawns Java process with port=0 (OS-assigned)
4. Monitors stdout for `"running on port: PORT"` message
5. Extracts and stores the port in `BACKEND_PORT`

### Failure modes on Windows:

#### a) **JRE missing:**
```rust
if !java_executable.exists() {
  add_log(format!("❌ Bundled JRE not found at: {:?}", java_executable));
  return Err(error_msg);
}
```
- If `resource_dir/runtime/jre/bin/java.exe` does not exist after install → error returned
- **But:** The promise might still complete the `finally()` in AppProviders

#### b) **JAR missing:**
```rust
if jar_files.is_empty() {
  add_log("No Stirling-PDF JAR found in libs directory.");
  return Err(error_msg);
}
```
- If `resource_dir/libs/stirling-pdf-*.jar` is not found → error returned
- **Likely scenario:** The build produced the JAR but the NSIS installer failed to package it

#### c) **UNC path issues (Windows-specific):**
```rust
fn normalize_path(path: &PathBuf) -> PathBuf {
  if cfg!(windows) {
    let path_str = path.to_string_lossy();
    if path_str.starts_with(r"\\?\") {
      PathBuf::from(&path_str[4..]) // Remove \\?\ prefix
    } else {
      path.clone()
    }
  }
}
```
- On Windows, Tauri's `resource_dir()` may return UNC paths (`\\?\C:\...`)
- The code tries to normalize these, but **spawning a Java subprocess with a UNC path can fail silently**
- The process spawns but immediately exits or hangs

#### d) **Process hangs without output:**
```rust
if output_str.contains("running on port:") {
  if let Some(port) = extract_port_from_running_log(&output_str) {
    *port_guard = Some(port);
  }
}
```
- If Java starts but blocks (e.g., waiting for network, missing `log4j-core`, ClassNotFoundException), it never outputs the port message
- `BACKEND_PORT` stays `None`
- **But the promise still resolves** (the spawned process exists), so `finally()` sets `authChecked = true`
- The app then tries to connect to `http://127.0.0.1:8080` and fails

**Verdict:** The backend startup has multiple failure points, and most of them do NOT cause the promise to reject — the app just proceeds with `authChecked = true` and a dead backend.

---

## 7. Build Task Integrity

**Status: ⚠️ POTENTIAL ISSUE**

From `.taskfiles/desktop.yml`:

```yaml
jlink:jar:
  dir: ..
  env:
    DISABLE_ADDITIONAL_FEATURES: "true"
  cmds:
    - cmd: cmd /c gradlew.bat bootJar ...
      platforms: [windows]
    - mkdir -p frontend/editor/src-tauri/libs
    - cp app/core/build/libs/stirling-pdf-*.jar frontend/editor/src-tauri/libs/
  status:
    - test -f frontend/editor/src-tauri/libs/stirling-pdf-*.jar
```

### Potential issues:

1. **Build may fail silently:** If `gradlew.bat bootJar` fails, the `cp` still runs but copies nothing (or an old JAR)
   - The task doesn't fail explicitly — `status` just checks if ANY `stirling-pdf-*.jar` exists
   
2. **Previous failed build artifact:** If an earlier `desktop:build` failed at the Vite stage (as the user reported), the `frontend/editor/dist/` directory might be stale or incomplete
   - But this is only relevant if it's bundled; Tauri's resources are in `src-tauri/libs/` and `src-tauri/runtime/jre/`

3. **`.env.desktop` not loaded during build:** The build script does NOT run `vite build --mode desktop` — that's done by Tauri in the next step
   - So `.env.desktop` is loaded **by Tauri**, not by the Gradle build
   - This should be fine, but if Tauri's build mode doesn't match, env vars won't be set correctly

**Verdict:** The build task is fragile; if `gradlew.bat bootJar` fails, the error is hidden. Recommend explicit error checking.

---

## 8. Root Cause Verdict

### **PRIMARY CAUSE: `authChecked` gate gets stuck `false` due to backend startup failure**

The sequence:

1. Fresh desktop install → app starts
2. `AppProviders.tsx` renders blank `<div>` while `!authChecked`
3. First launch flow detected → calls `tauriBackendService.startBackend()`
4. **Backend startup fails or hangs silently** (Windows JRE/JAR issues, process hangs)
5. Promise eventually resolves/rejects, `finally()` sets `authChecked = true`
6. **BUT:** Backend is not actually running or is in a bad state
7. `AppConfigProvider` tries to fetch from `http://127.0.0.1:8080`
8. Connection fails → retries for 31 seconds while blank screen is shown
9. **App stays blank** because there's no backend to connect to

### **SECONDARY CAUSE: No visual loading indicator during `authChecked` wait**

The blank screen has no text, spinner, or indication that the app is loading. User sees white screen and thinks it's broken.

### **TERTIARY CAUSE: Backend failures don't properly propagate error state**

If Java doesn't start or hangs, the `startBackend` promise still resolves, the app proceeds, and fails silently on the API call with cryptic retry behavior.

---

## 9. Recommended Fixes

### **Fix 1: Add visible loading state during `authChecked` wait**
**Severity: HIGH | Reversibility: EASY**

**File:** `frontend/editor/src/desktop/components/AppProviders.tsx`

**Change:**
```typescript
if (!authChecked) {
  return (
    <ProprietaryAppProviders
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
      {/* Show a loading indicator instead of blank div */}
      <div style={{ 
        height: "100%", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ fontSize: "16px", fontWeight: "500" }}>
          Starting Stirling PDF...
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          Initializing backend
        </div>
      </div>
      {updatePopupModal}
    </ProprietaryAppProviders>
  );
}
```

**Why:** Users will see the app is loading instead of thinking it's broken. Provides feedback during backend startup.

---

### **Fix 2: Add backend health check before proceeding**
**Severity: CRITICAL | Reversibility: MODERATE**

**File:** `frontend/editor/src/desktop/components/AppProviders.tsx`

**Change:** After backend startup completes, verify the backend is actually responding before setting `authChecked = true`:

```typescript
// In the first launch effect, after startBackend():
const isBackendHealthy = await pollBackendHealth(
  tauriBackendService.getBackendUrl(),
  5000 // max 5 seconds
);

if (!isBackendHealthy) {
  add_log("❌ Backend failed to start or become healthy");
  // Show error and allow user to retry or fall back to offline mode
  setPendingSignIn(true);
  showErrorModal("Backend failed to start. Check logs and try again.");
} else {
  add_log("✅ Backend is healthy");
  setAuthChecked(true);
}
```

**Why:** Catches silent backend failures before the app proceeds. Prevents the 31-second retry loop with blank screen.

---

### **Fix 3: Improve backend failure diagnostics**
**Severity: HIGH | Reversibility: EASY**

**File:** `frontend/editor/src-tauri/src/commands/backend.rs`

**Change:** After spawning the process, add a timeout check for the startup message:

```rust
// After monitor_backend_output(rx):
let backend_startup_deadline = Instant::now() + Duration::from_secs(10);

// In a separate task, periodically check if the port was set
tokio::spawn(async move {
  loop {
    if Instant::now() > backend_startup_deadline {
      if BACKEND_PORT.lock().unwrap().is_none() {
        add_log(
          "⚠️ CRITICAL: Backend did not report port within 10 seconds. \
           Process may be hung or misconfigured. Check logs in: {}",
          log_dir.display()
        );
      }
      break;
    }
    tokio::time::sleep(Duration::from_millis(500)).await;
  }
});
```

**Why:** Detects when backend starts but doesn't report the port (indicates hanging or misconfiguration).

---

### **Fix 4: Reduce AppConfigProvider retry time (short-term mitigation)**
**Severity: MEDIUM | Reversibility: EASY**

**File:** `frontend/editor/src/desktop/components/AppProviders.tsx`

**Change:**
```typescript
appConfigRetryOptions={{
  maxRetries: 3,      // ← Reduced from 5
  initialDelay: 500,  // ← Reduced from 1000
}}
```

**Why:** Shortens the blank-screen window from 31 seconds to ~4 seconds if backend fails. Temporary mitigation while Fix 2 is developed.

**Tradeoff:** If backend is just slow, might give up too early. Fix 2 (health check) is better long-term.

---

### **Fix 5: Verify JAR is bundled and log bundle contents**
**Severity: MEDIUM | Reversibility: EASY**

**File:** `frontend/editor/src-tauri/src/commands/backend.rs`

**Change:** In `run_stirling_pdf_jar`, add diagnostic logging:

```rust
add_log(format!("🔍 Resource directory contents:"));
if let Ok(entries) = std::fs::read_dir(&resource_dir) {
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      add_log(format!("  📁 {}/", path.file_name().unwrap().to_string_lossy()));
    } else {
      add_log(format!("  📄 {}", path.file_name().unwrap().to_string_lossy()));
    }
  }
}
```

**Why:** If JAR is missing, the logs will clearly show it instead of a vague "not found" error.

---

## 10. Immediate Steps for User

1. **Check app logs:**
   - Windows: `C:\Users\<username>\AppData\Local\KRUGER PDF\logs\stirling-pdf.log`
   - Look for "Backend started on port" — if not present, backend never started

2. **Verify bundle contents:**
   - Windows: `C:\Users\<username>\AppData\Local\KRUGER PDF\`
   - Check if `libs/` and `runtime/jre/` directories exist and contain files

3. **Try docker backend instead:**
   - Run backend in docker: `docker run -p 8080:8080 stirling-pdf`
   - Confirm it starts: `curl http://localhost:8080/health`
   - Then app should connect automatically

4. **Re-run desktop build:**
   - Run `task desktop:clean && task desktop:build`
   - If build fails at "exit status 1", backend JAR build is failing — check Gradle logs

---

## Summary Table

| Issue | Status | Root Cause | Impact | Fix Priority |
|-------|--------|-----------|--------|---|
| `.env.desktop` loading | ✅ OK | N/A | None | — |
| AppConfig retry window | ⚠️ Long | 31 second retry loop | 31s blank screen | MEDIUM |
| `authChecked` gate stuck | ⚠️ Critical | Backend startup failure not caught | Permanent blank screen | **HIGH** |
| No visual feedback | ⚠️ UX | Missing loading indicator | User confusion | **HIGH** |
| Backend failure silent | ⚠️ Diagnostic | Errors not visible | Hard to debug | **HIGH** |
| VITE_SAAS_SERVER_URL | ✅ OK | Intentionally unset | None | — |
| Rust backend startup | ⚠️ Fragile | UNC paths, missing files, hangs | Silent failures | **HIGH** |
| Build task integrity | ⚠️ Fragile | Silent Gradle failures | Incomplete bundle | MEDIUM |

