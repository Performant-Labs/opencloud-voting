# Security Assessment: OpenCloud Feature Voting Module

**Date:** March 29, 2026
**Scope:** `opencloud-voting` (Web extension module, Vue 3, OpenCloud WebDAV API integration)

## Executive Summary

The OpenCloud Feature Voting module utilizes a purely client-side architecture that interacts directly with a single shared file (`feature-votes.json`) via the OpenCloud WebDAV API. While this design minimizes infrastructure complexity by eliminating the need for a dedicated backend service, it fundamentally violates secure architectural principles: **all business logic, authorization, and data validation are enforced exclusively on the client-side.**

Because users have write access to the WebDAV shared project space, any authenticated user can bypass the Vue.js frontend and interact directly with the WebDAV API to manipulate the JSON file. This results in critical vulnerabilities including data tampering, unauthorized deletions, and denial-of-service (DoS) risks.

On the other hand, the application correctly handles some aspects of security by leveraging Vue's built-in protections against DOM-based attacks.

---

## 🛡️ Secure Aspects (What is working well)

### 1. Robust Mitigation Against Cross-Site Scripting (XSS)
- **Finding:** The application safely renders user inputs (feature titles and descriptions).
- **Details:** The `createFeature` function applies a regex (`title.replace(/<[^>]*>/g, '')`) to strip HTML tags before saving data to `feature-votes.json`. More importantly, the `App.vue` component renders these fields using double-mustache interpolation (e.g., `{{ feature.title }}`). Because Vue automatically HTML-escapes content rendered this way and refrains from using the dangerous `v-html` directive anywhere in the module, the application is highly resilient to XSS attacks—even if an attacker directly injects malicious payload streams via the WebDAV API.

### 2. Validated API Authentication via OIDC
- **Finding:** Access to the `feature-votes.json` file is securely gated behind OpenCloud's backend.
- **Details:** The frontend extracts the user ID from the JWT access token without verifying its cryptographic signature client-side. This is secure in this context, as the token is only evaluated locally for display purposes (e.g., identifying whether the current session matches the `feature.userId`). The actual backend OpenCloud WebDAV space (`/dav/spaces/{spaceId}/...`) securely validates the token signature when a request is made. A user cannot grant themselves unauthorized WebDAV access by forging a token locally.

### 3. Prevention of Accidental Race Conditions
- **Finding:** The application correctly uses `ETag` tracking.
- **Details:** The integration of the `If-Match: <ETag>` header via optimistic concurrency effectively safeguards against benign, concurrent data overwrites from well-intentioned users saving the document at the exact same moment.

---

## ⚠️ Critical Vulnerabilities (Where hardening is required)

### 1. [CRITICAL] Broken Access Control & Privilege Escalation
- **Description:** Because authorization is evaluated entirely on the client, the backend only checks raw file permissions. Any user who can load the application must possess `PUT` (write) access to the `feature-votes.json` file on the project space. 
- **Impact:** An attacker can bypass the frontend UI and make direct WebDAV `PUT` HTTP requests. By modifying the raw JSON document, they can:
  - **Forge Votes:** Add hundreds of votes to a feature using arbitrarily fabricated `userId`s, or remove legitimate votes.
  - **Impersonate Users:** Set the `userId` strings on newly created features to match other users (e.g., `admin`).
  - **Unauthorized Deletions:** In `deleteFeature`, the client UI uses the check `if (feature.userId !== userId)` to prevent a user from clicking "Delete" on another user's feature. However, an attacker can simply download `feature-votes.json`, delete the object of another user, and upload the altered file.
  - **Data Destruction:** An attacker could delete the entire `.feature-voting/feature-votes.json` file entirely if they wished to clear all votes and feature requests.

### 2. [HIGH] Denial of Service (DoS) via Payload Inflation
- **Description:** The system lacks API-level input validation on file sizes, payload schema, or rate limits.
- **Impact:** An attacker can upload a 100MB+ `feature-votes.json` file containing infinite fake feature nodes. When legitimate users attempt to access the "Feature Voting" page, their browsers will fetch the gigantic file, parse it into memory, and attempt to render the DOM list, invariably crashing their browsers (OOM) or causing severe networking delays. Consequently, the voting platform is easily taken down by a single malicious actor.

### 3. [MEDIUM] Lack of Cryptographic Integrity
- **Description:** The JSON file relies strictly on network-layer TLS transit security. The application cannot guarantee that a `feature-votes.json` entry was indeed authored by the claimed user since payloads are not cryptographically signed.
- **Impact:** It is completely impossible to retrospectively audit or prove who modified what inside `feature-votes.json`, severely limiting the reliability of feature votes in sensitive decision-making scenarios.

---

## 🛠 Hardening Recommendations

If this system is to be deployed in anything other than a high-trust, internal-only lab environment, a significant architectural pivot must be pursued to establish server-side validations:

### Option A: Introduce an API Gateway/Backend Layer (Recommended)
You must deprecate standard direct WebDAV interaction on the frontend. Build a diminutive backend microservice layer:
1. The frontend invokes standard API endpoints (e.g., `POST /api/voting/features`).
2. The backend securely checks the authenticated OIDC token.
3. The backend applies core business logic schema validation (enforces max size limits, verifies authorized data ownership).
4. The backend securely updates the underlying database (or writes to the WebDAV layer using a separate, privileged service account hidden from regular users).

### Option B: Switch to Granular "One-File-per-Item" Architecture (Workaround)
If a backend service cannot be provisioned, restructure the WebDAV storage so different users write distinct files into user-specific directories (e.g., `/dav/spaces/{spaceId}/features/{userId_featureId}.json`). 
- **Pros:** Users only require "Write" access to their own folders or files, preventing unauthorized modifications of other people’s content.
- **Cons:** Extremely chatty. This drastically complicates the frontend logic, which must now poll/fetch all JSON fragment files and assemble the global state itself.

### Option C: Accept Risk / Restrict Environment Space
If "Option A" or "Option B" are prohibitive and the architecture cannot be changed:
- Ensure the specific `Feature Voting Data` project space enforces strict IAM limits. 
- Accept that data could be tampered with.
- Schedule periodic background snapshot backups of the project space `feature-votes.json` to recover easily if malicious wiping occurs.
