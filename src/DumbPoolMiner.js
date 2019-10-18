const os = require('os');
const crypto = require('crypto');
const Nimiq = require('@nimiq/core');
const WebSocket = require('ws');

class DumbPoolMiner extends Nimiq.Observable {

    /**
     * @param {NativeMiner} nativeMiner
     * @param {Nimiq.Address} address 
     * @param {number} deviceId
     * @param {object} deviceData 
     */
    constructor(nativeMiner, address, deviceId, deviceData) {
        super();

        this._nativeMiner = nativeMiner;
        this._address = address;
        this._deviceId = deviceId;
        this._deviceData = deviceData;
    }

    connect(host, port) {
        this._closed = false;
        this._ws = new WebSocket(`wss://${host}:${port}`);

        this._ws.on('open', () => {
            this._register();
        });

        this._ws.on('close', (code, reason) => {
            this._stopMining();

            const timeout = Nimiq.BasePoolMiner.RECONNECT_TIMEOUT + Math.floor(Math.random() * (Nimiq.BasePoolMiner.RECONNECT_TIMEOUT_MAX - Nimiq.BasePoolMiner.RECONNECT_TIMEOUT));
            Nimiq.Log.w(DumbPoolMiner, `Connection lost. Reconnecting in ${timeout} seconds to ${host}`);
            if (!this._closed) {
                setTimeout(() => {
                    this.connect(host, port);
                }, timeout * 1000);
            }
        });

        this._ws.on('message', (msg) => this._onMessage(JSON.parse(msg)));

        this._ws.on('error', (e) => Nimiq.Log.e(DumbPoolMiner, `WS error:`, e.message || e));
    }

    disconnect() {
        this._closed = true;
        this._ws.close();
    }

    _register() {
        this._send({
            message: 'register',
            mode: 'dumb',
            address: this._address.toUserFriendlyAddress(),
            deviceId: this._deviceId,
            deviceName: this._deviceData ? this._deviceData.deviceName : undefined,
            startDifficulty: this._deviceData ? this._deviceData.startDifficulty : undefined,
            minerVersion: this._deviceData ? this._deviceData.minerVersion : undefined,
            deviceData: this._deviceData,
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

    _startMining(blockHeader) {
        Nimiq.Log.i(DumbPoolMiner, `Starting work on block #${blockHeader.height}`);
        this._nativeMiner.startMiningOnBlock(blockHeader, obj => {
            if (obj.nonce > 0) {
                this._send({
                    message: 'share',
                    nonce: obj.nonce
                });
                this.fire('share', obj.nonce);
            }
        });
    }

    _stopMining() {
        this._nativeMiner.stop();
    }

    _onNewPoolSettings(address, extraData, shareCompact, nonce) {
        const difficulty = Nimiq.BlockUtils.compactToDifficulty(shareCompact);
        Nimiq.Log.i(DumbPoolMiner, `Set share difficulty: ${difficulty.toFixed(2)} (${shareCompact.toString(16)})`);
        this._nativeMiner.setShareCompact(shareCompact);
    }

    _onBalance(balance, confirmedBalance) {
        Nimiq.Log.i(DumbPoolMiner, `Pool balance: ${Nimiq.Policy.lunasToCoins(balance)} NIM (confirmed ${Nimiq.Policy.lunasToCoins(confirmedBalance)} NIM)`);
    }

    _onNewBlock(blockHeader) {
        this._startMining(blockHeader);
    }

    _send(msg) {
        if (this._ws) {
            try {
                this._ws.send(JSON.stringify(msg));
            } catch (e) {
                Nimiq.Log.w(DumbPoolMiner, 'Error sending:', e.message || e);
            }
        }
    }

    static generateDeviceId() {
        const hostInfo = os.hostname() + '/' + Object.values(os.networkInterfaces()).map(i => i.map(a => a.address + '/' + a.mac).join('/')).join('/');
        const hash = crypto.createHash('sha256');
        hash.update(hostInfo);
        return hash.digest().readUInt32LE(0);
    }
}

module.exports = DumbPoolMiner;
