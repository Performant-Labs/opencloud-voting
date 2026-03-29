# Contextual Nomenclature Standards

> [!WARNING]
> **Submittability Constraint:** Generic variable and file naming is explicitly prohibited.

To guarantee zero enterprise collision states across the massive OpenCloud microservice galaxy and to eliminate AI developer ambiguity, all code assets must strictly adhere to the Contextual Nomenclature policy.

## 🚫 Prohibited Generic Names
- `data.json`
- `app.db`
- `store.sqlite`
- `main.js` (unless explicitly required by a rigid framework entrypoint)
- `utils.ts` (without a descriptive prefix/suffix)

## ✅ The Contextual Mandate
All databases, logic domains, API endpoints, SQL tables, and component files **must** be hyper-descriptive, utilizing contextual prefixes:
- **Files/Databases**: `feature-votes-store.sqlite`, `voting-feature-schema.sql`
- **Data Models**: `VotingFeatureModel`, `FeatureVoteEvent`
- **API Interfaces**: `IVoteSubmissionPayload` instead of `Payload`

### The Enterprise Rationale
Generic sprawl in enterprise microservice architecture transforms shared storage networks into collision disaster zones. For example, if multiple OpenCloud extensions attempt to mount or initialize a local file named `app.db`, catastrophic data overwriting and concurrency failures will instantly occur across the container orchestrator. Descriptive prefixing prevents domain crossover natively without requiring complex logical orchestration.
