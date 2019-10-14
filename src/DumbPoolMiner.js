const os = require('os');
const crypto = require('crypto');
const Nimiq = require('@nimiq/core');
const Miner = require('./Miner');
const WebSocket = require('ws');

class DumbPoolMiner extends Nimiq.Observable {

    constructor(type, address, deviceData, deviceOptions) {
        super();

        this._address = address;
        this._deviceId = this._getDeviceId();
        this._deviceData = deviceData;

        this._miner = new Miner(type, deviceOptions);
        this._miner.on('share', nonce => {
            this._submitShare(nonce);
        });
        this._miner.on('hashrate-changed', hashrates => {
            this.fire('hashrate-changed', hashrates);
        });
    }

    _getDeviceId() {
        const hostInfo = os.hostname() + '/' + Object.values(os.networkInterfaces()).map(i => i.map(a => a.address + '/' + a.mac).join('/')).join('/');
        const hash = crypto.createHash('sha256');
        hash.update(hostInfo);
        return hash.digest().readUInt32LE(0);
    }

    connect(host, port) {
        Nimiq.Log.i(DumbPoolMiner, `Connecting to ${host}:${port}`);
        this._host = host;
        this._closed = false;
        this._ws = new WebSocket(`wss://${host}:${port}`);

        this._ws.on('open', () => {
            this._register();
        });

        this._ws.on('close', (code, reason) => {
            let timeout = Math.floor(Math.random() * 25) + 5;
            Nimiq.Log.w(DumbPoolMiner, `Connection lost. Reconnecting in ${timeout} seconds to ${this._host}`);
            this._stopMining();
            if (!this._closed) {
                setTimeout(() => {
                    this.connect(this._host, port);
                }, timeout * 1000);
            }
        });

        this._ws.on('message', (msg) => this._onMessage(JSON.parse(msg)));

        this._ws.on('error', (e) => Nimiq.Log.e(DumbPoolMiner, `WS error - ${e.message}`, e));
    }

    disconnect() {
        this._closed = true;
        this._ws.close();
    }

    _register() {
        Nimiq.Log.i(DumbPoolMiner, `Registering to pool (${this._host}) using device id ${this._deviceId} (${this._deviceData.deviceName}) as a dumb client.`);
        this._send({
            message: 'register',
            mode: 'dumb',
            address: this._address.toUserFriendlyAddress(),
            deviceId: this._deviceId,
            startDifficulty: this._deviceData.startDifficulty,
            deviceName: this._deviceData.deviceName,
            deviceData: this._deviceData,
            minerVersion: this._deviceData.minerVersion,
            genesisHash: Nimiq.GenesisConfig.GENESIS_HASH.toBase64()
        });
    }

    _onMessage(msg) {
        if (!msg || !msg.message) return;
        switch (msg.message) {
            case 'registered':
                Nimiq.Log.i(DumbPoolMiner, 'Connected to pool');
                break;
            case 'settings':
                this._onNewPoolSettings(msg.address, Buffer.from(msg.extraData, 'base64'), msg.targetCompact, msg.nonce);
                break;
            case 'balance':
                this._onBalance(msg.balance, msg.confirmedBalance);
                break;
            case 'new-block':
                this._onNewBlock(Nimiq.BlockHeader.unserialize(Nimiq.BufferUtils.fromBase64(msg.blockHeader)));
                break;
            case 'error':
                Nimiq.Log.w(DumbPoolMiner, `Pool error: ${msg.reason}`);
                break;
        }
    }

    _startMining() {
        Nimiq.Log.i(DumbPoolMiner, `Starting work on block #${this._currentBlockHeader.height}`);
        this._miner.startMiningOnBlock(this._currentBlockHeader.serialize());
    }

    _stopMining() {
        this._miner.stop();
        delete this._currentBlockHeader;
    }

    _onNewPoolSettings(address, extraData, shareCompact, nonce) {
        const difficulty = Nimiq.BlockUtils.compactToDifficulty(shareCompact);
        Nimiq.Log.i(DumbPoolMiner, `Set share difficulty: ${difficulty.toFixed(2)} (${shareCompact.toString(16)})`);
        this._miner.setShareCompact(shareCompact);
    }

    _onBalance(balance, confirmedBalance) {
        Nimiq.Log.i(DumbPoolMiner, `Balance: ${Nimiq.Policy.lunasToCoins(balance)} NIM, confirmed balance: ${Nimiq.Policy.lunasToCoins(confirmedBalance)} NIM`);
    }

    _onNewBlock(blockHeader) {
        // Workaround duplicated blocks
        if (this._currentBlockHeader != undefined && this._currentBlockHeader.equals(blockHeader)) {
            Nimiq.Log.w(DumbPoolMiner, 'The same block appears once again!');
            return;
        }

        this._currentBlockHeader = blockHeader;
        this._startMining();
    }

    _submitShare(nonce) {
        this._send({
            message: 'share',
            nonce
        });
        this.fire('share', nonce);
    }

    _send(msg) {
        try {
            this._ws.send(JSON.stringify(msg));
        } catch (e) {
            const readyState = this._ws.readyState;
            Nimiq.Log.e(DumbPoolMiner, `WS error - ${e.message}`);
            if (readyState === WebSocket.CLOSED) {
                this._ws.close();
            }
        }
    }
}

module.exports = DumbPoolMiner;
