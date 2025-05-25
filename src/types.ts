// ──────────────────────────────
// Base primitives
// ──────────────────────────────
export type URI        = string;                          // e.g. ipfs://CID
export type MimeType   = string;                          // e.g. application/pdf
export type Timestamp  = string;                          // ISO‑8601
export type Currency   = string;                          // e.g. USD, USDC, ETH
export type Amount     = number;

// ──────────────────────────────
// Manifest
// ──────────────────────────────
export interface AgentManifest {
  agentId: string;               // public key or DID
  agentSkills: string[];
  agentTooling: string[];
  agentInputTypes: string[];     // accepted MIME types
  agentOutputTypes: string[];    // produced MIME types
  agentVersion: string;          // semantic version
  agentSignature: string;        // Ed25519 sig (hex / base64)
}

// ──────────────────────────────
// Job lifecycle types
// ──────────────────────────────
export interface JobSpec {
  jobId: string;
  jobDescription: string;
  jobInputUri: URI;
  jobOutputMimeType: MimeType;
  jobOutputSchemaUri?: URI;
  jobRewardAmount: Amount;
  jobRewardCurrency: Currency;
  jobDeadline: Timestamp;
  jobRequiredTooling: string[];
}

export interface JobStatus {
  jobId: string;
  status: 'posted' | 'claimed' | 'submitted' | 'completed' | 'paid';
  escrowStatus: 'pending' | 'reserved' | 'released' | 'refunded';
  claimedBy?: string;
  submittedAt?: Timestamp;
  completedAt?: Timestamp;
  paymentTxId?: string;
}

export interface JobSubmission {
  jobId: string;
  outputUri: URI;
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────
// Filters
// ──────────────────────────────
export interface JobFilter {
  skills?: string[];
  tooling?: string[];
  minReward?: number;
  maxReward?: number;
  status?: JobStatus['status'][];
}

// ──────────────────────────────
// SDK config + event map
// ──────────────────────────────
export interface AgentConfig {
  coordinatorUrl: string;
  walletPrivateKey: string;
  ipfsGateway?: string;
}

export interface AgentEvents {
  'job:new':      (job: JobSpec)        => void;
  'job:claimed':  (jobId: string)       => void;
  'job:submitted':(sub: JobSubmission)  => void;
  'job:completed':(jobId: string)       => void;
  'job:paid':     (jobId: string,
                   txId: string)        => void;
  'error':        (err: Error)          => void;
} 