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
            log.trace('tree', tree);
            if (debug) {
                console.log('=======');
                console.log(tree);
                console.log('=======');
                console.log(tree.getRoot());
                console.log('=======');
                console.log(anchoredProof);
                console.log('=======');
            }
            log.info('Anchored to ', anchoredProof.metadata.txnUri);
            return (tree);
        } catch (error) {
            log.error(error.message);
            log.trace(error.trace);
            throw new Error(error);
        }
    }
};

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
