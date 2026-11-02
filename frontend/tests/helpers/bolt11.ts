import { bech32 } from '@scure/base';

/**
 * Builds a structurally valid BOLT11 invoice for tests (correct bech32, tags and checksum; the signature is zeros, which
 * the decoder never checks and a test wallet never verifies). NEVER usable on a real network.
 */
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const HRP_NETWORK = { mainnet: 'bc', testnet: 'tb', signet: 'tbs', regtest: 'bcrt' } as const;

const toWords5 = (n: number, count: number) => {
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(Math.floor(n / 32 ** i) % 32);
  return out;
};
const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const tag = (letter: string, words: number[]) => [CHARSET.indexOf(letter), ...toWords5(words.length, 2), ...words];

export interface TestInvoice {
  amountMsat?: bigint;
  paymentHash: string;
  description?: string;
  descriptionHash?: string;
  expiry?: number;
  timestamp?: number;
  network?: keyof typeof HRP_NETWORK;
}

export function encodeBolt11(i: TestInvoice): string {
  let amount = '';
  if (i.amountMsat !== undefined) {
    const pico = i.amountMsat * 10n;
    const unit = ([['m', 1_000_000_000n], ['u', 1_000_000n], ['n', 1_000n], ['p', 1n]] as const).find(([, v]) => pico % v === 0n)!;
    amount = `${pico / unit[1]}${unit[0]}`;
  }
  const hrp = `ln${HRP_NETWORK[i.network ?? 'mainnet']}${amount}`;
  const words: number[] = [...toWords5(i.timestamp ?? Math.floor(Date.now() / 1000), 7)];
  words.push(...tag('p', bech32.toWords(hexBytes(i.paymentHash))));
  if (i.description !== undefined) words.push(...tag('d', bech32.toWords(new TextEncoder().encode(i.description))));
  if (i.descriptionHash) words.push(...tag('h', bech32.toWords(hexBytes(i.descriptionHash))));
  if (i.expiry !== undefined) {
    const w: number[] = [];
    for (let v = i.expiry; v > 0; v = Math.floor(v / 32)) w.unshift(v % 32);
    words.push(...tag('x', w.length ? w : [0]));
  }
  words.push(...new Array(104).fill(0)); // signature + recovery id
  return bech32.encode(hrp, words, 8192);
}
