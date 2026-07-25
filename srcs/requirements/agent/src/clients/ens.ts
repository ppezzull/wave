// ENS client (resolve / text records). STUB — viem is installed, but the Sepolia
// Public Resolver + ERC-7930 / ENSIP-25 wiring is Flavio's ENS task
// (docs/tasks/Flavio.md L8-L15). Methods throw until wired.
const NOT_WIRED = "ens client not wired — Flavio's ENS task (docs/tasks/Flavio.md L8-L15)";

export const ens = {
  async resolve(name: string): Promise<`0x${string}` | null> {
    throw new Error(`${NOT_WIRED} [resolve ${name}]`);
  },
  async getTextRecord(name: string, key: string): Promise<string | null> {
    throw new Error(`${NOT_WIRED} [getTextRecord ${name}/${key}]`);
  },
};
