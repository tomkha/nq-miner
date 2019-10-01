
const Nimiq = require('@nimiq/core');
const Miner = require('./Miner');

class SoloMiner extends Nimiq.Observable {

    /**
     * @param {string} type
     * @param {Nimiq.Address} address
     * @param {Uint8Array} extraData
     * @param {Nimiq.Client} client
     * @param {object} deviceOptions
     */
    constructor(type, address, extraData, client, deviceOptions) {
        super();

        this._address = address;
        this._extraData = extraData;
        this._client = client;

        this._miner = new Miner(type, deviceOptions);
        this._miner.on('share', async nonce => {
            const block = this._block;
            block.header.nonce = nonce;
            if (await block.header.verifyProofOfWork()) {
                if (await client.submitBlock(block)) {
                    this.fire('block-mined', block);
                }
            } else {
                Nimiq.Log.w(SoloMiner, `Invalid PoW: ${(await block.header.pow()).toHex()}, nonce: ${nonce}`);
            }
        });
        this._miner.on('hashrate-changed', hashrates => {
            this.fire('hashrate-changed', hashrates);
        });

        client.addConsensusChangedListener(consensusState => {
            if (consensusState !== Nimiq.Client.ConsensusState.ESTABLISHED) {
                this._stopMining();
            }
        });

        client.addHeadChangedListener(() => {
            this._startMining();
        });
    }

    async _startMining() {
        const block = await this._client.getBlockTemplate(this._address, this._extraData);
        if (!block) {
            this._stopMining();
            return;
        }
        this._block = block;

        Nimiq.Log.i(SoloMiner, `Starting work on block #${block.height}`);

        this._miner.setShareCompact(block.header.nBits);
        this._miner.startMiningOnBlock(block.header.serialize());
    }

    _stopMining() {
        this._miner.stop();
    }

}

module.exports = SoloMiner;
