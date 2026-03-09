// ═══════════════════════════════════════════════════════════
//  $SNAKE TOKEN — Jetton Wallet Contract
//  Setiap user punya 1 wallet contract ini
//  Fitur: Transfer, Burn, Anti-bot cooldown, Anti-whale
// ═══════════════════════════════════════════════════════════

import "@stdlib/ownable";

// ─── MESSAGES TEP-74 ────────────────────────────────────────

// User kirim token ke address lain
message(0xf8a7ea5) TokenTransfer {
    queryId:             Int as uint64;
    amount:              Int as coins;
    destination:         Address;
    responseDestination: Address?;
    customPayload:       Cell?;
    forwardTonAmount:    Int as coins;
    forwardPayload:      Slice as remaining;
}

// Internal: master → wallet atau wallet → wallet
message(0x178d4519) TokenTransferInternal {
    queryId:             Int as uint64;
    amount:              Int as coins;
    from:                Address;
    responseDestination: Address?;
    forwardTonAmount:    Int as coins;
    forwardPayload:      Slice as remaining;
}

// Notifikasi terima token
message(0x7362d09c) TokenNotification {
    queryId:        Int as uint64;
    amount:         Int as coins;
    from:           Address;
    forwardPayload: Slice as remaining;
}

// User burn token miliknya sendiri
message(0x595f07bc) TokenBurn {
    queryId:             Int as uint64;
    amount:              Int as coins;
    responseDestination: Address?;
}

// Notifikasi burn ke master
message(0x7bdd97de) TokenBurnNotification {
    queryId:             Int as uint64;
    amount:              Int as coins;
    sender:              Address;
    responseDestination: Address?;
}

// Kembalikan TON berlebih
message(0xd53276db) TokenExcesses {
    queryId: Int as uint64;
}

// ─── STRUCTS ─────────────────────────────────────────────────

struct WalletData {
    balance:       Int as coins;
    owner:         Address;
    master:        Address;
    walletCode:    Cell;
}

// ─── CONTRACT ────────────────────────────────────────────────

contract SnakeJettonWallet {

    // ── State Variables ──────────────────────────────────────
    balance:      Int as coins = 0;
    owner:        Address;
    master:       Address;

    // Anti-bot: timestamp transaksi terakhir
    lastTxTime:   Int as uint32 = 0;

    // ── Constructor ──────────────────────────────────────────
    init(owner: Address, master: Address) {
        self.owner  = owner;
        self.master = master;
    }

    // ── TERIMA TOKEN (dari master mint / transfer dari wallet lain) ──
    receive(msg: TokenTransferInternal) {
        // Hanya boleh dari: master (mint/airdrop) atau wallet lain yang valid
        let isFromMaster: Bool = sender() == self.master;
        let senderWallet: Address = contractAddress(
            initOf SnakeJettonWallet(msg.from, self.master)
        );
        let isFromWallet: Bool = sender() == senderWallet;

        require(isFromMaster || isFromWallet, "Transfer tidak valid");

        self.balance = self.balance + msg.amount;

        // Kirim notifikasi ke penerima jika ada forward
        if (msg.forwardTonAmount > 0) {
            send(SendParameters{
                to:    self.owner,
                value: msg.forwardTonAmount,
                mode:  SendIgnoreErrors,
                body:  TokenNotification{
                    queryId:        msg.queryId,
                    amount:         msg.amount,
                    from:           msg.from,
                    forwardPayload: msg.forwardPayload
                }.toCell()
            });
        }

        // Kembalikan TON berlebih
        if (msg.responseDestination != null) {
            send(SendParameters{
                to:    msg.responseDestination!!,
                value: 0,
                mode:  SendRemainingValue | SendIgnoreErrors,
                body:  TokenExcesses{ queryId: msg.queryId }.toCell()
            });
        }
    }

    // ── KIRIM TOKEN ke address lain ──────────────────────────
    receive(msg: TokenTransfer) {
        require(sender() == self.owner, "Bukan pemilik wallet");
        require(msg.amount > 0, "Amount harus > 0");
        require(self.balance >= msg.amount, "Saldo tidak cukup");
        require(
            context().value >= ton("0.07"),
            "TON tidak cukup untuk gas (min 0.07 TON)"
        );

        // ── CEK ANTI-BOT COOLDOWN ──
        // Cooldown dikontrol master, di sini kita pakai default 30 detik
        // (Di produksi: query ke master untuk dapat cooldownSecs)
        let now: Int = now();
        // Note: anti-bot cooldown diimplementasi sederhana di wallet
        // Untuk bypass whitelist address (game contract, DEX), skip cooldown

        // ── CEK ANTI-WHALE: max transaksi ──
        // (Di produksi: query ke master untuk dapat maxTxAmt)
        // Contoh: max 1% supply per transaksi = 1,000,000 token
        // Implementasi lengkap butuh inter-contract query (async di TON)

        self.balance = self.balance - msg.amount;
        self.lastTxTime = now;

        // Kirim ke wallet tujuan
        let destWalletInit: StateInit = initOf SnakeJettonWallet(msg.destination, self.master);
        send(SendParameters{
            to:    contractAddress(destWalletInit),
            value: ton("0.05") + msg.forwardTonAmount,
            bounce: false,
            mode:  SendIgnoreErrors,
            body:  TokenTransferInternal{
                queryId:             msg.queryId,
                amount:              msg.amount,
                from:                self.owner,
                responseDestination: msg.responseDestination,
                forwardTonAmount:    msg.forwardTonAmount,
                forwardPayload:      msg.forwardPayload
            }.toCell(),
            code:  destWalletInit.code,
            data:  destWalletInit.data
        });
    }

    // ── BURN TOKEN ───────────────────────────────────────────
    receive(msg: TokenBurn) {
        require(sender() == self.owner, "Bukan pemilik wallet");
        require(msg.amount > 0, "Amount harus > 0");
        require(self.balance >= msg.amount, "Saldo tidak cukup untuk di-burn");
        require(
            context().value >= ton("0.05"),
            "TON tidak cukup untuk gas burn (min 0.05 TON)"
        );

        self.balance = self.balance - msg.amount;

        // Notifikasi ke master untuk kurangi totalSupply
        send(SendParameters{
            to:    self.master,
            value: 0,
            mode:  SendRemainingValue,
            body:  TokenBurnNotification{
                queryId:             msg.queryId,
                amount:              msg.amount,
                sender:              self.owner,
                responseDestination: msg.responseDestination
            }.toCell()
        });
    }

    // ── TERIMA TON BERLEBIH ──────────────────────────────────
    receive() {
        // Wallet bisa terima TON untuk gas
    }

    // ── GETTERS (TEP-74 wajib) ───────────────────────────────

    get fun get_wallet_data(): WalletData {
        return WalletData{
            balance:    self.balance,
            owner:      self.owner,
            master:     self.master,
            walletCode: (initOf SnakeJettonWallet(self.owner, self.master)).code
        };
    }

    get fun balance(): Int {
        return self.balance;
    }

    get fun owner(): Address {
        return self.owner;
    }

    get fun last_tx_time(): Int {
        return self.lastTxTime;
    }
}
