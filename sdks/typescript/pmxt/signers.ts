/**
 * Signer helpers for hosted PMXT trading.
 *
 * `ethers` is an optional peer dependency — read-only SDK users do not need it
 * installed. Hosted-mode signing imports it lazily via `require()` and throws
 * a clear install hint when it's missing.
 *
 * Mirrors `sdks/python/pmxt/signers.py`.
 */

/**
 * EIP-712 typed data payload as accepted by ethers v6 / Web3 wallets.
 * `EIP712Domain` is allowed inside `types` (and is the standard) but ethers
 * strips it before signing — see {@link EthersSigner.signTypedData}.
 */
export interface TypedData {
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
    };
    message: Record<string, unknown>;
}

/**
 * Pluggable signer abstraction. Implement this to integrate hardware wallets
 * or remote signing services. {@link EthersSigner} is the built-in
 * private-key implementation.
 */
export interface Signer {
    readonly address: string;
    signTypedData(typedData: TypedData): Promise<string>;
}

const ETHERS_INSTALL_HINT =
    "hosted trading requires the optional 'ethers' peer dependency. Install with: npm install ethers";

/**
 * Load ethers lazily in BOTH module systems. The CJS build has native
 * `require`; the ESM build does not — bare `require("ethers")` there threw
 * ReferenceError, which callers swallowed, silently dropping the signer and
 * killing every hosted write with "hosted write requires a signer".
 */
export function loadEthers(installHint: string = ETHERS_INSTALL_HINT): any {
    if (typeof require === "function") {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require("ethers");
        } catch {
            throw new Error(installHint);
        }
    }
    // ESM: synthesize a require. getBuiltinModule is sync-safe in both
    // module systems (Node >= 20.16).
    const nodeModule = (globalThis as any).process?.getBuiltinModule?.("node:module");
    const req = nodeModule?.createRequire?.(`${process.cwd()}/__pmxt_resolver__.js`);
    if (!req) throw new Error(installHint);
    try {
        return req("ethers");
    } catch {
        throw new Error(installHint);
    }
}

/**
 * Built-in signer backed by an ethers `Wallet`.
 *
 * `ethers` is imported lazily — a clear, install-hint-bearing error is thrown
 * if the peer dependency is missing.
 */
export class EthersSigner implements Signer {
    private readonly _wallet: any; // ethers.Wallet
    readonly address: string;

    constructor(privateKey: string) {
        const ethers = loadEthers();
        this._wallet = new ethers.Wallet(privateKey);
        this.address = this._wallet.address;
    }

    async signTypedData(typedData: TypedData): Promise<string> {
        // ethers expects `types` WITHOUT the EIP712Domain entry — it derives
        // the domain hash from the `domain` argument.
        const types = { ...typedData.types };
        delete types["EIP712Domain"];
        const sig: string = await this._wallet.signTypedData(
            typedData.domain,
            types,
            typedData.message,
        );
        return sig.startsWith("0x") ? sig : "0x" + sig;
    }
}

/**
 * Convenience factory: build a {@link Signer} from a raw private key.
 *
 * Currently always returns an {@link EthersSigner}. Async for forward
 * compatibility with key-loaders that may need to await (e.g. keystore
 * decryption).
 */
export async function signerFromPrivateKey(privateKey: string): Promise<Signer> {
    return new EthersSigner(privateKey);
}
