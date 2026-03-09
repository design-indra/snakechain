// ═══════════════════════════════════════════════════════════
//  Deploy Script — $SNAKE Token
//  Jalankan: npx blueprint run deploySnake --network mainnet
// ═══════════════════════════════════════════════════════════

import { toNano, beginCell, Address } from "@ton/core";
import { SnakeJettonMaster } from "../wrappers/SnakeJettonMaster";
import { NetworkProvider } from "@ton/blueprint";

// ─── KONFIGURASI TOKEN ────────────────────────────────────────
const TOKEN_CONFIG = {
    name:        "$SNAKE",
    description: "Official token of SnakeChain — Play to Earn game on TON",
    symbol:      "SNAKE",
    decimals:    9,
    image:       "https://snakeminiapp.vercel.app/snake_logo.png",
    // Social links
    social: {
        telegram: "https://t.me/SnakeChainOfficial",
        website:  "https://snakeminiapp.vercel.app",
    }
};

// ─── BUILD METADATA CELL (TEP-64) ────────────────────────────
function buildMetadataCell(): any {
    // Off-chain metadata (URL ke JSON)
    const metadataUrl = "https://snakeminiapp.vercel.app/snake_metadata.json";
    return beginCell()
        .storeUint(0x01, 8)            // off-chain flag
        .storeStringTail(metadataUrl)
        .endCell();
}

// ─── DEPLOY ───────────────────────────────────────────────────
export async function run(provider: NetworkProvider) {
    const deployer = provider.sender();
    const deployerAddr = deployer.address!;

    console.log("═══════════════════════════════════════════");
    console.log("  Deploying $SNAKE Jetton Master Contract");
    console.log("═══════════════════════════════════════════");
    console.log("Deployer:", deployerAddr.toString());
    console.log("Network:", provider.network());

    const content = buildMetadataCell();

    const master = provider.open(
        await SnakeJettonMaster.fromInit(deployerAddr, content)
    );

    const contractAddr = master.address;
    console.log("\n✅ Contract Address:", contractAddr.toString());
    console.log("   (Simpan address ini!)\n");

    // Deploy contract
    await master.send(
        deployer,
        { value: toNano("0.5") },   // 0.5 TON untuk deploy + gas
        { $$type: "Deploy", queryId: 0n }
    );

    await provider.waitForDeploy(master.address);
    console.log("✅ Contract berhasil di-deploy!\n");

    // ── INITIAL MINT: Play to Earn allocation (40%) ──────────
    console.log("Minting Play-to-Earn allocation (40%)...");
    const P2E_AMOUNT = toNano("40000000"); // 40 juta $SNAKE
    await master.send(
        deployer,
        { value: toNano("0.1") },
        {
            $$type: "Mint",
            amount: P2E_AMOUNT,
            receiver: deployerAddr,  // Ganti dengan game treasury wallet
        }
    );
    console.log("✅ 40,000,000 $SNAKE di-mint ke P2E treasury\n");

    // ── WHITELIST GAME CONTRACT ──────────────────────────────
    // Uncomment dan ganti dengan address game backend wallet
    // await master.send(deployer, { value: toNano("0.05") }, {
    //     $$type: "SetWhitelist",
    //     target: Address.parse("GAME_CONTRACT_ADDRESS"),
    //     whitelisted: true,
    // });

    console.log("═══════════════════════════════════════════");
    console.log("  DEPLOYMENT SELESAI!");
    console.log("═══════════════════════════════════════════");
    console.log("Contract  :", contractAddr.toString());
    console.log("Explorer  : https://tonviewer.com/" + contractAddr.toString());
    console.log("Token     : $SNAKE | Supply: 100,000,000");
    console.log("\nLangkah selanjutnya:");
    console.log("1. Verifikasi contract di tonviewer.com");
    console.log("2. Upload metadata JSON ke URL yang sudah diset");
    console.log("3. Tambahkan liquidity di STON.fi atau DeDust");
    console.log("4. Update API backend dengan contract address");
}
