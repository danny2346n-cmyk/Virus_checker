// Virus Checker DApp frontend (vanilla TypeScript)
// This file is intentionally framework-free. It shows how a client
// *would* call the Clarity contract functions but leaves wallet
// integration and network configuration as TODOs.

// === Configuration ===
// TODO: set these for your deployment environment.
const CONTRACT_ADDRESS = 'STXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // replace with real address
const CONTRACT_NAME = 'virus-scanner';

// In a real app you would configure the Stacks network here, e.g.:
// import { StacksDevnet } from '@stacks/network';
// const network = new StacksDevnet({ url: 'http://localhost:3999' });
// and then use @stacks/transactions to build/call contract functions.

// For now, we only maintain local UI state and log the intended
// contract calls so you can wire them up to your preferred wallet.

type RequestSummary = {
  id: number;
  fileHash: string;
  bounty: bigint;
  status: 'open' | 'closed' | 'cancelled';
};

const state: {
  selectedRequestId: number | null;
  requests: RequestSummary[];
} = {
  selectedRequestId: null,
  requests: [],
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function appendLog(containerId: string, message: string) {
  const box = $(containerId);
  const line = document.createElement('div');
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${message}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function renderRequestsList() {
  const list = $('requests-list');
  list.innerHTML = '';
  state.requests.forEach((req) => {
    const li = document.createElement('li');
    if (state.selectedRequestId === req.id) li.classList.add('active');
    li.innerHTML = `
      <div class="row">
        <div class="grow">
          <strong>#${req.id}</strong> <small>${req.fileHash.slice(0, 12)}...</small><br />
          <small>Bounty: ${req.bounty.toString()} uSTX</small>
        </div>
        <div>
          <span class="badge ${req.status === 'open' ? 'badge-open' : 'badge-closed'}">${req.status}</span>
        </div>
      </div>
    `;
    li.onclick = () => {
      state.selectedRequestId = req.id;
      renderRequestsList();
      renderSelectedMeta();
      appendLog('detail-log', `Selected request #${req.id}`);
    };
    list.appendChild(li);
  });
}

function renderSelectedMeta() {
  const box = $('selected-request-meta');
  if (state.selectedRequestId == null) {
    box.innerHTML = '<small>No request selected.</small>';
    return;
  }
  const req = state.requests.find((r) => r.id === state.selectedRequestId);
  if (!req) {
    box.innerHTML = '<small>Selected request not found in local state.</small>';
    return;
  }
  box.innerHTML = `
    <div>
      <div><strong>Request #${req.id}</strong></div>
      <div><small>File hash: ${req.fileHash}</small></div>
      <div><small>Bounty: ${req.bounty.toString()} uSTX | Status: ${req.status}</small></div>
      <div><small>Contract: ${CONTRACT_ADDRESS}.${CONTRACT_NAME}</small></div>
    </div>
  `;
}

async function onOpenRequest() {
  const fileHashInput = $('file-hash') as HTMLInputElement;
  const bountyInput = $('bounty') as HTMLInputElement;
  const hash = fileHashInput.value.trim();
  const bounty = BigInt(bountyInput.value || '0');

  if (!hash || hash.length < 16) {
    appendLog('open-request-log', 'Please provide a hex-encoded hash (at least 16 chars).');
    return;
  }
  if (bounty <= 0n) {
    appendLog('open-request-log', 'Bounty must be greater than 0.');
    return;
  }

  appendLog('open-request-log', `Would call open-scan-request on ${CONTRACT_ADDRESS}.${CONTRACT_NAME} with hash=${hash}, bounty=${bounty}.`);

  // TODO: Replace with real contract-call using your Stacks wallet integration.
  // Example (pseudo-code):
  // await openScanRequest({ fileHash: hash, bounty });

  const newId = state.requests.length + 1;
  state.requests.push({ id: newId, fileHash: hash, bounty, status: 'open' });
  renderRequestsList();
  appendLog('open-request-log', `Locally added request #${newId} (for demo only).`);
}

async function onSubmitResult() {
  if (state.selectedRequestId == null) {
    appendLog('detail-log', 'Select a request first.');
    return;
  }
  const verdictSelect = $('verdict') as HTMLSelectElement;
  const detailsArea = $('details') as HTMLTextAreaElement;
  const verdict = verdictSelect.value === 'infected';
  const details = detailsArea.value.trim() || '(no details)';

  appendLog('detail-log', `Would call submit-scan-result for #${state.selectedRequestId} with verdict=${verdict ? 'infected' : 'clean'} and details="${details}".`);

  // TODO: call Clarity function `submit-scan-result` via wallet.
}

async function onFinalize() {
  if (state.selectedRequestId == null) {
    appendLog('detail-log', 'Select a request first.');
    return;
  }
  appendLog('detail-log', `Would call finalize-request for #${state.selectedRequestId}.`);

  // TODO: call Clarity function `finalize-request` via wallet.
}

function onRefreshSummaries() {
  appendLog('open-request-log', 'Would call read-only functions (list-open-requests, get-file-summary) to refresh from chain.');
  // TODO: wire up read-only RPC calls using @stacks/transactions or @stacks/stacking.
}

function main() {
  $('btn-open-request').addEventListener('click', () => void onOpenRequest());
  $('btn-submit-result').addEventListener('click', () => void onSubmitResult());
  $('btn-finalize').addEventListener('click', () => void onFinalize());
  $('btn-refresh-summaries').addEventListener('click', () => void onRefreshSummaries());

  renderRequestsList();
  renderSelectedMeta();
  appendLog('open-request-log', 'Configure CONTRACT_ADDRESS and wire up wallet integration in ui/app.ts.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
