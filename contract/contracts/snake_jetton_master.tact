// ═══════════════════════════════════════════════════════════
//  $SNAKE TOKEN — Jetton Master Contract
//  Standard  : TEP-74 + TEP-89 (Discoverable Jettons)
//  Language  : Tact v1.x
//  Network   : TON Blockchain
//  Supply    : 100,000,000 $SNAKE (100 Juta)
//  Author    : SnakeChain Team
// ═══════════════════════════════════════════════════════════

import "@stdlib/deploy";
import "@stdlib/ownable";
import "./snake_jetton_wallet.tact";

// ─── MESSAGES ───────────────────────────────────────────────

// Owner mint token ke address tertentu
message Mint {
    amount:   Int as coins;
    receiver: Address;
}

// Batch airdrop ke banyak address sekaligus
message BatchAirdrop {
    receivers: map<Int, Address>;   // index → address
    amounts:   map<Int, Int>;       // index → amount (nano)
    count:     Int as uint16;       // jumlah penerima
}

// Update batas anti-whale
message UpdateLimits {
    maxWalletPct:  Int as uint8;    // % dari total supply (mis: 2 = 2%)
    maxTxPct:      Int as uint8;    // % dari total supply per transaksi
    cooldownSecs:  Int as uint32;   // cooldown antar transaksi (detik)
}

// Blacklist / whitelist address (anti-bot)
message SetBlacklist {
    target:      Address;
    blacklisted: Bool;
}

// Whitelist address (bypass anti-whale)
message SetWhitelist {
    target:     Address;
    whitelisted: Bool;
}

// Pause / unpause contract
message SetPause {
    paused: Bool;
}

// Update metadata token
message UpdateContent {
    content: Cell;
}

// TEP-74: Notifikasi burn dari wallet
message(0x7bdd97de) TokenBurnNotification {
    queryId:             Int as uint64;
    amount:              Int as coins;
    sender:              Address;
    responseDestination: Address?;
}

// TEP-74: Kembalikan TON berlebih
message(0xd53276db) TokenExcesses {
    queryId: Int as uint64;
}

// ─── STRUCTS ─────────────────────────────────────────────────

struct JettonMasterState {
    totalSupply:  Int as coins;
    mintable:     Bool;
    owner:        Address;
    content:      Cell;
}

// ─── CONTRACT ────────────────────────────────────────────────

contract SnakeJettonMaster with Deployable, Ownable {

    // ── State Variables ──────────────────────────────────────
    totalSupply:   Int as coins = 0;
    mintable:      Bool         = true;
    owner:         Address;
    content:       Cell;

    // Anti-whale & anti-bot settings
    paused:        Bool         = false;
    maxWalletAmt:  Int as coins;        // max token per wallet
    maxTxAmt:      Int as coins;        // max token per transaksi
    cooldownSecs:  Int as uint32 = 30;  // 30 detik cooldown default

    // Blacklist & whitelist maps
    blacklist:     map<Address, Bool>;
    whitelist:     map<Address, Bool>;  // bypass anti-whale

    // Tracking total burn
    totalBurned:   Int as coins = 0;

    // Konstanta supply
    const MAX_SUPPLY: Int = ton("100000000"); // 100 Juta $SNAKE

    // ── Constructor ──────────────────────────────────────────
    init(owner: Address, content: Cell) {
        self.owner        = owner;
        self.content      = content;
        // Default: max wallet 2% supply = 2 juta token
        self.maxWalletAmt = self.MAX_SUPPLY / 50;
        // Default: max tx 1% supply = 1 juta token
        self.maxTxAmt     = self.MAX_SUPPLY / 100;
        // Owner selalu whitelist
        self.whitelist.set(owner, true);
    }

    // ── MINT ─────────────────────────────────────────────────
    receive(msg: Mint) {
        self.requireOwner();
        require(!self.paused, "Contract sedang di-pause");
        require(self.mintable, "Minting sudah ditutup");
        require(msg.amount > 0, "Amount harus > 0");
        require(
            self.totalSupply + msg.amount <= self.MAX_SUPPLY,
            "Melebihi max supply 100 juta"
        );

        self.totalSupply = self.totalSupply + msg.amount;

        // Deploy / kirim ke jetton wallet penerima
        let winit: StateInit = initOf SnakeJettonWallet(msg.receiver, myAddress());
        send(SendParameters{
            to:    contractAddress(winit),
            value: ton("0.05"),
            bounce: false,
            mode:  SendIgnoreErrors,
            body:  TokenTransferInternal{
                queryId:             0,
                amount:              msg.amount,
                from:                myAddress(),
                responseDestination: self.owner,
                forwardTonAmount:    0,
                forwardPayload:      emptySlice()
            }.toCell(),
            code:  winit.code,
            data:  winit.data
        });
    }

    // ── BATCH AIRDROP ────────────────────────────────────────
    receive(msg: BatchAirdrop) {
        self.requireOwner();
        require(!self.paused, "Contract sedang di-pause");
        require(self.mintable, "Minting sudah ditutup");
        require(msg.count > 0 && msg.count <= 250, "Count: 1-250");

        let i: Int = 0;
        let totalAirdrop: Int = 0;

        // Hitung total dulu
        repeat(msg.count) {
            let amt: Int? = msg.amounts.get(i);
            if (amt != null) {
                totalAirdrop = totalAirdrop + amt!!;
            }
            i = i + 1;
        }

        require(
            self.totalSupply + totalAirdrop <= self.MAX_SUPPLY,
            "Airdrop melebihi max supply"
        );

        // Distribusi
        i = 0;
        repeat(msg.count) {
            let receiver: Address? = msg.receivers.get(i);
            let amount: Int?       = msg.amounts.get(i);

            if (receiver != null && amount != null && amount!! > 0) {
                self.totalSupply = self.totalSupply + amount!!;

                let winit: StateInit = initOf SnakeJettonWallet(receiver!!, myAddress());
                send(SendParameters{
                    to:    contractAddress(winit),
                    value: ton("0.05"),
                    bounce: false,
                    mode:  SendIgnoreErrors,
                    body:  TokenTransferInternal{
                        queryId:             0,
                        amount:              amount!!,
                        from:               myAddress(),
                        responseDestination: self.owner,
                        forwardTonAmount:    0,
                        forwardPayload:      emptySlice()
                    }.toCell(),
                    code:  winit.code,
                    data:  winit.data
                });
            }
            i = i + 1;
        }
    }

    // ── BURN NOTIFICATION (dari wallet) ──────────────────────
    receive(msg: TokenBurnNotification) {
        // Verifikasi pengirim adalah jetton wallet yang valid
        let senderWallet: Address = contractAddress(
            initOf SnakeJettonWallet(msg.sender, myAddress())
        );
        require(sender() == senderWallet, "Bukan jetton wallet yang valid");

        self.totalSupply = self.totalSupply - msg.amount;
        self.totalBurned = self.totalBurned + msg.amount;

        // Kembalikan TON berlebih ke pengirim
        if (msg.responseDestination != null) {
            send(SendParameters{
                to:    msg.responseDestination!!,
                value: 0,
                mode:  SendRemainingValue | SendIgnoreErrors,
                body:  TokenExcesses{ queryId: msg.queryId }.toCell()
            });
        }
    }

    // ── ANTI-WHALE SETTINGS ──────────────────────────────────
    receive(msg: UpdateLimits) {
        self.requireOwner();
        require(msg.maxWalletPct >= 1 && msg.maxWalletPct <= 100, "maxWallet: 1-100%");
        require(msg.maxTxPct >= 1 && msg.maxTxPct <= 100, "maxTx: 1-100%");
        self.maxWalletAmt  = (self.MAX_SUPPLY * msg.maxWalletPct) / 100;
        self.maxTxAmt      = (self.MAX_SUPPLY * msg.maxTxPct) / 100;
        self.cooldownSecs  = msg.cooldownSecs;
    }

    // ── BLACKLIST (Anti-bot) ──────────────────────────────────
    receive(msg: SetBlacklist) {
        self.requireOwner();
        require(msg.target != self.owner, "Tidak bisa blacklist owner");
        if (msg.blacklisted) {
            self.blacklist.set(msg.target, true);
        } else {
            self.blacklist.del(msg.target);
        }
    }

    // ── WHITELIST ────────────────────────────────────────────
    receive(msg: SetWhitelist) {
        self.requireOwner();
        if (msg.whitelisted) {
            self.whitelist.set(msg.target, true);
        } else {
            self.whitelist.del(msg.target);
        }
    }

    // ── PAUSE ────────────────────────────────────────────────
    receive(msg: SetPause) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    // ── STOP MINTING SELAMANYA ────────────────────────────────
    receive("stop_mint") {
        self.requireOwner();
        self.mintable = false;
    }

    // ── UPDATE METADATA ──────────────────────────────────────
    receive(msg: UpdateContent) {
        self.requireOwner();
        self.content = msg.content;
    }

    // ── TON BERLEBIH ─────────────────────────────────────────
    receive() {
        // Terima TON untuk gas fee airdrop
    }

    // ── GETTERS (TEP-74 wajib) ───────────────────────────────

    get fun get_jetton_data(): JettonMasterState {
        return JettonMasterState{
            totalSupply: self.totalSupply,
            mintable:    self.mintable,
            owner:       self.owner,
            content:     self.content
        };
    }

    get fun get_wallet_address(owner: Address): Address {
        return contractAddress(initOf SnakeJettonWallet(owner, myAddress()));
    }

    get fun get_total_burned(): Int {
        return self.totalBurned;
    }

    get fun get_max_supply(): Int {
        return self.MAX_SUPPLY;
    }

    get fun get_max_wallet(): Int {
        return self.maxWalletAmt;
    }

    get fun get_max_tx(): Int {
        return self.maxTxAmt;
    }

    get fun is_blacklisted(addr: Address): Bool {
        return self.blacklist.get(addr) == true;
    }

    get fun is_whitelisted(addr: Address): Bool {
        return self.whitelist.get(addr) == true;
    }

    get fun is_paused(): Bool {
        return self.paused;
    }

    get fun circulating_supply(): Int {
        return self.totalSupply - self.totalBurned;
    }
}
