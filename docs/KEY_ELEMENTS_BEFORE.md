# OpenCloud Feature Voting — Starting Architecture Snapshot

The following document comprehensively catalogs the exact enterprise methodologies, framework limitations, legal boundaries, and supply chain rules explicitly agreed to within `PLAN.md`. This is an exhaustive physical manifestation of the project's submittability matrix prior to executing Phase 100.

---

## 🏗️ 1. Infrastructure & Orchestration (Phases 100, 300)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Microservice Isolation** | Built as a standalone `api/Dockerfile` (Alpine/Go) mounted to `opencloud-extensions-data`. Exposes 0 host ports. | Replaces the legacy WebDAV implementation to patch Broken Access Control vectors. Enforces pure internal Docker DNS (`proxy:9200`) isolation. |
| **Immutable Auditing** | Mandated creation of `docs/EXECUTION_LOG.md` recording technical deviations. | Ensures the master `PLAN.md` remains a clean tactical checklist while building a pristine architectural audit trail for PR reviewers. |
| **SIGTERM Interruption** | Go server rigorously traps OS termination signals to drain `net/http` connections and flush the SQLite instances. | Prevents silent data corruption or dropping enterprise GraphQL connections during Kubernetes pod scale-down actions. |

## 🗄️ 2. Database & Compliance (Phases 200, 300)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Compliance (GDPR / CCPA)** | Must explicitly generate a `PRIVACY_ASSESSMENT` minimizing the OpenID `sub` tracking and establishing 'Right to be Forgotten' parameters. | Prevents massive legal liability in European enterprise deployments. Mandates anonymization models over raw PII scraping. |
| **The Enterprise DB Switch** | Application checks `OC_DB_URL` during boot. If provided by an OpenCloud admin, uses native Postgres/MariaDB clusters. | Natively honors centralized enterprise database deployments while gracefully supporting zero-config local instances. |
| **SQLite Tuning (Fallback)** | When using local storage, mandates `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`. | Protects against `database is locked` panics occurring under standard distributed HTTP polling pressure. |

## ⚙️ 3. Backend Routing & Telemetry (Phases 400, 500)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Go 1.22 Native Minimalism** | Absolute zero third-party routers (`chi`, `Gin`, `Fiber`). Must use the Go standard library `net/http` `ServeMux` and custom memory Token Buckets. | Dictated explicitly by `PLAN_INSTRUCTIONS.md` to guarantee Tier-1 submittability by mirroring OpenCloud core principles. |
| **OIDC JWKs Validations** | Go middleware fetches OpenCloud's `.well-known/openid-configuration` fetching dynamic JSON Web Key Sets to validate Bearers. | Implicitly trusts the upstream Traefik gateway proxy without requiring the extension to maintain its own users/passwords. |
| **Context & Errors Matrix** | `context.Context` must be the first argument in all major queries for cascading timeouts. Errors must serialize using `fmt.Errorf("%w")`. | OpenCloud strictly bans "ignoring" error strings (`_`) or allowing runaway DB queries that ignore aborted HTTP sockets. |
| **Prometheus Telemetry** | Incorporates `github.com/prometheus/client_golang` alongside native `log/slog` structured JSON stdout pipelines. Provides `SELECT 1` queries on `/healthz`. | Without Prometheus endpoints mapping HTTP latencies, the OpenCloud Grafana dashboards go blind to pod health. |

## 💻 4. Frontend Ecosystem (Phase 700)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **I18N Boundary Architecture** | Go backend must NEVER translate strings, only returning `{"error": "ERR_VOTE"}` codes. Vue uses TS composables to resolve strings. | Absolute separation of concerns between raw logic parsing and structural UI display formatting. |
| **Hybrid `gettext` Compiling** | Explicit ban on standard `vue-i18n`. Vue utilizes `vue3-gettext` with literal English wrappers (`{{ $gettext('Submit') }}`). | OpenCloud extension SDK natively injects `.po` files. Using any other library physically disconnects the extension from OpenCloud global settings. |

## 🧪 5. Testing & Security (Phases 600, 800)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Go Standard Test Libs** | Unit testing must exclusively use `net/http/httptest` and standard assertions (no Ginkgo/Gomega syntactical abstraction layers allowed). | Adheres to OpenCloud's core codebase strictness; testing wrappers break core CI pipeline integration tooling. |
| **Zombie Code Aversion** | E2E Github Actions mandates `pnpm build` -> `cp -r dist/* proxy/app` before launching the Chrome GUI runner. | Avoids catastrophic "false positive" E2E tests executing against stale OpenCloud reverse proxy caches. |
| **Accessibility Automation** | Test suites globally inherit `@axe-core/playwright` sweeping the DOM for strict WCAG failures (missing `aria-labels`, inputs). | Instantly halts CI pipelines if the Vue codebase degrades below enterprise legal accessibility thresholds. |
| **Elasticity Degration (hey)** | Injects 50 unique Graph users into the database, invoking 500-request Threshold Assurance limits and 5,000-request Degradation drops. | Actively measures the SQLite `WAL` threshold elasticity. Ensures the module doesn't snap in half during "Thundering Herds". |

## 🛡️ 6. Supply Chain Auditing (Phases 1000, 1100)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **The Penetration Test** | Re-appraisal of `docs/SECURITY_ASSESSMENT.md` following load generation verifying the theoretical WebDAV structural pivots solved the broken states. | Acts as the formal external-review signoff determining zero CVE flaws exist pre-deployment. |
| **OSSPREY Vitality Scan** | Executes `oss-prey` looking for secretly abandoned JS/Go libraries, alongside `govulncheck` and OS-level Alpine `trivy` sweeps. | Institutional OpenCloud IT buyers demand verifiable proof that a module's nested dependency tree is actively maintained globally. |

## 🤖 7. AI Operations & Code Conventions (Phases 100, 400)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Git Subtree Guidance** | Core runbooks (`PLAN_INSTRUCTIONS.md`, `TROUBLESHOOTING.md`) are synchronized as Git subtrees, not localized markdown. | Unifies the AI agent constraints across multiple independent repos (e.g., `opencloud-registration` and `opencloud-voting`), ensuring AI behavior never hallucinates out-of-sync logic. |
| **Contextual Nomenclature** | Absolute ban on generic, ambiguous naming (e.g., `data.json`, `app.db`). All files, components, and variables must be hyper-descriptive (e.g., `feature-votes-store.sqlite`). | Eliminates catastrophic collision states across the massive OpenCloud microservice galaxy and ends developer ambiguity. |
| **Idiomatic `go fmt` Quality** | AI must exclusively write code compatible with *Effective Go*, avoiding clever abstractions or bespoke patterns. `go fmt` is functionally mandatory. | Code must be readable, standard, and boring. "Spray-and-pray" untested AI generation is structurally banned by OpenCloud review standards. |
| **Architectural Accountability** | AI Agents are restricted to operations designated in the master Plan and are mandated to log all technical logic gaps in `EXECUTION_LOG.md`. | Enforces absolute tracking and human visibility when an agent makes a low-level routing or syntax deployment decision. |

## 🛠️ 8. Developer Workflows & Ephemerality (Phases 800, 900)
| Architectural Element | Strict Implementation Parameters | The Enterprise "Why" |
| :--- | :--- | :--- |
| **Makefile Standardization** | The repository root must expose a `Makefile` with unified targets for `make build`, `make test-e2e`, and `make lint`. | Abstracting `go build` or `pnpm run` behind a uniform `Makefile` guarantees the central OpenCloud CI/CD pipelines can execute predictably across all disparate microservices. |
| **E2E State Ephemerality** | Playwright tests must rigorously employ `global_setup` and `global_teardown` hooks interacting specifically with the OpenCloud Graph API. | Tests cannot assume users exist. They must dynamically provision Graph users pre-test, and strictly purge them post-test so the local target database isn't permanently bloated by ghost accounts. |
| **README.md Veracity** | `README.md` must be dynamically verified against the live file system post-build during Phase 900. | Leftover documentation from abandoned branches or old frameworks is a critical enterprise failure; docs must reflect actual compiled CLI commands. |
