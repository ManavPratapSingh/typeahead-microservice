import crypto from "crypto";

export class ConsistentHashRing<T> {
  private replicas: number;
  private ring: Map<number, T> = new Map();
  private sortedKeys: number[] = [];

  constructor(nodes: { key: string; value: T }[], replicas: number = 40) {
    this.replicas = replicas;
    for (const node of nodes) {
      this.addNode(node.key, node.value);
    }
  }

  private hash(key: string): number {
    // Generate a 32-bit integer hash from MD5
    const md5 = crypto.createHash("md5").update(key).digest();
    return md5.readUInt32BE(0);
  }

  public addNode(nodeKey: string, nodeValue: T): void {
    for (let i = 0; i < this.replicas; i++) {
      const vnodeKey = `${nodeKey}-vnode-${i}`;
      const hash = this.hash(vnodeKey);
      this.ring.set(hash, nodeValue);
      this.sortedKeys.push(hash);
    }
    this.sortedKeys.sort((a, b) => a - b);
  }

  public getNode(key: string): T {
    if (this.ring.size === 0) {
      throw new Error("ConsistentHashRing: Hash ring is empty");
    }
    const hash = this.hash(key);
    let idx = this.binarySearch(hash);
    if (idx === this.sortedKeys.length) {
      idx = 0; // Wrap around
    }
    return this.ring.get(this.sortedKeys[idx])!;
  }

  private binarySearch(target: number): number {
    let low = 0;
    let high = this.sortedKeys.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedKeys[mid] === target) {
        return mid;
      } else if (this.sortedKeys[mid] < target) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }
}
