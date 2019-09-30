const Nimiq = require('@nimiq/core');
const Miner = require('./Miner');

const SHARE_WATCHDOG_INTERVAL = 180; // seconds
const SHARE_WATCHDOG_MAX_REJECTS = 10;

class NanoPoolMiner extends Nimiq.NanoPoolMiner {

    constructor(type, blockchain, time, address, deviceId, deviceData, deviceOptions) {
        super(blockchain, time, address, deviceId, deviceData);

        this._sharesFound = 0;
        this._rejectedShares = 0;

        this._miner = new Miner(type, deviceOptions);
        this._miner.on('share', nonce => {
            this._submitShare(nonce);
        });
        this._miner.on('hashrate-changed', hashrates => {
            this.fire('hashrate-changed', hashrates);
        });
    }

    _startMining() {
        const block = this.getNextBlock();
        if (!block) {
            return;
        }
        this._block = block;

        Nimiq.Log.i(NanoPoolMiner, `Starting work on block #${block.height}`);
        this._miner.startMiningOnBlock(block.header.serialize());

        if (!this._shareWatchDog) {
            this._shareWatchDog = setInterval(() => this._checkShares(), 1000 * SHARE_WATCHDOG_INTERVAL);
        }
    }

    _stopMining() {
        this._miner.stop();
        if (this._shareWatchDog) {
            clearInterval(this._shareWatchDog);
            delete this._shareWatchDog;
        }
    }

    _register() {
        this._send({
            message: 'register',
            mode: this.mode,
            address: this._ourAddress.toUserFriendlyAddress(),
            deviceId: this._deviceId,
            startDifficulty: this._deviceData.startDifficulty,
            deviceName: this._deviceData.deviceName,
            deviceData: this._deviceData,
            minerVersion: this._deviceData.minerVersion,
            genesisHash: Nimiq.BufferUtils.toBase64(Nimiq.GenesisConfig.GENESIS_HASH.serialize())
        });
    }

    _onNewPoolSettings(address, extraData, shareCompact, nonce) {
        super._onNewPoolSettings(address, extraData, shareCompact, nonce);
        if (Nimiq.BlockUtils.isValidCompact(shareCompact)) {
            const difficulty = Nimiq.BlockUtils.compactToDifficulty(shareCompact);
            Nimiq.Log.i(NanoPoolMiner, `Set share difficulty: ${difficulty.toFixed(2)} (${shareCompact.toString(16)})`);
            this._miner.setShareCompact(shareCompact);
        } else {
            Nimiq.Log.w(NanoPoolMiner, `Pool sent invalid target: ${shareCompact}`);
        }
    }

    async _handleNewBlock(msg) {
        await super._handleNewBlock(msg);
        this._startMining();
    }

    async _submitShare(nonce) {
        const blockHeader = this._block.header.serialize();
        blockHeader.writePos -= 4;
        blockHeader.writeUint32(nonce);
        const hash = await (await Nimiq.CryptoWorker.getInstanceAsync()).computeArgon2d(blockHeader);
        this.onWorkerShare({
            block: this._block,
            nonce,
            hash: new Nimiq.Hash(hash)
        });
    }

    _onMessage(ws, msgJson) {
        super._onMessage(ws, msgJson);
        try {
            const msg = JSON.parse(msgJson);
            if (msg && msg.message === 'error') {
                this._rejectedShares++;
            }
        } catch (e) {
        }
    }

    _onBlockMined(block) {
        super._onBlockMined(block);
        this._sharesFound++;
    }

    _checkShares() {
        const sharesFound = this._sharesFound;
        const rejectedShares = this._rejectedShares;
        this._sharesFound = 0;
        this._rejectedShares = 0;
        Nimiq.Log.d(NanoPoolMiner, `Shares found since the last check: ${sharesFound}`);
        if (sharesFound === 0) {
            Nimiq.Log.w(NanoPoolMiner, `No shares have been found for the last ${SHARE_WATCHDOG_INTERVAL} seconds. Reconnecting.`);
            this._timeoutReconnect();
            return;
        }
        if (rejectedShares >= SHARE_WATCHDOG_MAX_REJECTS) {
            Nimiq.Log.w(NanoPoolMiner, `Too many errors for the last ${SHARE_WATCHDOG_INTERVAL} seconds. Reconnecting.`);
            this._timeoutReconnect();
            return;
        }
    }

    _turnPoolOff() {
        super._turnPoolOff();
        this._stopMining();
    }
}

module.exports = NanoPoolMiner;
