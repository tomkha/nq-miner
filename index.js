const os = require('os');
const fs = require('fs');
const JSON5 = require('json5');
const pjson = require('./package.json');
const Nimiq = require('@nimiq/core');
const Utils = require('./src/Utils');
const SoloMiner = require('./src/SoloMiner');
const NanoPoolMiner = require('./src/NanoPoolMiner');
const DumbPoolMiner = require('./src/DumbPoolMiner');

const TAG = 'NQMiner';
const $ = {};

const useFirst = arg => Array.isArray(arg) ? arg[0] : arg;

const argv = require('yargs')
    .detectLocale(false)
    .strict(true)
    .wrap(120)
    .scriptName(pjson.name)
    .usage('$0 [Options]')
    .option('t', {
        alias: 'type',
        description: 'CUDA or OpenCL',
        choices: ['cuda', 'opencl'],
        coerce: useFirst,
        requiresArg: true,
        type: 'string'
    })
    .option('a', {
        alias: 'address',
        description: 'Nimiq wallet address',
        coerce: arg => Nimiq.Address.fromUserFriendlyAddress(useFirst(arg)),
        requiresArg: true,
        type: 'string'
    })
    .option('p', {
        alias: 'pool',
        description: 'Pool address (host:port)',
        coerce: arg => {
            const chunks = useFirst(arg).split(':', 2);
            const host = chunks[0];
            const port = parseInt(chunks[1]);
            if (Number.isNaN(port)) {
                throw new Error(`Invalid pool port: ${chunks[1]}`);
            }
            return { host, port };
        },
        requiresArg: true,
        type: 'string'
    })
    .option('n', {
        alias: 'name',
        description: 'Device (rig) name',
        coerce: useFirst,
        requiresArg: true,
        type: 'string'
    })
    .options('m', {
        alias: 'mode',
        description: 'Mining mode',
        choices: ['solo', 'smart', 'nano', 'dumb'],
        coerce: useFirst,
        default: 'nano',
        requiresArg: true,
        type: 'string'
    })
    .option('d', {
        alias: 'devices',
        description: 'List of GPU to use',
        defaultDescription: 'all',
        type: 'array'
    })
    .option('network', {
        description: 'Nimiq network',
        choices: ['main', 'test', 'dev'],
        coerce: useFirst,
        default: 'main',
        requiresArg: true,
        type: 'string'
    })
    .options('volatile', {
        description: 'Keep consensus state in memory only',
        coerce: useFirst,
        requiresArg: false,
        type: 'boolean'
    })
    .option('extra-data', {
        description: 'Extra data to add to every mined block (solo)',
        coerce: useFirst,
        requiresArg: true,
        type: 'string'
    })
    .option('hashrate', {
        description: 'Expected hashrate in kH/s (sets start difficulty)',
        conflicts: 'difficulty',
        coerce: useFirst,
        requiresArg: true,
        type: 'number'
    })
    .option('difficulty', {
        description: 'Start difficulty to announce to the pool',
        conflicts: 'hashrate',
        coerce: useFirst,
        requiresArg: true,
        type: 'number'
    })
    .option('log', {
        description: 'Log level',
        choices: ['info', 'debug', 'verbose'],
        coerce: useFirst,
        default: 'info',
        requiresArg: true,
        type: 'string'
    })
    .option('memory', {
        description: 'Memory to allocate in Mb per thread/GPU',
        defaultDescription: 'auto',
        type: 'array'
    })
    .option('threads', {
        description: 'Threads per GPU',
        default: 2,
        type: 'array'
    })
    .option('cache', {
        description: 'Number of cached Argon2 blocks',
        default: 4,
        type: 'array'
    })
    .option('memory-tradeoff', {
        description: 'Number of computed Argon2 blocks (CUDA)',
        default: 256,
        type: 'array'
    })
    .option('jobs', {
        description: 'Number of simultaneous jobs to run (OpenCL)',
        default: 8,
        type: 'array'
    })
    .option('c', {
        alias: 'config',
        description: 'Path to JSON config file',
        config: true,
        configParser: path => JSON5.parse(fs.readFileSync(path)),
        hidden: true,
        requiresArg: true,
        type: 'string'
    })
    .demandOption(['type', 'address'])
    .alias('v', 'version')
    .alias('h', 'help')
    .example('$0 -m cuda -a \'NQ02 YP68 BA76 0KR3 QY9C SF0K LP8Q THB6 LTKU\' -p eu.nimpool.io:8444')
    .epilogue('For more information check https://github.com/tomkha/nq-miner')
    .check(argv => {
        if (['smart', 'nano', 'dumb'].includes(argv.mode) && !argv.pool) {
            throw new Error(`Pool argument is required when minining in ${argv.mode} mode`);
        }
        return true;
    })
    .argv;

Nimiq.Log.instance.level = argv.log;

// TODO
if (argv.mode === 'smart') {
    console.error('Smart miner is not implemented yet');
    process.exit(1);
}

(async () => {

    const { type, address, pool, mode, network, volatile, hashrate, difficulty } = argv;
    const deviceName = argv.name || os.hostname();
    const extraData = argv.extraData || deviceName;
    const minerVersion = `NQ Miner ${pjson.version} ${type === 'cuda' ? 'CUDA' : 'OpenCL'}`;
    const userAgent = `${minerVersion} (${Nimiq.PlatformUtils.userAgentString})`;
    const hashrateToDifficulty = (hashrate) => {
        const desiredSps = 5;
        return (1e3 * hashrate * desiredSps) / (1 << 16);
    };
    const startDifficulty = (argv.difficulty > 0) ? argv.difficulty : hashrateToDifficulty(argv.hashrate > 0 ? argv.hashrate : 100); // 100 kH/s by default
    const deviceData = { deviceName, startDifficulty, minerVersion, userAgent };
    const deviceOptions = Utils.getDeviceOptions(argv);

    const reportHashrates = (hashrates) => {
        const totalHashRate = hashrates.reduce((a, b) => a + b, 0);
        Nimiq.Log.i(TAG, `Hashrate: ${Utils.humanHashrate(totalHashRate)} | ${hashrates.map((hr, idx) => `GPU${idx}: ${Utils.humanHashrate(hr)}`).filter(hr => hr).join(' | ')}`);
    };

    Nimiq.Log.i(TAG, `${minerVersion} starting`);
    Nimiq.Log.i(TAG, `- address          = ${address.toUserFriendlyAddress()}`);
    Nimiq.Log.i(TAG, `- mode             = ${mode}`);
    if (pool) {
        if (mode !== 'solo') {
            Nimiq.Log.i(TAG, `- pool             = ${pool.host}:${pool.port}`);
        } else {
            Nimiq.Log.w(TAG, `- pool (ignored)   = ${pool.host}:${pool.port}`);
        }
    }
    Nimiq.Log.i(TAG, `- device name      = ${deviceName}`);
    if (mode === 'solo') {
        Nimiq.Log.i(TAG, `- extra data       = ${extraData}`);
    }


    Nimiq.GenesisConfig.init(Nimiq.GenesisConfig.CONFIGS[network]);

    if (mode === 'dumb') {

        $.miner = new DumbPoolMiner(type, address, deviceData, deviceOptions);
        $.miner.on('share', nonce => {
            Nimiq.Log.i(TAG, `Found share. Nonce: ${nonce}`);
        });
        $.miner.on('hashrate-changed', reportHashrates);
        $.miner.connect(pool.host, pool.port);

    } else {

        const clientConfigBuilder = Nimiq.Client.Configuration.builder();
        if (mode === 'solo' || mode === 'smart') {
            clientConfigBuilder.feature(Nimiq.Client.Feature.MEMPOOL, Nimiq.Client.Feature.MINING);
        }
        const clientConfig = clientConfigBuilder.build();
        const networkConfig = clientConfig.networkConfig;

        if (mode === 'nano') {
            $.consensus = await (!volatile ? Nimiq.Consensus.nano(networkConfig) : Nimiq.Consensus.volatileNano(networkConfig));
        } else {
            $.consensus = await (!volatile ? Nimiq.Consensus.light(networkConfig) : Nimiq.Consensus.volatileLight(networkConfig));
        }

        $.client = new Nimiq.Client(clientConfig, $.consensus);
        $.blockchain = $.consensus.blockchain;
        $.accounts = $.blockchain.accounts;
        $.mempool = $.consensus.mempool;
        $.network = $.consensus.network;

        if (mode === 'solo') {

            $.miner = new SoloMiner(type, address, Nimiq.BufferUtils.fromAscii(extraData), $.client, deviceOptions);
            $.miner.on('block-mined', block => {
                Nimiq.Log.i(TAG, `Block mined: #${block.header.height}, hash=${block.header.hash().toHex()}`);
            });
            $.miner.on('hashrate-changed', reportHashrates);

        } else {

            const deviceId = Nimiq.BasePoolMiner.generateDeviceId(networkConfig);
            Nimiq.Log.i(TAG, `- device id        = ${deviceId}`);

            $.miner = new NanoPoolMiner(type, $.blockchain, $.network.time, address, deviceId, deviceData, deviceOptions);
            $.miner.on('share', (block, blockValid) => {
                Nimiq.Log.i(TAG, `Found share. Nonce: ${block.header.nonce}`);
            });
            $.miner.on('hashrate-changed', reportHashrates);

            $.client.addConsensusChangedListener(state => {
                if (state === Nimiq.Client.ConsensusState.ESTABLISHED) {
                    Nimiq.Log.i(TAG, `Connecting to pool ${pool.host} using device id ${deviceId} as a ${mode} client.`);
                    $.miner.connect(pool.host, pool.port);
                } else {
                    $.miner.disconnect();
                }
            });
        }

    }

})().catch(e => {
    console.error(e);
    process.exit(1);
});
