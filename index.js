const os = require('os');
const fs = require('fs');
const JSON5 = require('json5');
const pjson = require('./package.json');
const Nimiq = require('@nimiq/core');
const DumbPoolMiner = require('./src/DumbPoolMiner');
const NativeMiner = require('./src/NativeMiner')
const Utils = require('./src/Utils');

const TAG = 'NQMiner';
const $ = {};

const useFirst = arg => Array.isArray(arg) ? arg[0] : arg;

const parseCSV = arg => arg.reduce((a, v) => {
    switch (typeof v) {
        case 'number':
            a.push(v);
            break;
        case 'string':
            a.push(...v.split(',').filter(Boolean).map(x => parseInt(x.trim())));
            break;
        default:
            break;
    }
    return a;
}, []);

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
        coerce: parseCSV,
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
        coerce: parseCSV,
        defaultDescription: 'auto',
        type: 'array'
    })
    .option('threads', {
        description: 'Threads per GPU',
        coerce: parseCSV,
        default: 2,
        type: 'array'
    })
    .option('cache', {
        description: 'Number of cached Argon2 blocks',
        coerce: parseCSV,
        default: 4,
        type: 'array'
    })
    .option('memory-tradeoff', {
        description: 'Number of computed Argon2 blocks (CUDA)',
        coerce: parseCSV,
        default: 256,
        type: 'array'
    })
    .option('jobs', {
        description: 'Number of simultaneous jobs to run (OpenCL)',
        coerce: parseCSV,
        default: 8,
        type: 'array'
    })
    .option('cpu-priority', {
        description: 'Process priority (0 - idle, 5 - highest)',
        coerce: arg => {
            const value = useFirst(arg);
            if (!Number.isInteger(value)) {
                return undefined;
            }
            return Math.min(Math.max(value, 0), 5);
        },
        requiresArg: true,
        type: 'number'
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
    .example('$0 -t cuda -a "NQ02 YP68 BA76 0KR3 QY9C SF0K LP8Q THB6 LTKU" -p eu.nimpool.io:8444')
    .epilogue('For more information check https://github.com/tomkha/nq-miner')
    .check(argv => {
        if (['smart', 'nano', 'dumb'].includes(argv.mode) && !argv.pool) {
            throw new Error(`Pool argument is required when minining in ${argv.mode} mode`);
        }
        return true;
    })
    .argv;

Nimiq.Log.instance.level = argv.log;

(async () => {
    const { type, address, pool, mode, network, volatile, hashrate, difficulty, cpuPriority } = argv;
    const deviceName = argv.name || os.hostname();
    const extraData = argv.extraData ? `${argv.extraData} / ${deviceName}` : deviceName;
    const minerVersion = `NQ Miner ${pjson.version} ${type === 'cuda' ? 'CUDA' : 'OpenCL'}`;
    const userAgent = `${minerVersion} (${Nimiq.PlatformUtils.userAgentString})`;
    const hashrateToDifficulty = (hashrate) => {
        const desiredSps = 5;
        return (1e3 * hashrate * desiredSps) / (1 << 16);
    };
    const startDifficulty = (difficulty > 0) ? difficulty : hashrateToDifficulty(hashrate > 0 ? hashrate : 100); // 100 kH/s by default
    const deviceData = { deviceName, startDifficulty, minerVersion, userAgent };
    const deviceOptions = Utils.getDeviceOptions(argv);

    Nimiq.Log.i(TAG, `${minerVersion} starting`);

    if (cpuPriority !== undefined) {
        try {
            const priority = Object.entries(os.constants.priority)[cpuPriority];
            os.setPriority(priority[1]);
            Nimiq.Log.d(TAG, `Set process priority: ${priority[1]} (${priority[0]})`);
        } catch (e) {
            Nimiq.Log.e(TAG, `Couldn't set process priority: ${e.message || e}`);
        }
    }

    $.nativeMiner = new NativeMiner(type, deviceOptions);
    $.nativeMiner.on('hashrate-changed', (hashrates) => {
        const totalHashRate = hashrates.reduce((a, b) => a + b, 0);
        Nimiq.Log.i(TAG, `Hashrate: ${Utils.humanHashrate(totalHashRate)} | ${hashrates.map((hr, idx) => `GPU${idx}: ${Utils.humanHashrate(hr)}`).filter(hr => hr).join(' | ')}`);
    });

    Nimiq.Log.i(TAG, `- address          = ${address.toUserFriendlyAddress()}`);
    Nimiq.Log.i(TAG, `- network          = ${network}`);
    Nimiq.Log.i(TAG, `- mode             = ${mode}`);
    if (pool) {
        if (mode !== 'solo') {
            Nimiq.Log.i(TAG, `- pool             = ${pool.host}:${pool.port}`);
        } else {
            Nimiq.Log.w(TAG, `- pool (ignored)   = ${pool.host}:${pool.port}`);
        }
    }
    if (mode === 'solo') {
        Nimiq.Log.i(TAG, `- extra data       = ${extraData}`);
    } else {
        Nimiq.Log.i(TAG, `- device name      = ${deviceName}`);
    }

    Nimiq.GenesisConfig.init(Nimiq.GenesisConfig.CONFIGS[network]);

    if (mode === 'dumb') {
        const deviceId = DumbPoolMiner.generateDeviceId();
        Nimiq.Log.i(TAG, `- device id        = ${deviceId}`);

        $.miner = new DumbPoolMiner($.nativeMiner, address, deviceId, deviceData);
        $.miner.on('share', nonce => {
            Nimiq.Log.i(TAG, `Found share. Nonce: ${nonce}`);
        });

        Nimiq.Log.i(TAG, `Connecting to pool ${pool.host} using device id ${deviceId} as a ${mode} client.`);
        $.miner.connect(pool.host, pool.port);

        return;
    }

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
        $.miner = new Nimiq.Miner($.nativeMiner, $.blockchain, $.accounts, $.mempool, $.network.time, address, Nimiq.BufferUtils.fromAscii(extraData));
    } else {
        const deviceId = Nimiq.BasePoolMiner.generateDeviceId(networkConfig);
        Nimiq.Log.i(TAG, `- device id        = ${deviceId}`);

        if (mode === 'nano') {
            $.miner = new Nimiq.NanoPoolMiner($.nativeMiner, $.blockchain, $.network.time, address, deviceId, deviceData);
        } else {
            $.miner = new Nimiq.SmartPoolMiner($.nativeMiner, $.blockchain, $.accounts, $.mempool, $.network.time, address, deviceId, deviceData, Nimiq.BufferUtils.fromAscii(extraData));
        }

        $.miner.on('share', (block, blockValid) => {
            Nimiq.Log.i(TAG, `Found share. Nonce: ${block.header.nonce}`);
        });

        $.client.addConsensusChangedListener(async (state) => {
            if (state === Nimiq.Client.ConsensusState.ESTABLISHED) {
                if ($.miner.isDisconnected()) {
                    Nimiq.Log.i(TAG, `Connecting to pool ${pool.host} using device id ${deviceId} as a ${mode} client.`);
                    $.miner.connect(pool.host, pool.port);
                }
            }
        });
    }

    let consensusState = Nimiq.Client.ConsensusState.CONNECTING;
    $.client.addConsensusChangedListener(async (state) => {
        consensusState = state;
        if (state === Nimiq.Client.ConsensusState.ESTABLISHED) {
            $.miner.startWork();
        } else {
            // XXX don't stop if (mode === 'nano') ?
            $.miner.stopWork();
        }
    });

    $.client.addBlockListener(async (hash) => {
        if (consensusState === Nimiq.Client.ConsensusState.SYNCING) {
            const head = await $.client.getBlock(hash, false);
            if (head.height % 100 === 0) {
                Nimiq.Log.i(TAG, `Syncing at block: ${head.height}`);
            }
        }
    });

    $.client.addHeadChangedListener(async (hash, reason) => {
        const head = await $.client.getBlock(hash, false);
        Nimiq.Log.i(TAG, `Now at block: ${head.height} (${reason})`);
    });

    const isSeed = (peerAddress) => Nimiq.GenesisConfig.SEED_PEERS.some(seed => seed.equals(peerAddress));
    $.network.on('peer-joined', (peer) => {
        if (Math.abs(peer.timeOffset) > Nimiq.Network.TIME_OFFSET_MAX && isSeed(peer.peerAddress)) {
            Nimiq.Log.e(TAG, 'Your local system time seems to be wrong! You might not be able to synchronize with the network.');
        }
    });

    $.miner.on('block-mined', (block) => {
        Nimiq.Log.i(TAG, `Block mined: #${block.header.height}, hash=${block.header.hash().toHex()}`);
    });

})().catch(e => {
    console.error(e);
    process.exit(1);
});
