// ERC-7930 interoperable-address encoder — the ONE genuinely-unknown-cost item on the ENS
// path (Flavio.md L9). Hand-rolled (~15 lines, no dep/version risk): binds a (chain,
// address) pair into a compact binary blob, required ONLY for the ENSIP-25 key's
// `<registry>` field. Spec: docs/strategy/ENS-PATH.md §3 (layout + worked examples).
//
// Layout (EIP-7930): uint16BE(version=1) | uint16BE(chainType=0 EVM) | uint8(refLen) |
//   chainRef (minimal big-endian chainId, per CAIP-350) | uint8(addrLen=20) | address
import { bytesToHex, concatHex, numberToBytes, numberToHex, size } from "viem";

/**
 * Encode a (chainId, address) pair as an ERC-7930 interoperable address.
 * `chainRef` is the MINIMAL big-endian chainId (leading zero BYTES stripped): chain 1 →
 * 0x01, Sepolia 11155111 → 0xaa36a7. NB: must be whole bytes (even nibbles) — using
 * numberToBytes (not numberToHex) avoids the half-byte shift that misaligns the address
 * for odd-nibble chainIds like chain 1.
 */
export function erc7930(chainId: number, address: `0x${string}`): `0x${string}` {
  const version = numberToHex(1, { size: 2 }); // 0x0001
  const chainType = numberToHex(0, { size: 2 }); // 0x0000 (EVM / CASA namespace)
  const chainRef = bytesToHex(numberToBytes(chainId)); // minimal BE bytes (always even nibbles)
  const refLen = numberToHex(size(chainRef), { size: 1 }); // uint8 length of chainRef
  const addrLen = numberToHex(20, { size: 1 }); // uint8 (EVM address = 20 bytes)
  // Lowercase: a binary blob's hex is conventionally lowercase, and the value appears in
  // the ENSIP-25 key string — case-deterministic so two callers (any input case) agree.
  return concatHex([version, chainType, refLen, chainRef, addrLen, address]).toLowerCase() as `0x${string}`;
}

/**
 * The ENSIP-25 attestation key: `agent-registration[<erc7930 registry>][<agentId>]`.
 * `<registry>` = the ERC-7930-encoded EnsStrategyRouter; `<agentId>` = the strategyId
 * (bytes32 hex — no brackets, so valid). Value SHOULD be "1" (presence-based attestation).
 * Spec: ENSIP-25 (docs/strategy/ENS-PATH.md §2).
 */
export function ensip25Key(registryErc7930: `0x${string}`, strategyId: string): string {
  if (/[[\]]/.test(strategyId)) {
    throw new Error(`[erc7930] strategyId must not contain '[' or ']' (ENSIP-25): ${strategyId}`);
  }
  return `agent-registration[${registryErc7930}][${strategyId}]`;
}
