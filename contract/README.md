# 🐍 $SNAKE Token — Smart Contract

Token resmi **SnakeChain** di **TON Blockchain**

---

## 📋 Info Token

| Field          | Value                          |
|----------------|-------------------------------|
| Nama           | SnakeChain Token               |
| Symbol         | $SNAKE                         |
| Total Supply   | 100,000,000 (100 Juta)         |
| Decimals       | 9                              |
| Blockchain     | TON                            |
| Standard       | TEP-74 Jetton + TEP-89         |
| Bahasa         | Tact v1.x                      |

---

## 🥧 Distribusi Token

| Alokasi             | %    | Jumlah        |
|---------------------|------|---------------|
| Play to Earn        | 40%  | 40,000,000    |
| Airdrop & Community | 20%  | 20,000,000    |
| Liquidity Pool      | 15%  | 15,000,000    |
| Tim & Dev           | 15%  | 15,000,000    |
| Marketing           | 10%  | 10,000,000    |

---

## 🔒 Fitur Smart Contract

### ✅ TEP-74 Jetton Standard
- Kompatibel dengan semua TON wallet (Tonkeeper, MyTonWallet)
- Listing di DEX: STON.fi & DeDust
- Listing di explorer: TONViewer, Tonscan

### 🔥 Mint & Burn
- Owner bisa mint token (sampai max supply 100 juta)
- Siapapun bisa burn token milik sendiri
- `stop_mint` untuk tutup minting selamanya (setelah TGE)

### 🪂 Batch Airdrop
- Distribusi ke 250 address sekaligus dalam 1 transaksi
- Efisien untuk snapshot & airdrop massal

### 🐳 Anti-Whale
- `maxWalletAmt`: batas maksimum token per wallet (default 2%)
- `maxTxAmt`: batas per transaksi (default 1%)
- Whitelist untuk: game contract, DEX, team wallet

### 🤖 Anti-Bot
- Blacklist address mencurigakan
- Cooldown 30 detik antar transaksi (configurable)
- Owner bisa blacklist/whitelist kapanpun

### ⏸️ Emergency Pause
- Owner bisa pause semua aktivitas mint/transfer
- Untuk keadaan darurat atau upgrade

---

## 🚀 Cara Deploy

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Contract
```bash
npm run build
# Output di: build/SnakeJettonMaster.compiled.json
```

### 3. Setup Wallet
Buat file `.env`:
```env
DEPLOYER_MNEMONIC="word1 word2 word3 ... word24"
```

### 4. Deploy ke Testnet Dulu
```bash
npm run deploy -- --network testnet
```

### 5. Deploy ke Mainnet
```bash
npm run deploy -- --network mainnet
```

### 6. Simpan Contract Address
```
Contract Address: EQ...
Explorer: https://tonviewer.com/EQ...
```

---

## 📁 Struktur File

```
snake-contract/
├── contracts/
│   ├── snake_jetton_master.tact    ← Contract utama (mint, airdrop, anti-whale)
│   └── snake_jetton_wallet.tact    ← Wallet tiap user (transfer, burn)
├── scripts/
│   └── deploySnake.ts              ← Script deploy
├── tests/
│   └── (tambahkan test di sini)
├── snake_metadata.json             ← Metadata token (upload ke server)
└── package.json
```

---

## 🔧 Fungsi Penting

### Mint Token (owner only)
```typescript
await master.send(deployer, { value: toNano("0.1") }, {
    $$type: "Mint",
    amount: toNano("1000"),   // 1000 $SNAKE
    receiver: Address.parse("RECEIVER_ADDRESS"),
});
```

### Batch Airdrop (owner only, max 250 address)
```typescript
const receivers = new Map<bigint, Address>();
const amounts   = new Map<bigint, bigint>();
receivers.set(0n, Address.parse("ADDR1"));
amounts.set(0n, toNano("100"));   // 100 $SNAKE
receivers.set(1n, Address.parse("ADDR2"));
amounts.set(1n, toNano("50"));    // 50 $SNAKE

await master.send(deployer, { value: toNano("0.5") }, {
    $$type: "BatchAirdrop",
    receivers, amounts,
    count: 2n,
});
```

### Blacklist Address
```typescript
await master.send(deployer, { value: toNano("0.05") }, {
    $$type: "SetBlacklist",
    target: Address.parse("BOT_ADDRESS"),
    blacklisted: true,
});
```

### Update Anti-Whale Limit
```typescript
await master.send(deployer, { value: toNano("0.05") }, {
    $$type: "UpdateLimits",
    maxWalletPct:  2n,    // max 2% supply per wallet
    maxTxPct:      1n,    // max 1% supply per tx
    cooldownSecs:  30n,   // 30 detik cooldown
});
```

### Stop Minting Selamanya (hati-hati, tidak bisa dibatalkan!)
```typescript
await master.send(deployer, { value: toNano("0.05") }, "stop_mint");
```

---

## 🔗 Langkah Setelah Deploy

1. **Upload metadata** → `snake_metadata.json` ke URL server kamu
2. **Verifikasi** di [tonviewer.com](https://tonviewer.com)
3. **Add Liquidity** di [STON.fi](https://ston.fi) atau [DeDust.io](https://dedust.io)
4. **Update backend** dengan contract address baru:
   ```env
   SNAKE_CONTRACT=EQ...
   ```
5. **Mint** alokasi sesuai tokenomics
6. **Submit** ke CoinMarketCap & CoinGecko

---

## ⚠️ Keamanan

- **Simpan mnemonic deployer wallet dengan aman!**
- Test di testnet sebelum mainnet
- Audit contract sebelum listing resmi
- Gunakan multisig untuk owner wallet di produksi

---

*SnakeChain Team — Built on TON 🐍*
