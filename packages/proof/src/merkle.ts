/**
 * COLOPHON: Deterministic Evidence Merkle Tree
 *
 * Evidence Merkle tree and statement commitment:
 *   - leaf = canonical SHA-256 hash of source evidence item
 *   - internal node = H(left || right)
 *   - root = evidenceRoot
 *   - proof path for individual line items
 *   - cryptographic commitment binding statementHash + evidenceRoot + mint + wallet + timestamp
 */

import { sha256Hex } from "@colophon/kernel";

export type EvidenceItem = {
  id: string;
  type: "TRANSFER" | "MULTIPLIER_SCHEDULE" | "MULTIPLIER_ACTIVE" | "ISSUER_AUTHORITY" | "METADATA";
  signature: string;
  slot: bigint;
  blockTime: bigint;
  data: Record<string, unknown>;
  leafHash?: string;
};

export type MerkleProofStep = {
  hash: string;
  position: "left" | "right";
};

export type MerkleProof = {
  leafHash: string;
  leafIndex: number;
  siblings: MerkleProofStep[];
  root: string;
};

export function hashEvidenceItem(item: EvidenceItem): string {
  // Canonical serialization: keys sorted deterministically
  const canonical = JSON.stringify(
    {
      id: item.id,
      type: item.type,
      signature: item.signature,
      slot: item.slot.toString(),
      blockTime: item.blockTime.toString(),
      data: item.data,
    },
    Object.keys(item).sort()
  );
  return sha256Hex(canonical);
}

export class EvidenceMerkleTree {
  private readonly leaves: string[];
  private readonly layers: string[][];
  private readonly items: EvidenceItem[];

  constructor(items: EvidenceItem[]) {
    this.items = [...items];
    if (this.items.length === 0) {
      // Empty tree sentinel hash
      const emptyHash = sha256Hex("EMPTY_EVIDENCE_TREE");
      this.leaves = [emptyHash];
      this.layers = [[emptyHash]];
      return;
    }

    this.leaves = this.items.map((it) => {
      const h = hashEvidenceItem(it);
      it.leafHash = h;
      return h;
    });

    this.layers = [this.leaves];
    this.buildTree();
  }

  private buildTree(): void {
    let currentLayer = this.leaves;
    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left; // duplicate last if odd
        const parent = sha256Hex(left + right);
        nextLayer.push(parent);
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    return this.layers[this.layers.length - 1][0];
  }

  public getLeaves(): readonly string[] {
    return this.leaves;
  }

  public getItems(): readonly EvidenceItem[] {
    return this.items;
  }

  public getProof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Invalid leafIndex: ${leafIndex}, total leaves: ${this.leaves.length}`);
    }

    const siblings: MerkleProofStep[] = [];
    let currentIndex = leafIndex;

    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const currentLayer = this.layers[layerIdx];
      const isRightSibling = currentIndex % 2 === 0;
      const siblingIndex = isRightSibling ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex < currentLayer.length) {
        siblings.push({
          hash: currentLayer[siblingIndex],
          position: isRightSibling ? "right" : "left",
        });
      } else {
        // Odd node paired with itself
        siblings.push({
          hash: currentLayer[currentIndex],
          position: "right",
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafHash: this.leaves[leafIndex],
      leafIndex,
      siblings,
      root: this.getRoot(),
    };
  }

  public static verifyProof(proof: MerkleProof): boolean {
    let currentHash = proof.leafHash;

    for (const step of proof.siblings) {
      if (step.position === "right") {
        currentHash = sha256Hex(currentHash + step.hash);
      } else {
        currentHash = sha256Hex(step.hash + currentHash);
      }
    }

    return currentHash.toLowerCase() === proof.root.toLowerCase();
  }

  public static computeStatementCommitment(params: {
    statementHash: string;
    evidenceRoot: string;
    instrumentMint: string;
    wallet: string;
    effectiveTimestamp: bigint;
    schemaVersion: string;
    engineVersion: string;
  }): string {
    const canonical = [
      params.statementHash,
      params.evidenceRoot,
      params.instrumentMint,
      params.wallet,
      params.effectiveTimestamp.toString(),
      params.schemaVersion,
      params.engineVersion,
    ].join(":");
    return sha256Hex(canonical);
  }
}
