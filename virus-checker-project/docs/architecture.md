# Virus Checker Clarinet Project

## Overview
The Virus Checker project is a decentralized marketplace for file hash malware scanning built on the Stacks blockchain using Clarity smart contracts and Clarinet tooling. Instead of uploading full files, users submit SHA-256 hashes and attach a bounty in STX. Registered security scanners ("scanners") submit verdicts (clean or infected) and short descriptions. Once a configurable number of reports is reached, anyone can finalize the request, and the bounty is distributed among scanners whose verdict matches the majority.

This design aims to:
- Crowdsource malware detection from multiple, competing scanners.
- Provide an on-chain, auditable history of scan requests and verdicts.
- Incentivize accurate reporting by rewarding majority-aligned scanners.

## Threat model and limitations
- Only file hashes are stored on-chain, not the actual files. Anyone who has the file can compute the same hash, so there is no confidentiality guarantee.
- All transactions and contract state are public on-chain. Pseudonymous addresses are visible, so this is **not** a privacy-preserving system.
- Economic attacks are possible (Sybil scanners, collusion to mislabel files, griefing by opening many low-bounty requests). The current contract introduces basic staking and majority-based payouts but does not fully solve these problems.

## Contract architecture

### Roles
- **Admin/owner**: the account that deploys the contract. Can register scanners, deactivate them, and change the required number of reports to finalize a request.
- **Scanners**: principals registered by the admin. They may lock a stake in the contract as a basic quality signal.
- **Users**: any principal that opens a scan request by submitting a file hash and bounty.

### Data structures
- Global variables:
  - `var-next-request-id (uint)`: monotonically increasing ID for scan requests.
  - `var-min-reports-to-finalize (uint)`: minimum number of scanner reports required to finalize a request.
- Data maps:
  - `scanners (principal -> { active: bool, staked: uint })`: registered scanners and their locked stake.
  - `scan-requests (uint -> { file-hash: (buff 32), requester: principal, bounty: uint, status: (string-ascii 16), total-reports: uint, positive-reports: uint, created-at: uint })`:
    - `status` is one of `"open"`, `"closed"`, or `"cancelled"`.
    - `total-reports` counts all submitted results.
    - `positive-reports` counts results with `verdict = true` (infected).
  - `scan-results ({ id: uint, scanner: principal } -> { verdict: bool, details: (string-utf8 128), timestamp: uint })`:
    - Each scanner can submit at most one result per request.
  - `file-summaries ((buff 32) -> { last-verdict: (optional bool), last-request-id: (optional uint) })`:
    - Provides a quick lookup for the most recent scan request and majority verdict for a given file hash.

### Core functions (conceptual)
- `register-scanner(stake-amount)` (public, admin-only):
  - Ensures caller is admin.
  - Requires the transaction to transfer `stake-amount` STX to the contract.
  - Inserts or updates `scanners` with `active = true` and `staked = stake-amount`.
- `deactivate-scanner(scanner)` (public, admin-only):
  - Marks a scanner as inactive; they can no longer submit results.
- `set-min-reports-to-finalize(value)` (public, admin-only):
  - Updates `var-min-reports-to-finalize`.
- `open-scan-request(file-hash, bounty)` (public):
  - Requires the transaction to transfer `bounty` STX to the contract.
  - Creates a new `scan-requests` entry with status `"open"`, counts zero, and current block height as `created-at`.
  - Increments `var-next-request-id` and returns the new ID.
- `submit-scan-result(id, verdict, details)` (public, scanners-only):
  - Checks that the caller is an active scanner.
  - Ensures the request exists and is still `"open"`.
  - Rejects duplicate submissions from the same scanner for the same request.
  - Inserts into `scan-results` and updates `total-reports` and `positive-reports`.
- `finalize-request(id)` (public):
  - Ensures the request exists and is `"open"`.
  - Requires `total-reports >= var-min-reports-to-finalize`.
  - Computes majority verdict (infected vs. clean) based on counters.
  - Distributes the `bounty` pro-rata among scanners whose verdict agreed with the majority.
  - Updates the request status to `"closed"` and updates `file-summaries` for `file-hash`.
- `cancel-request(id)` (public, requester-only):
  - Ensures caller is the `requester`.
  - Only allowed if `total-reports = 0` and status is still `"open"`.
  - Refunds full `bounty` to requester and sets status to `"cancelled"`.

### Read-only helpers
- `get-request(id)` returns the full `scan-requests` entry.
- `get-result(id, scanner)` returns a scanner's single result for a request.
- `get-file-summary(file-hash)` returns the latest known verdict and request-id.
- `get-scanner(scanner)` returns `active` and `staked` for the scanner.
- `list-open-requests(limit, offset)` (to be implemented) would page through open requests for UI listing.

### Invariants and safety
- For each request `id`:
  - `total-reports` equals the number of `scan-results` entries with that `id`.
  - `positive-reports` equals the number of those entries with `verdict = true`.
- The bounty for a request is only moved once: either fully refunded on cancel or fully distributed on finalize.
- Only admin can change scanner status and global thresholds; only registered active scanners can submit results.

## Example flows

### User: submit a file hash and bounty
1. User computes a SHA-256 hash of a file off-chain.
2. User calls `open-scan-request(file-hash, bounty)` and sends `bounty` STX in the same transaction.
3. The contract records a new `scan-requests` row with status `"open"` and returns the request ID.
4. Off-chain UI periodically queries `list-open-requests` or `get-request` to show this request.

### Scanner: register and submit results
1. Admin calls `register-scanner(stake-amount)` and transfers STX to the contract in the same transaction.
2. Scanner sees open requests in the UI and chooses one.
3. Scanner analyzes the file off-chain using their AV engine.
4. Scanner calls `submit-scan-result(id, verdict, details)` with their result.

### Finalization and payout
1. Once at least `var-min-reports-to-finalize` results exist for a request, anyone can call `finalize-request(id)`.
2. The contract computes majority verdict from `total-reports` and `positive-reports`.
3. Bounty is distributed to scanners whose `verdict` matches this majority.
4. Request status becomes `"closed"`, and `file-summaries` is updated for the corresponding file hash.

### Cancelation
1. If no scanner has yet submitted a result, the requester can call `cancel-request(id)`.
2. Bounty is refunded in full, and status becomes `"cancelled"`.

## UI
The UI lives under `ui/` and is intentionally simple and framework-free:
- `ui/index.html`: three-column layout
  1. **Submit hash**: form for `file-hash` and `bounty`, button to open a request.
  2. **Open requests**: list of open requests with short hash and bounty.
  3. **Request detail**: shows selected request metadata and a form for scanners to submit a verdict or finalize.
- `ui/app.ts`: minimal TypeScript that maintains local state and logs the contract calls it *would* make:
  - `open-scan-request` when the user submits the form.
  - `submit-scan-result` when a scanner submits a verdict.
  - `finalize-request` when finalize is clicked.
  - Helper logs to indicate where read-only calls like `get-request` and `get-file-summary` should be made.

To turn this into a real dApp, you would:
- Set `CONTRACT_ADDRESS` and `CONTRACT_NAME` in `ui/app.ts` to your deployed contract.
- Import and configure `@stacks/transactions` and a Stacks wallet connector (`@stacks/connect`).
- Replace the log-only handlers with real contract-call and read-only RPC calls.

## Running tests
Inside the `virus-checker-project` directory:

```bash
npm install
npm test
```

The tests will use `vitest` with `vitest-environment-clarinet` to spin up a local Clarinet chain, deploy the contract, and exercise:
- Scanner registration and permission checks.
- Opening requests and verifying bounty accounting.
- Submitting results, blocking duplicates, and enforcing scanner-only access.
- Finalization, majority verdict computation, and payout.
- Cancelation and read-only helpers.

## Future improvements
- Stronger economic security: slashing stakes for provably bad behavior, reputation scores, and higher minimum stakes.
- Better privacy: routing transactions through mixing services or using off-chain relays (with trade-offs).
- Richer verdict metadata: standardized malware naming, severity scoring, and automated integration with traditional AV vendors.
- Advanced querying: indexing by hash prefix, time window filters, and per-scanner performance dashboards.
