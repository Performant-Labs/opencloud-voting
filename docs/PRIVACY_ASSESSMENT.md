# Privacy & Data Compliance Assessment
**OpenCloud Feature Voting Extension**

This document formally analyzes the data flows, PII exposure, and regulatory obligations for the Feature Voting module under the European Union's General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).

---

## 1. Data Controller vs. Data Processor Classification

| Role | Entity | Justification |
| :--- | :--- | :--- |
| **Data Controller** | The organization operating the OpenCloud instance | They determine the purposes and means of processing personal data (i.e., deciding to install and operate this voting extension). |
| **Data Processor** | This Feature Voting extension (sidecar) | We process personal data exclusively on behalf of the Controller. We do not independently determine the purpose of data collection. The extension has no autonomous data collection motive. |

**Implication:** As a Data Processor, we are obligated to process data only as instructed by the Controller, implement appropriate technical safeguards, and support the Controller in fulfilling data subject requests (e.g., Right to Erasure).

---

## 2. PII Inventory — Fields Stored

The following table explicitly enumerates every piece of data the Go sidecar will persist to the database, classifying each field's PII status.

| Database Table | Field | Data Type | PII Classification | Source | Retention |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `voting_features` | `id` | UUID string | **Non-PII** | Server-generated | Permanent |
| `voting_features` | `title` | VARCHAR(255) | **Non-PII** (see Note 1) | User input | Permanent |
| `voting_features` | `description` | TEXT | **Non-PII** (see Note 1) | User input | Permanent |
| `voting_features` | `created_by` | VARCHAR(255) | **🔴 PII — Pseudonymous Identifier** | OIDC `sub` claim | Until deletion |
| `voting_features` | `created_at` | TIMESTAMP | **Non-PII** | Server-generated | Permanent |
| `voting_votes` | `feature_id` | UUID string | **Non-PII** | Foreign key | Until deletion |
| `voting_votes` | `user_id` | VARCHAR(255) | **🔴 PII — Pseudonymous Identifier** | OIDC `sub` claim | Until deletion |
| `voting_votes` | `voted_at` | TIMESTAMP | **Non-PII** | Server-generated | Permanent |

> [!WARNING]
> **Note 1 — Free-text PII risk:** While `title` and `description` are structurally non-PII, users *may* type personal information into free-text fields (e.g., "I, John Smith, need feature X for my department"). This is incidental PII exposure and cannot be technically prevented without content scanning. The Controller must address this risk in their own Data Protection Impact Assessment (DPIA).

---

## 3. Critical Design Decision: `sub` Claim vs. `preferred_username`

The legacy frontend code (`useVotingApi.ts`, line 70) currently resolves user identity as:
```typescript
currentUserId = payload.preferred_username || payload.sub || 'anonymous'
```

**This is a GDPR violation risk.** The `preferred_username` field is a human-readable string (e.g., `"john.smith"`) that is **directly identifiable PII**. Storing it in the database links every vote and feature submission to a recognizable human identity.

### The Mandatory Mitigation
The new Go sidecar must exclusively extract the **`sub` (Subject) claim** from the OIDC JWT. The `sub` is an opaque, platform-issued identifier (e.g., `"4c957f8f-f1d3-4a71-87ac-12345abcde"`) that:

1. **Cannot be reverse-engineered** to a human identity without access to the OpenCloud identity provider.
2. **Satisfies data minimization** (GDPR Article 5(1)(c)) — we collect only what is necessary to enforce vote uniqueness and feature ownership.
3. **Is pseudonymous** under GDPR Recital 26 — meaning it still qualifies as personal data, but with significantly reduced risk exposure.

> [!IMPORTANT]
> The `preferred_username` and `email` claims must **never** be persisted to the database. They may only be transiently used for display purposes in the frontend session memory.

---

## 4. Right to Erasure ("Right to be Forgotten") — GDPR Article 17

When an OpenCloud administrator deletes a user account, or when a user exercises their Right to Erasure, the following cascading deletion protocol must be honored:

### Technical Implementation
The Go sidecar must expose an administrative endpoint or respond to OpenCloud lifecycle webhooks to perform:

```sql
-- Cascading deletion for user_id = ?
DELETE FROM voting_votes WHERE user_id = ?;
DELETE FROM voting_features WHERE created_by = ?;
```

### Design Decisions
| Scenario | Behavior | Rationale |
| :--- | :--- | :--- |
| User is deleted | All their votes are removed | Vote records contain PII (`user_id`) |
| User is deleted | All features they created are removed | Features contain PII (`created_by`) |
| Feature is deleted by owner | All votes on that feature are removed | Votes reference a non-existent entity |

> [!WARNING]
> **Alternative consideration — Anonymization over deletion:** An alternative approach is to replace the `user_id`/`created_by` values with a sentinel like `"DELETED_USER"` instead of deleting the rows. This preserves aggregate vote counts and feature history. However, this approach requires explicit Controller consent and must be documented in the organization's DPIA. **For our default implementation, we choose full cascading deletion as the safer default.**

---

## 5. Data Minimization Audit (GDPR Article 5(1)(c))

| Data Point | Necessary? | Justification |
| :--- | :--- | :--- |
| `sub` claim (as `user_id`) | ✅ Yes | Required to enforce one-vote-per-user and feature ownership |
| `preferred_username` | ❌ No | Not stored. Display-only in transient frontend session |
| `email` | ❌ No | Never collected. Not needed for any voting logic |
| `title` / `description` | ✅ Yes | Core feature request content |
| `created_at` / `voted_at` | ✅ Yes | Audit trail and display ordering |
| IP addresses | ❌ No | Never logged or stored by the sidecar |
| Browser fingerprints | ❌ No | Never collected |

**Conclusion:** The architecture satisfies the principle of data minimization. Only the opaque `sub` identifier is persisted as PII, and it is strictly necessary for enforcing business logic (vote deduplication and ownership authorization).

---

## 6. CCPA Considerations

Under CCPA, the `sub` claim constitutes a "unique personal identifier." The following obligations apply:

| CCPA Right | Implementation |
| :--- | :--- |
| **Right to Know** | The Controller must be able to disclose what data is stored. Our `/api/voting/features` endpoint inherently provides this transparency for authenticated users. |
| **Right to Delete** | Honored via the same cascading deletion mechanism described in Section 4. |
| **Right to Opt-Out of Sale** | Not applicable. This extension does not sell, share, or transfer personal data to any third party. |
| **Non-Discrimination** | Not applicable. All authenticated users receive identical functionality. |

---

## 7. Technical Safeguards Summary

| Safeguard | Implementation |
| :--- | :--- |
| **Encryption in Transit** | All traffic passes through the OpenCloud TLS proxy. The sidecar never exposes public ports. |
| **Encryption at Rest** | Delegated to the host OS / Docker volume encryption. SQLite WAL files inherit the volume's encryption posture. |
| **Access Control** | OIDC JWT validation ensures only authenticated users can interact with the API. |
| **Data Isolation** | The sidecar uses prefixed table names (`voting_*`) to prevent cross-extension data leakage on shared databases. |
| **Audit Trail** | All operations logged via `log/slog` structured JSON for enterprise SIEM ingestion. |
