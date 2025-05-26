import { EventEmitter } from 'eventemitter3';
import axios, { AxiosRequestConfig } from 'axios';
import { create as createIpfsClient } from 'ipfs-http-client';
import { sign, getPublicKey } from '@noble/ed25519';
import {
  AgentManifest,
  JobSpec,
  JobStatus,
  JobSubmission,
  JobFilter,
  AgentConfig,
  AgentEvents
} from './types';

/**
 * Main Agent SDK class for interacting with the Workmesh coordinator.
 */
export class Agent extends EventEmitter<AgentEvents> {
  private config: AgentConfig;
  private token: string = '';
  private ipfs: any;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.ipfs = createIpfsClient({ url: config.ipfsGateway || 'http://localhost:5001' });
  }

  /**
   * Helper to ensure the agent is registered and has a token.
   */
  private ensureRegistered(): void {
    if (!this.token) throw new Error('Agent not registered');
  }

  /**
   * Helper to create auth headers.
   */
  private getAuthHeaders(): AxiosRequestConfig['headers'] {
    return { Authorization: `Bearer ${this.token}` };
  }

  /**
   * Register the agent with the coordinator. Returns the session token.
   */
  async register(): Promise<string> {
    try {
      const response = await axios.post(`${this.config.coordinatorUrl}/agents/register`, {
        publicKey: await this.derivePublicKey() // Derive public key from signing key
      });
      this.token = response.data.token || '';
      return this.token;
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Publish the agent manifest, signing it with the agent's private key.
   */
  async publishManifest(manifestNoSig: Omit<AgentManifest, 'agentSignature'>): Promise<void> {
    this.ensureRegistered();
    // @noble/ed25519 returns Uint8Array, convert to hex string
    const signatureBytes = await sign(
      JSON.stringify(manifestNoSig),
      this.config.agentSigningKey
    );
    const signature = Buffer.from(signatureBytes).toString('hex');
    const signedManifest: AgentManifest = {
      ...manifestNoSig,
      agentSignature: signature
    };
    try {
      await axios.post(
        `${this.config.coordinatorUrl}/agents/manifest`,
        signedManifest,
        { headers: this.getAuthHeaders() }
      );
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Subscribe to job events from the coordinator (Server-Sent Events).
   */
  async subscribeToJobs(filter?: JobFilter): Promise<void> {
    this.ensureRegistered();
    const url = `${this.config.coordinatorUrl}/jobs/stream?${filter ? new URLSearchParams(filter as any) : ''}`;
    // Note: Node.js does not support EventSource natively; this is a placeholder for browser/compatible polyfill
    const eventSource = new (globalThis as any).EventSource(url, {
      headers: this.getAuthHeaders()
    });
    eventSource.onmessage = (event: MessageEvent) => {
      const job: JobSpec = JSON.parse(event.data);
      this.emit('job:new', job);
    };
    eventSource.onerror = (error: any) => {
      this.emit('error', error as Error);
      eventSource.close();
    };
  }

  /**
   * Claim a job by ID.
   */
  async claimJob(jobId: string): Promise<void> {
    this.ensureRegistered();
    try {
      await axios.post(
        `${this.config.coordinatorUrl}/jobs/${jobId}/claim`,
        {},
        { headers: this.getAuthHeaders() }
      );
      this.emit('job:claimed', jobId);
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Submit job results.
   */
  async submitJob(submission: JobSubmission): Promise<void> {
    this.ensureRegistered();
    try {
      await axios.post(
        `${this.config.coordinatorUrl}/jobs/${submission.jobId}/submit`,
        submission,
        { headers: this.getAuthHeaders() }
      );
      this.emit('job:submitted', submission);
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Get the status of a job by ID.
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    this.ensureRegistered();
    try {
      const response = await axios.get(
        `${this.config.coordinatorUrl}/jobs/${jobId}/status`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Upload data to IPFS and return the resulting CID.
   */
  async uploadToIpfs(data: Buffer): Promise<string> {
    try {
      const result = await this.ipfs.add(data);
      return result.path || result.cid?.toString();
    } catch (error) {
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async signManifest(manifest: AgentManifest): Promise<string> {
    const manifestNoSig = { ...manifest, agentSignature: '' };
    const signatureBytes = await sign(
      JSON.stringify(manifestNoSig),
      this.config.agentSigningKey
    );
    return Buffer.from(signatureBytes).toString('hex');
  }

  /**
   * Derive the public key from the agent's signing key.
   */
  async derivePublicKey(): Promise<string> {
    const publicKeyBytes = await getPublicKey(this.config.agentSigningKey);
    return Buffer.from(publicKeyBytes).toString('hex');
  }
} 