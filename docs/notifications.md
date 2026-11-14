# Notifications and Push Delivery Architecture (NK-36 — RF-13, RT-09)

This document specifies the internal and push notification pipeline for NutriKids across the API (`apps/api`), mobile client (`apps/mobile`), and shared domain (`packages/shared`).

---

## 1. Subsystem Overview

The notification subsystem delivers in-app and remote alerts to health professionals when clinical risks are detected or when unreviewed risk alerts become overdue.

```text
[ Checkup Saved / Synced ] ──> [ notifyNewAlerts ] ──> [ INSERT notifications ]
                                                              │
                                                  (background push dispatch)
                                                              ▼
                                                   [ Expo Push Service ]
                                                              │ (FCM v1 / APNs)
                                                              ▼
                                                  [ Mobile Device (Native) ]
```

### Key Functional Requirements

- **RF-13 (Alert Notifications):** Immediate notification when a checkup triggers risk alerts (wasting, stunting, underweight, overweight, obesity).
- **RT-09 (Periodic Overdue Escalation):** Automated background detection and escalation when alerts remain unreviewed past their deadline (24 hours for severe cases, 72 hours for moderate cases).

---

## 2. Push Token Lifecycle and Security

### Professional-Only Push Registration

- Only users with the `PROFESSIONAL` role register push notification tokens with the server.
- Caregivers (`CAREGIVER` role) do not receive technical risk push alerts (RF-14). Caregiver communication is managed via plain-language follow-up messages.

### Safe Runtime Guards

- **Web Execution:** When running on web (`Platform.OS === 'web'`), push notification APIs safely no-op.
- **Simulators / Emulators:** Physical devices are required for remote push notifications (`Device.isDevice`). If running inside a simulator, token registration gracefully logs a warning and exits.
- **Sign-Out Sequence:** When a professional signs out, `unregisterPushNotifications()` is invoked **before** clearing local auth tokens from `expo-secure-store`. This ensures the unregister request reaches `DELETE /notifications/devices/:token` with a valid authorization header (`authFetch`).

---

## 3. Remote Push Notifications Setup (Android / FCM / EAS)

### 3.1 Expo Go vs. Development Builds

Starting with Expo SDK 53+, remote push notifications on Android via Firebase Cloud Messaging (FCM) are **not supported in standard Expo Go**. To receive and test real remote push notifications on physical Android devices, you must build a custom development client:

```bash
# 1. Install EAS CLI globally
pnpm add -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Ensure dependencies are installed (expo-dev-client is included in apps/mobile/package.json)
pnpm install

# 4. Initialize EAS project (generates projectId in app.json)
cd apps/mobile
eas init

# 5. Configure build profiles (generates eas.json)
eas build:configure

# 6. Verify that eas.json contains "developmentClient": true and "distribution": "internal"
#    under the "development" build profile:
#    "development": {
#      "developmentClient": true,
#      "distribution": "internal"
#    }

# 7. Create Android development build
eas build --profile development --platform android
```

Alternatively, you can compile locally with Android Studio using `npx expo run:android`.

### 3.2 Firebase Project & `google-services.json`

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Add an Android app with the package name specified in `app.json` (`com.nutrikids.app`).
3. Download `google-services.json` and place it in `apps/mobile/google-services.json`.
4. In `apps/mobile/app.json`, enable the Google Services plugin configuration:
   ```json
   {
     "expo": {
       "android": {
         "package": "com.nutrikids.app",
         "googleServicesFile": "./google-services.json"
       }
     }
   }
   ```
   > Note: Do not configure `googleServicesFile` in `app.json` unless the physical file exists on disk, as EAS/prebuild will fail if the file is missing.

### 3.3 FCM v1 Credentials Configuration in EAS

Expo push servers use the modern Firebase Cloud Messaging API (FCM v1):

1. In the Google Cloud Console, navigate to **IAM & Admin** > **Service Accounts**.
2. Create or select a service account with the **Firebase Cloud Messaging API (V1)** role.
3. Generate and download a private key in JSON format.
4. Upload the service account key to EAS using the interactive CLI:
   ```bash
   eas credentials
   # Select Android -> Select profile -> Set up FCM v1 credentials
   ```

---

## 4. Periodic Overdue Alerts Background Job

The backend executes a scheduled background task (`runOverdueAlertsJob`) configured in `apps/api/src/jobs/overdue-alerts.ts` and started during server bootstrap (`apps/api/src/index.ts`):

- **Startup Delay:** An initial check executes 30 seconds after server boot, preventing cold-start CPU contention while ensuring overdue alerts are not missed.
- **Interval:** Subsequent checks execute every `OVERDUE_ALERTS_INTERVAL_MINUTES` (default: 60 minutes).
- **Anti-Overlap Guard:** If a previous run is still processing when the interval timer fires, execution is skipped to prevent database lock contention.
- **SQL Function:** Queries recipients via the `find_overdue_alert_recipients()` `SECURITY DEFINER` database function, which computes deadlines based on severity (24h severe, 72h standard) and enforces a minimum re-notification quiet period (`OVERDUE_ALERT_RENOTIFY_HOURS`, default: 24h).
- **State Integrity:** Overdue notifications do not mutate `alerts.status`, keeping the alert lifecycle clean and auditable.

---

## 5. Mobile In-App Notifications Screen

The in-app notifications screen (`apps/mobile/src/components/NotificationsScreen.tsx`) provides:

- Top bar with back arrow and "Volver" button styled identically to `add-child.tsx`.
- Automatic refresh on focus using `useFocusEffect` (reloading stale data when returning to the tab/screen).
- Unread status indicator dots and pull-to-refresh (`RefreshControl`).
- Tap-to-read interaction updating `read_at` on the backend (`PATCH /notifications/:id/read`).
- Navigation integration:
  - Caregivers access messages and follow-up guidance via the top-right bell icon on the home screen (`(caregiver)/index.tsx` -> `APP_ROUTES.CAREGIVER.MESSAGES`), since clinical risk alerts are strictly professional (RF-14).
  - Professionals access clinical notifications via the drawer menu (`(professional)/_layout.tsx` -> `APP_ROUTES.PROFESSIONAL.NOTIFICATIONS`).
- Full bilingual localization in Spanish (`es`) and Kichwa (`qu`).

---

## 6. Known Limitations and Architectural Scope Boundaries

The following functional constraints are explicitly scoped for follow-up tickets:

1. **Tap Action and Cold-Start Push Response (Deferred to NK-33):**
   - In this stage, tapping an in-app notification marks the item as read on the backend; it does not open the alert detail screen.
   - Responding to a push notification tap while the app is closed (`Notifications.getLastNotificationResponseAsync()`) and deep-linking into the alert details is deferred to NK-33 (Alert Detail view).
2. **Offline Sign-Out Token State:**
   - If a professional user logs out while the device is offline, `unregisterPushNotifications()` cannot reach the server (`DELETE /notifications/devices/:token`).
   - The device token remains registered in the database until another user signs in on that physical device, or until Expo returns an invalid ticket (`details.error === 'DeviceNotRegistered'`), which the backend cleans up automatically during push dispatch.
3. **EAS Project ID Prerequisite:**
   - `Notifications.getExpoPushTokenAsync()` requires `extra.eas.projectId` in `app.json`.
   - Without running `eas init` to generate this project ID, token registration safely returns `null` and logs a descriptive diagnostic message to the console.
