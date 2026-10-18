import { createHash } from 'node:crypto';
import { GatewayError } from './bitnob/types';

/**
 * Minimal OpenTimestamps support (https://opentimestamps.org).
 *
 *  stamp()   sends a SHA-256 digest to a public calendar server and returns a standard
 *            detached `.ots` file (pending: the calendar will include it in a Bitcoin
 *            transaction within a few hours).
 *  upgrade() asks the calendar for the Bitcoin attestation and merges it into the file.
 *  The resulting `.ots` can be verified by anyone, with no trust in NobPay, by dropping
 *  it together with the original dossier file on https://opentimestamps.org.
 *
 * File format reference: the public python-opentimestamps implementation (core/timestamp.py).
 */

export const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

const HEADER_MAGIC = Buffer.concat([
  Buffer.from([0x00]),
  Buffer.from('OpenTimestamps', 'latin1'),
  Buffer.from([0x00, 0x00]),
  Buffer.from('Proof', 'latin1'),
  Buffer.from([0x00]),
  Buffer.from([0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94]),
]);

const TAG_BITCOIN = Buffer.from('0588960d73d71901', 'hex');
const TAG_PENDING = Buffer.from('83dfe30d2ef90c8e', 'hex');

const OP_SHA256 = 0x08;
const OP_APPEND = 0xf0;
const OP_PREPEND = 0xf1;

/* ------------------------------ binary helpers ------------------------------ */

class Reader {
  pos = 0;
  constructor(private readonly buf: Buffer) {}
  get done(): boolean {
    return this.pos >= this.buf.length;
  }
  byte(): number {
    if (this.pos >= this.buf.length) throw new Error('Fin de fichier .ots inattendue');
    return this.buf[this.pos++];
  }
  bytes(n: number): Buffer {
    if (this.pos + n > this.buf.length) throw new Error('Fin de fichier .ots inattendue');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  varUint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const b = this.byte();
      value += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return value;
      shift += 7;
      if (shift > 49) throw new Error('Entier trop grand');
    }
  }
  varBytes(): Buffer {
    return this.bytes(this.varUint());
  }
}

function varUint(n: number): Buffer {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
  return Buffer.from(out);
}

const varBytes = (b: Buffer): Buffer => Buffer.concat([varUint(b.length), b]);

/* ------------------------------ timestamp tree ------------------------------ */

interface Attestation {
  tag: Buffer;
  payload: Buffer;
}
interface OpEdge {
  tag: number;
  arg?: Buffer;
  child: TsNode;
}
export interface TsNode {
  msg: Buffer;
  attestations: Attestation[];
  ops: OpEdge[];
}

function applyOp(tag: number, arg: Buffer | undefined, msg: Buffer): Buffer {
  switch (tag) {
    case OP_SHA256:
      return createHash('sha256').update(msg).digest();
    case OP_APPEND:
      return Buffer.concat([msg, arg!]);
    case OP_PREPEND:
      return Buffer.concat([arg!, msg]);
    default:
      throw new Error(`Opération OpenTimestamps non gérée (0x${tag.toString(16)})`);
  }
}

function parseTimestamp(r: Reader, msg: Buffer, depth = 0): TsNode {
  if (depth > 256) throw new Error('Arbre OpenTimestamps trop profond');
  const node: TsNode = { msg, attestations: [], ops: [] };
  const handle = (tag: number) => {
    if (tag === 0x00) {
      node.attestations.push({ tag: Buffer.from(r.bytes(8)), payload: Buffer.from(r.varBytes()) });
      return;
    }
    const arg = tag === OP_APPEND || tag === OP_PREPEND ? Buffer.from(r.varBytes()) : undefined;
    const child = parseTimestamp(r, applyOp(tag, arg, msg), depth + 1);
    node.ops.push({ tag, arg, child });
  };
  let tag = r.byte();
  while (tag === 0xff) {
    handle(r.byte());
    tag = r.byte();
  }
  handle(tag);
  return node;
}

function serializeTimestamp(node: TsNode): Buffer {
  const items: Buffer[] = [];
  for (const a of node.attestations) items.push(Buffer.concat([Buffer.from([0x00]), a.tag, varBytes(a.payload)]));
  for (const o of node.ops) {
    items.push(Buffer.concat([Buffer.from([o.tag]), o.arg ? varBytes(o.arg) : Buffer.alloc(0), serializeTimestamp(o.child)]));
  }
  const out: Buffer[] = [];
  items.forEach((item, i) => {
    if (i < items.length - 1) out.push(Buffer.from([0xff]));
    out.push(item);
  });
  return Buffer.concat(out);
}

function mergeInto(target: TsNode, source: TsNode): void {
  for (const a of source.attestations) {
    if (!target.attestations.some((t) => t.tag.equals(a.tag) && t.payload.equals(a.payload))) target.attestations.push(a);
  }
  for (const op of source.ops) {
    const existing = target.ops.find((t) => t.tag === op.tag && (t.arg ?? Buffer.alloc(0)).equals(op.arg ?? Buffer.alloc(0)));
    if (existing) mergeInto(existing.child, op.child);
    else target.ops.push(op);
  }
}

/* ------------------------------ detached file ------------------------------- */

export interface DetachedFile {
  digest: Buffer;
  root: TsNode;
}

export function parseDetached(file: Buffer): DetachedFile {
  const r = new Reader(file);
  if (!r.bytes(HEADER_MAGIC.length).equals(HEADER_MAGIC)) throw new Error("Ce n'est pas un fichier .ots");
  if (r.varUint() !== 1) throw new Error('Version .ots non gérée');
  if (r.byte() !== OP_SHA256) throw new Error('Seul le condensat SHA-256 est géré');
  const digest = Buffer.from(r.bytes(32));
  return { digest, root: parseTimestamp(r, digest) };
}

export function serializeDetached(f: DetachedFile): Buffer {
  return Buffer.concat([HEADER_MAGIC, varUint(1), Buffer.from([OP_SHA256]), f.digest, serializeTimestamp(f.root)]);
}

/* ------------------------------ inspection ---------------------------------- */

export interface OtsStatus {
  pending: { uri: string; commitment: string }[];
  bitcoin: { height: number; commitment: string }[];
}

function walk(node: TsNode, visit: (n: TsNode) => void): void {
  visit(node);
  for (const o of node.ops) walk(o.child, visit);
}

export function inspect(root: TsNode): OtsStatus {
  const status: OtsStatus = { pending: [], bitcoin: [] };
  walk(root, (n) => {
    for (const a of n.attestations) {
      if (a.tag.equals(TAG_PENDING)) {
        status.pending.push({ uri: new Reader(a.payload).varBytes().toString('utf8'), commitment: n.msg.toString('hex') });
      } else if (a.tag.equals(TAG_BITCOIN)) {
        status.bitcoin.push({ height: new Reader(a.payload).varUint(), commitment: n.msg.toString('hex') });
      }
    }
  });
  return status;
}

/* ------------------------------ network ------------------------------------- */

const OTS_ACCEPT = 'application/vnd.opentimestamps.v1';

export async function stamp(digest: Buffer): Promise<{ ots: Buffer; calendar: string }> {
  if (digest.length !== 32) throw new Error('Le condensat doit faire 32 octets');
  const errors: string[] = [];
  for (const calendar of CALENDARS) {
    try {
      const res = await fetch(`${calendar}/digest`, {
        method: 'POST',
        headers: { Accept: OTS_ACCEPT, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NobPay-prototype/0.1' },
        body: new Uint8Array(digest),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answer = Buffer.from(await res.arrayBuffer());
      const root = parseTimestamp(new Reader(answer), digest);
      return { ots: serializeDetached({ digest, root }), calendar };
    } catch (err) {
      errors.push(`${calendar}: ${(err as Error).message}`);
    }
  }
  throw new GatewayError(`Aucun calendrier OpenTimestamps n'a répondu (${errors.join(' ; ')})`);
}

export interface UpgradeResult {
  ots: Buffer;
  changed: boolean;
  status: OtsStatus;
}

/** Asks each calendar for the Bitcoin attestation of its pending commitments. 404 = not yet in a block. */
export async function upgrade(ots: Buffer): Promise<UpgradeResult> {
  const file = parseDetached(ots);
  const pendings: { uri: string; node: TsNode }[] = [];
  walk(file.root, (n) => {
    for (const a of n.attestations) {
      if (a.tag.equals(TAG_PENDING)) pendings.push({ uri: new Reader(a.payload).varBytes().toString('utf8'), node: n });
    }
  });
  let changed = false;
  for (const p of pendings) {
    try {
      const res = await fetch(`${p.uri.replace(/\/$/, '')}/timestamp/${p.node.msg.toString('hex')}`, {
        headers: { Accept: OTS_ACCEPT, 'User-Agent': 'NobPay-prototype/0.1' },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status !== 200) continue; // still pending
      const upgraded = parseTimestamp(new Reader(Buffer.from(await res.arrayBuffer())), p.node.msg);
      mergeInto(p.node, upgraded);
      changed = true;
    } catch {
      /* calendar unreachable: keep the pending file */
    }
  }
  return { ots: changed ? serializeDetached(file) : ots, changed, status: inspect(file.root) };
}

export type BlockCheck = { state: 'verified'; time?: string } | { state: 'mismatch' } | { state: 'unavailable'; reason: string };

/**
 * Optional local cross-check of a Bitcoin attestation against a public block explorer:
 * the commitment must equal the block's merkle root (internal byte order = reversed display hex).
 */
export async function checkBitcoinBlock(height: number, commitmentHex: string): Promise<BlockCheck> {
  try {
    const hash = (await (await fetch(`https://blockstream.info/api/block-height/${height}`, { signal: AbortSignal.timeout(12_000) })).text()).trim();
    if (!/^[0-9a-f]{64}$/i.test(hash)) return { state: 'unavailable', reason: 'bloc introuvable' };
    const block = (await (await fetch(`https://blockstream.info/api/block/${hash}`, { signal: AbortSignal.timeout(12_000) })).json()) as {
      merkle_root: string;
      timestamp: number;
    };
    const internal = Buffer.from(block.merkle_root, 'hex').reverse().toString('hex');
    if (internal === commitmentHex.toLowerCase()) {
      return { state: 'verified', time: new Date(block.timestamp * 1000).toISOString() };
    }
    return { state: 'mismatch' };
  } catch (err) {
    return { state: 'unavailable', reason: (err as Error).message };
  }
}
