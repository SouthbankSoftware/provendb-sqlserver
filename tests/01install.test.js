/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */


const fs = require('fs');
const yaml = require('js-yaml');
const {
    provendbSQLServer,
    getParameters
} = require('./testCommon');
const execSync = require('child_process').execSync;
const os=require('os');

 

const parameters = getParameters();
const provendbUser = 'provendbTest';
const demoSchema = provendbUser + 'DEMO';
const anchorType = parameters.anchorType;

const debug = false;
const usePaidToken = false;

// This is a paid key.  But the default key created by P4O should be ok too - it's freeware.
const prdAnchorKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhbmNob3IiLCJleHAiOjE3ODA0NDIyNzEsImp0aSI6ImF2bDc1MHlucmx1cmo3ajZjOHR1bTQxeiIsInN1YiI6InV2cHgzYjVjNXV2bXduOTRxYTd2NG5kciIsInNjb3BlIjoiMCIsInJvbGUiOiJQYWlkIn0.mUQnGKOqzcS5IqXeSAGJ6H2DY2f_bL1IaeKzKz7D4K0';

let windowsConnect="Server=localhost\\SQLEXPRESS;1433;Encrypt=false;Trusted_Connection=True;TrustServerCertificate=True";

describe('provendb-sqlserver install tests', () => {
    beforeAll(() => {});

    beforeEach(() => {});

    afterEach(() => {});

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbSQLServer(' --help');
        expect(output).toEqual(expect.stringMatching('ProvenDB Connector for SQL Server'));
    });

    test('Install unitTest', async () => {
        jest.setTimeout(120000);
        try {
            execSync('rm testConfig.yaml');
        } catch (error) {
            console.log(error.message);
        }
        const provendbUser = 'provendbTest' + Math.round(Math.random() * 10000);

        let installCmd = `install --config=testConfig.yaml --dbaPassword=DBEnvy2016 --dbaUserName=SA --provendbPassword=DBEnvy2016 --provendbUser=${provendbUser} \
                            --dropExisting --createDemoAccount --config=testConfig.yaml`;
        if (os.type()==='Windows_NT') {
            installCmd+=` --sqlConnect="${windowsConnect}"`;
        }
 
        console.log(installCmd);
        const output = await provendbSQLServer(installCmd);
        console.log(output);
        expect(output).toEqual(expect.stringMatching('INFO  Install complete'));
        expect(output).toEqual(expect.stringMatching('INFO  Wrote new config'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        await sleep(1000);

        try {
            const config = yaml.load(fs.readFileSync('testConfig.yaml'));
            config.anchorType = 'HEDERA';
            if (usePaidToken) {
                config.proofable.token = prdAnchorKey;
            }
            config.proofable.endpoint = 'api.proofable.io:443';
            const newConfig = yaml.safeDump(config);
            fs.writeFileSync('testConfig.yaml', newConfig);
        } catch (e) {
            expect(e.message).toEqual('');
        }

    });
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}