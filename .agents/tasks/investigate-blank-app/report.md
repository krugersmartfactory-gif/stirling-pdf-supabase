# Báo cáo điều tra: App mở lên trắng không có dữ liệu

## Tóm tắt root cause

App Stirling-PDF khi build thành Desktop (Tauri) mở lên trắng vì **frontend khởi động trước khi backend có sẵn**. Frontend gọi API để load dữ liệu (config, tools, UI) nhưng backend chưa có baseURL hoặc chưa khởi động, nên tất cả API calls thất bại, app render trắng. Backend khởi động trong background async nhưng frontend không chờ.

## Frontend Initialization Flow

1. **Entry Point** (`frontend/editor/index.html` + `frontend/editor/src/index.tsx`):
   - HTML load script `src/index.tsx` via `<script type="module" src="src/index.tsx"></script>`
   - React mount ngay lập tức, không chờ gì

2. **App Render Flow** (src/index.tsx → App.tsx → AppProviders):
   - `BrowserRouter` khởi tạo routing
   - `App` component render (src/core/App.tsx)
   - `AppProviders` (Proprietary → Desktop override):
     - **Line 151 (desktop/AppProviders.tsx)**: `if (!authChecked) { return <ProprietaryAppProviders ... > }` 
     - Lúc này `authChecked = false` vì `useEffect(() => { ... setAuthChecked(true) })` vẫn đang chạy async
     - App hiển thị loading screen

3. **Backend Startup** (desktop/AppProviders.tsx):
   - **Line 160**: `useEffect(() => { ... if (connectionMode === "local") { tauriBackendService.startBackend() } })`
   - Backend được khởi động **AFTER** connectionMode được set
   - connectionMode chỉ được set **AFTER** `connectionModeService.getCurrentMode()` resolve (line 101)
   - Này là async call → backend khởi động늦 (delayed)

4. **AppConfig Load** (core/contexts/AppConfigContext.tsx):
   - AppConfigProvider gọi `fetchAppConfig()` = `apiClient.get("/api/v1/config/app-config")`
   - apiClient lấy baseURL từ `getApiBaseUrl()` (desktop/services/apiClientConfig.ts)
   - **Desktop mode**: baseURL = `import.meta.env.VITE_API_BASE_URL` (fallback '/')
   - '/' = relative path → browser sẽ request `http://localhost:5173/api/v1/config/app-config` (vite dev port!)
   - Backend chạy ở `http://127.0.0.1:<random-port>`, không phải 5173
   - **API call thất bại → CONFIG lỗi → UI trắng**

5. **Homepage Render** (core/pages/HomePage.tsx):
   - HomePage dùng AppConfig, FileContext, useAppConfig() hook
   - Nếu config load thất bại → state undefined → UI không render nên trắng

## Backend Connection Check

### Build-Time Config:
- **File**: `frontend/editor/.env.desktop` (commit)
- **Variable**: `VITE_API_BASE_URL` (không tìm thấy file này)
- Mặc định: không định nghĩa = fallback '/'

### Runtime Config:
- **Desktop mode** (Tauri):
  - `getApiBaseUrl()` → returns `import.meta.env.VITE_API_BASE_URL` hoặc fallback to `/`
  - **BUG**: fallback '/' là relative URL, không phải full URL với port
  - **Expected**: fallback phải là `http://127.0.0.1:port` 

- **Backend URL Discovery**:
  - `tauriBackendService.ts` gọi `invoke("start_backend")` (Rust side)
  - Rust side start backend trên random available port
  - Frontend poll `invoke("get_backend_port")` để get port
  - `getBackendUrl()` = `http://127.0.0.1:{port}`
  - **Nhưng**: frontend không dùng `getBackendUrl()` để set apiClient baseURL!

### CORS/Proxy:
- Vite config (vite.config.ts, line 293): 
  ```typescript
  proxy: backendProxyConfig // Only if not desktop mode
  ```
- Desktop mode: `proxy: undefined` → không proxy
- Desktop mũi tiêm manual call tới backend port nhưng **apiClient không biết port**

## Desktop/Installer Build Configuration

### Build Process:
1. **Vite build** (vite.config.ts):
   - Mode detection: `STIRLING_FLAVOR` env var → mode = "desktop"
   - `tsconfig.desktop.vite.json` → resolve `@app/*` → desktop layer first
   - Output: `dist/` folder
   - Base: `./` (relative)

2. **Tauri package** (src-tauri/tauri.conf.json):
   - Rust config cho Tauri app
   - Frontend static files từ `dist/` được bundle
   - **Vite config dùng `/` fallback** → mất port info

### Asset Bundling:
- Static assets (pdfium.wasm, fonts, images) copy từ `vite-plugin-static-copy`
- JS/CSS minified bằng Rollup
- Files được bundle vào `.app` (macOS), `.exe` (Windows), hoặc `.deb` (Linux)

### Tauri Backend Initialization:
- `src-tauri/src/main.rs`:
  - Khởi tạo Tauri window
  - Gọi `start_backend()` command → spawn Java backend process
  - Backend start trên port từ environment hoặc random
  - **Frontend không được báo port này**

## Các vấn đề phát hiện

### 1. **Missing: `.env.desktop` file**
- **File**: `frontend/editor/.env.desktop` (không tồn tại)
- **Issue**: `VITE_API_BASE_URL` không định nghĩa → fallback `/` 
- **Impact**: Frontend request API tới vite dev port (5173) thay vì backend port
- **Ref**: `frontend/editor/src/desktop/services/apiClientConfig.ts:15`

### 2. **apiClient baseURL không được update khi backend ready**
- **File**: `frontend/editor/src/desktop/services/apiClient.ts`
- **Issue**: apiClient lấy baseURL từ `getApiBaseUrl()` chỉ một lần lúc khởi tạo
- **Problem**: Backend port có sẵn sau này, nhưng apiClient không được update
- **Impact**: Tất cả API calls vẫn dùng baseURL cũ (/) → 404 hoặc connect tới sai port
- **Missing**: Interceptor để update baseURL khi backend healthy

### 3. **Backend startup bị delay**
- **File**: `frontend/editor/src/desktop/components/AppProviders.tsx:130-150`
- **Issue**: 
  ```typescript
  // Line 101-103: Load connection mode (async)
  void connectionModeService.getCurrentMode().then((mode) => {
    setConnectionMode(mode); // Trigger useEffect line 160
  });
  
  // Line 160-180: Start backend AFTER connectionMode set
  useEffect(() => {
    if (connectionMode === null) return; // Chờ cho mode load xong
    // Chỉ khi đó backend mới start
    await tauriBackendService.startBackend();
  }, [connectionMode]);
  ```
- **Problem**: AppProviders render → AppConfigProvider fetch config → fail → UI trắng (tất cả trước khi backend start)
- **Sequence**: 
  1. App mount
  2. AppProviders render (loading = true)
  3. AppConfigProvider fetch config from `/` → fail
  4. Loading = false + error
  5. Homepage render empty
  6. THEN: backend start hoàn thành (quá muộn!)

### 4. **AppConfigProvider bootstrap mode là "non-blocking"**
- **File**: `frontend/editor/src/desktop/components/AppProviders.tsx:267-269`
- **Code**:
  ```typescript
  appConfigProviderProps={{
    bootstrapMode: "non-blocking", // ← vấn đề
    autoFetch: false,
  }}
  ```
- **Issue**: "non-blocking" = AppConfigProvider không chờ fetch config, render ngay → UI trắng nếu config thất bại
- **Better**: "blocking" mode sẽ chờ backend ready trước render

### 5. **autoFetch: false nhưng không có fallback startup trigger**
- **File**: `frontend/editor/src/desktop/components/AppProviders.tsx:268`
- **Issue**: `autoFetch: false` → AppConfigProvider không tự fetch config
- **Missing**: Component nào phải trigger fetch config khi backend ready?
- **Result**: Config không bao giờ được load

### 6. **Desktop mode sử dụng operationRouter thay vì direct apiClient calls**
- **File**: `frontend/editor/src/desktop/services/operationRouter.ts`
- **Context**: operationRouter là để route API calls tới server mode vs local mode
- **Issue**: AppConfigProvider dùng `apiClient.get()` trực tiếp, không dùng operationRouter
- **Problem**: AppConfig là core setup, phải load trước operationRouter có thể hoạt động
- **Chicken-egg problem**: operationRouter phụ thuộc vào appConfig nhưng appConfig phụ thuộc vào backend ready

## Recommended Fixes

### Fix 1: Tạo `.env.desktop` với hardcoded base URL (TÀM)
**Priority: URGENT**
**File**: Create `frontend/editor/.env.desktop`
```
VITE_API_BASE_URL=http://127.0.0.1:8080
```
**Reasoning**: 
- Backend mặc định chạy port 8080 khi không override
- Tạm thời fix: frontend sẽ request tới 8080 thay vì 5173
- **Limitation**: Nếu port thay đổi, phải rebuild app
- **Test**: Build desktop app, check Network tab xem API calls go tới port 8080

### Fix 2: Implement dynamic baseURL update (PROPER)
**Priority: HIGH**
**Files to modify**: 
- `frontend/editor/src/desktop/services/apiClient.ts`
- `frontend/editor/src/desktop/services/apiClientSetup.ts`

**Implementation**:
1. Add interceptor để monitor `tauriBackendService.getBackendUrl()`
2. Khi backend port available, update apiClient instance:
   ```typescript
   const updateBaseUrlWhenBackendReady = () => {
     const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
       if (status === 'healthy') {
         const url = tauriBackendService.getBackendUrl();
         if (url && apiClient.defaults.baseURL !== url) {
           apiClient.defaults.baseURL = url;
         }
       }
     });
   };
   ```
3. Call này trong `setupApiInterceptors()` 

### Fix 3: Start backend earlier + use blocking bootstrap
**Priority: HIGH**
**File**: `frontend/editor/src/desktop/components/AppProviders.tsx`

**Changes**:
1. Move backend start outside of connectionMode useEffect
   ```typescript
   // On app mount, start backend immediately (don't wait for connectionMode)
   useEffect(() => {
     if (isFirstLaunch || !setupComplete) return;
     void tauriBackendService.startBackend().catch(console.error);
   }, []);
   ```

2. Change bootstrap mode to "blocking":
   ```typescript
   appConfigProviderProps={{
     bootstrapMode: "blocking", // ← change this
     autoFetch: false,
   }}
   ```
   OR enable autoFetch:
   ```typescript
   appConfigProviderProps={{
     bootstrapMode: "non-blocking",
     autoFetch: true, // ← enable this
   }}
   ```

3. Rationale:
   - Backend start immediately, port discovered quickly
   - AppConfigProvider waits for config fetch
   - Homepage only render khi config ready
   - No blank screen

### Fix 4: Add retry logic + health check gating
**Priority: MEDIUM**
**File**: New file `frontend/editor/src/desktop/components/AppConfigBootstrapGate.tsx`

**Purpose**: Gate AppConfigProvider behind backend health check
```typescript
export function AppConfigBootstrapGate({ children }: { children: React.ReactNode }) {
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      setBackendReady(status === 'healthy');
    });
    return unsubscribe;
  }, []);

  if (!backendReady) {
    return <div>Backend starting...</div>;
  }

  return children;
}
```

Then wrap AppProviders:
```typescript
<AppConfigBootstrapGate>
  <ProprietaryAppProviders ...>
    {children}
  </ProprietaryAppProviders>
</AppConfigBootstrapGate>
```

### Fix 5: Pass tauriBackendService.getBackendUrl() to AppConfigProvider
**Priority: MEDIUM**
**File**: `frontend/editor/src/desktop/components/AppProviders.tsx`

**Purpose**: Explicitly give AppConfigProvider the backend URL
```typescript
<ProprietaryAppProviders
  appConfigProviderProps={{
    // Add custom fetch that uses backend URL when available
    customFetch: async () => {
      const baseUrl = tauriBackendService.getBackendUrl() || '/';
      return fetch(`${baseUrl}/api/v1/config/app-config`);
    }
  }}
>
```

## Cách debug thêm

### 1. Check Network Traffic
- Open DevTools (F12 trong Tauri)
- Network tab
- Load app, xem API calls fail ở đâu
- Check request URL: là `/api/...` hay `http://127.0.0.1:xxxx/api/...`?
- Check response: 404, 0 (connection refused), hoặc timeout?

### 2. Check Backend Port
- App running
- Check console (F12)
- Tìm log: `[TauriBackendService] Backend port: 8080` (hoặc port nào)
- Nếu không thấy, backend chưa discover port

### 3. Check apiClient baseURL
- DevTools console:
  ```javascript
  // Nếu apiClient exportable (nếu không thì skip)
  console.log(apiClient.defaults.baseURL)
  ```
- Expect: `http://127.0.0.1:8080` (hoặc backend port)
- If `/` hoặc empty → vấn đề confirm

### 4. Check Desktop App Files
- App built vào: `src-tauri/target/release/bundle/`
  - Windows: `.exe` installer hoặc portable
  - macOS: `.app` bundle
  - Linux: `.deb`, `.appimage`
- Unpack / check static files (không phải binary, nhưng `resources/` hoặc bundle)
- Verify `.env.desktop` settings baked into build

### 5. Monitor Backend Startup
- Check Java backend logs (nếu có)
- Backend start command: `java -jar ...`
- Look for: `Server started on port xxxx`
- Sau bao lâu port available? (should be < 10 sec)

## Summary Thực Hành (Quick Start)

**Quick fix (1 phút)**:
1. Create `frontend/editor/.env.desktop`:
   ```
   VITE_API_BASE_URL=http://127.0.0.1:8080
   ```
2. Rebuild desktop app: `task desktop:build`
3. Test: mở app, check Network tab

**Proper fix (1-2 giờ)**:
1. Implement dynamic baseURL update (Fix 2)
2. Start backend earlier (Fix 3, part 1)
3. Enable autoFetch or use blocking mode (Fix 3, part 2)
4. Test: mở app, verify config loads before HomePage renders

**Long-term** (optional):
- Implement health check gating (Fix 4)
- Add better error UI khi backend fail start
- Document Tauri desktop build process
