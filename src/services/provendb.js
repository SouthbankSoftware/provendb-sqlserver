const fs = require('fs');
const log = require('simple-node-logger').createSimpleLogger();
const chainpointParse = require('chainpoint-parse');
const chainpointBinary = require('chainpoint-binary');
// const tmp = require('tmp');
const axios = require('axios');
const Path = require('path');
const {
    merkle,
    anchor
} = require('provendb-sdk-node');
const {
    async
} = require('regenerator-runtime');

const debug = false;

const dragonGlassAccessKey = '79120886-f78a-3c5b-a51c-7dcec82607b5';
const dragonGlassAPIKey = '1a0fc3645c05847d43fd58dffae1986436658ba2';
const dragonGlassTestNetAccessKey = '4b3c47f5-d457-359b-99dd-51b979f51590';
const dragonGlassTestNetAPIKey = 'd21319e0ce1d737891ea28f5501f2a0aff6da5f1';

module.exports = {
    anchorData: async (keyValues, anchorChainType, anchorToken, verbose) => {
        if (verbose) {
            log.setLevel('trace');
            log.trace('set logging level to trace');
        }
        const debug = false;
        try {
            log.info('--> Anchoring data to ', anchorChainType);
            log.info(keyValues.length, ' keys');

            // TODO: Use dev anchor optionally not local anchor
            log.trace('token ', anchorToken);
            const myAnchor = anchor.connect(anchor.withAddress('anchor.proofable.io:443'), anchor.withCredentials(anchorToken));
            // const myAnchor = anchor.connect(anchor.withAddress('anchor.dev.proofable.io:443'));
            const tree = makeTree(keyValues);
            log.trace('Anchoring tree ', tree.getRoot());
            const anchoredProof = await myAnchor.submitProof(tree.getRoot(),
                anchor.submitProofWithAnchorType(anchor.Anchor.Type[anchorChainType]),
                anchor.submitProofWithAwaitConfirmed(true));

            tree.addProof(anchoredProof);
            log.trace('tree keys', Object.keys(tree));
            log.info('Anchored to ', anchoredProof.metadata.txnUri);
            return (tree);
        } catch (error) {
            log.error(error.message);
            log.trace(error.trace);
            throw new Error(error);
        }
    },
    validateProofAndData: async (proofId, proof, keyvalues, metadata, outputFile,logLevel) => {
        log.setLevel(logLevel);
        const messages=[];
        let message;
        const validateOut = await validateData(proof, keyvalues, outputFile, metadata, log.getLevel());
        log.trace(validateOut);
        if (validateOut.goodProof) {
            message = `PASS: Validated all data hashes for ${proofId}`;
            log.info(message);
            messages.push(message);
            const blockchainProof = proof.proofs[0];
            log.trace(blockchainProof);
            const validatedProof = await validateChainpointProof(blockchainProof, log.getLevel());

            log.trace('validatedProof ', validatedProof);
            log.trace('Expected value for blockchain transaction is ', validatedProof.expectedValue);
            if (await validateBlockchainHash(blockchainProof.anchorType, blockchainProof.metadata.txnId, validatedProof.expectedValue)) {
                const message = `PASS: Proof validated with hash ${validatedProof.expectedValue} on ${blockchainProof.metadata.txnUri}`;
                log.info(message);
                messages.push(message);
                proofIsValid = true;
            } else {
                const message = 'FAIL: Cannot validate blockchain hash - see log';
                log.error(message);
                messages.push(message);
            }
        } else {
            message = `FAIL: Mismatch in data hashes for ${proofId} - see log`;
            log.error(message);
            messages.push(message);
            messages.push({
                badKeys: validateDataOut.badKeys
            });
            proofIsValid = false;
        }
        return ({
            proofIsValid,
            messages
        });
    }
};


async function validateData(proof, inputKeyValues, outputFile, metadata, logLevel = 'info') {
    log.setLevel(logLevel);

    let goodProof = false;
    let badKeys = [];

    const tree = makeTree(inputKeyValues);
    const calculatedRoot = tree.getRoot();
    const proofRoot = proof.proofs[0].hash;
    if (calculatedRoot === proofRoot) {
        log.info('PASS: data hash matches proof hash');
        goodProof = true;
    } else {
        log.error(`FAIL: proof hash does not match data hash proof: ${proofRoot}, data: ${calculatedRoot}`);
        goodProof = false;
        badKeys = getBadKeys(proof, tree);
        log.trace(badKeys);
    }
    // TODO: Should compress this file
    if (goodProof) {
        const proofDoc = {
            metadata,
            tree: proof
        };

        await fs.writeFileSync(outputFile, JSON.stringify(proofDoc));
        log.info('Wrote proof to ', outputFile);
    }
    log.trace('goodProof=', goodProof);
    return ({
        goodProof,
        badKeys
    });
}
async function validateChainpointProof(proof, logLevel) {
    log.setLevel(logLevel);

    const debug = false;
    try {
        log.info('Validating Chainpoint proof');
        log.trace('proof in validateProof', proof);
        let objectProof = proof.data;
        // TODO: Not sure why this is neccessary but otherwise Chainpoint barfs on proof
        if (true) {
            objectProof = JSON.parse(JSON.stringify(proof.data));
        }

        if (debug) console.log(JSON.stringify(objectProof));
        log.trace('object proof', objectProof);
        // Check that we can convert to chainpont Binary
        const binaryProof = await chainpointBinary.objectToBinarySync(objectProof);
        log.trace('binary proof', binaryProof);
        if (debug) console.log(binaryProof);

        // Parse the proof using chainpoint libraries
        const parsedProof = chainpointParse.parse(binaryProof);
        log.trace('parsed Proof', parsedProof);
        if (debug) console.log(JSON.stringify(parsedProof));
        // const expectedValue = parsedProof.branches[0].branches[0].anchors[0].expected_value;
        const expectedValue = findVal(parsedProof, 'expected_value');
        log.trace('expectedValue ', expectedValue);
        return ({
            expectedValue,
            parsedProof
        });
    } catch (error) {
        log.error(error.message, ' while validating proof');
        log.error(error.stack);
        throw error;
    }
}

function makeTree(inputkeyValues) {
    let tree;
    try {
        log.trace('makeTree');
        const builder = new merkle.Builder('sha-256');
        const keyValues = [];
        inputkeyValues.forEach((keyvalue) => {
            keyValues.push({
                key: keyvalue.key,
                value: Buffer.from(keyvalue.value.toString())
            });
        });
        log.trace(keyValues[0]);
        builder.addBatch(keyValues);
        tree = builder.build();
        log.trace('Tree nodes ', tree.nodes);
    } catch (error) {
        log.error(error.message);
        log.trace(error.stack);
        throw Error(error);
    }
    return tree;
}

function findVal(object, key) {
    let value;
    Object.keys(object).some((k) => {
        if (k === key) {
            value = object[k];
            return true;
        }
        if (object[k] && typeof object[k] === 'object') {
            value = findVal(object[k], key);
            return value !== undefined;
        }
    });
    return value;
}

function getBadKeys(proof, tree) {
    const badKeyList = [];
    const proofLeaves = proof.getLeaves();
    const treeLeaves = tree.getLeaves();
    if (proofLeaves.length !== treeLeaves.length) {
        log.info('Mismatch in number of keys when validating data');
        badKeyList.push('different number of keys in proof and validated data');
    } else {
        for (leafId = 0; leafId < proofLeaves.length; leafId++) {
            if (treeLeaves.length > leafId) {
                const proofLeaf = proofLeaves[leafId];
                const treeLeaf = treeLeaves[leafId];
                if (proofLeaf.key !== treeLeaf.key) {
                    log.info('Keys do not match in leaf of tree');
                    badKeyList.push(proofLeaf.key);
                    badKeyList.push(treeLeaf.key);
                } else if (proofLeaf.value !== treeLeaf.value) {
                    badKeyList.push(proofLeaf.key);
                    log.error('Hash mismatch on key ', proofLeaf.key);
                }
            }
        }
    }

    log.trace(badKeyList);
    return (badKeyList);
}

async function lookupHederaDragonGlass(transactionId, network = 'mainnet', verbose = false) {
    if (verbose) {
        log.setLevel('trace');
    }
    log.trace(`Dragonglass ${network} ${transactionId}`);
    let apiEndPoint = `https://api.dragonglass.me/hedera/api/transactions?query=${transactionId}`;

    let accessKey = dragonGlassAccessKey;
    if (network === 'testnet') {
        apiEndPoint = `https://api-testnet.dragonglass.me/hedera/api/transactions?query=${transactionId}`;
        accessKey = dragonGlassTestNetAccessKey;
    }
    try {
        config = {
            method: 'get',
            url: apiEndPoint,
            headers: {
                'x-api-key': accessKey,
                Accept: 'application/json',
                Host: 'api.dragonglass.me'
            }
        };
        log.trace(config);
        response = await axios(config);
        log.trace('okr', Object.keys(response));

        return (response.data.data[0].memo);
    } catch (error) {
        log.error(error.message);
        log.error(config);
        log.error(response);
        return (false);
    }
}

async function validateBlockchainHash(anchorType, txnId, expectedValue) {
    let hashOut;
    // TODO: mainnet anchor support
    if (anchorType === 'ETH') {
        hashOut = await module.exports.lookupEthTxn(txnId, verbose);
        log.trace('txnOut ', hashOut);
    } else if (anchorType === 'HEDERA') {
        // hashOut = await module.exports.lookupHederaTxn(txnId, verbose);
        hashOut = await lookupHederaDragonGlass(txnId, 'testnet');
        log.trace('txnOut ', hashOut);
    } else if (anchorType === 'HEDERA_MAINNET') {
        // hashOut = await module.exports.lookupHederaMainNetTxn(txnId, verbose);
        hashOut = await lookupHederaDragonGlass(txnId, 'mainnet');
        log.trace('txnOut ', hashOut);
    } else {
        log.warn(`Do not know how to validate ${anchorType} blockchain entries`);
        return (true);
    }
    log.info(`${anchorType} transaction ${txnId} has hash value ${hashOut}`);
    if (expectedValue === hashOut) {
        log.info('PASS: blockchain hash matches proof hash');
        return (true);
    }
    log.info('FAIL: blockchain hash does not match expected hash from proof');
    return (false);
}