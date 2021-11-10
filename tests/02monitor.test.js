/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const mssql = require('mssql');
const fs = require('fs');
const yaml = require('js-yaml');
const {
    promisify
} = require('util');
const {
    provendbSQLServer
} = require('./testCommon');

const exec = promisify(require('child_process').exec);


let connection;
let provendbSQLServerOut;


const debug = false;



let testAccount;

// This is a paid key.  But the default key created by P4O should be ok too - it's freeware.

describe('provendb-sqlserver Monitor tests', () => {
    beforeAll(async () => {
        await killMonitor();
        const monitorCmd = 'monitor -i 4 -v -m 0 --config=testConfig.yaml';
        provendbSQLServerOut = provendbSQLServer(monitorCmd);

        const config = yaml.safeLoad(fs.readFileSync('testConfig.yaml', 'utf8'));
        if (debug) console.log(config);
        const connectionString = `${config.dbConnection.connectionString}`;

        connection = await mssql.connect(connectionString);

        const accountSearch = connectionString.match(/(.*)User Id=(.*);(.*)/);
        testAccount = accountSearch[2];
        const checkOutput = await connection.query('SELECT current_timestamp AS timestamp');
        // await connection.query('use provendbTest');
        const connectionTimestamp = checkOutput.recordset[0].timestamp;
        console.log('Connected at ', connectionTimestamp);
        await sleep(2000);
    });

    beforeEach(() => {});

    afterEach(() => {});

    afterAll(async () => {
        await killMonitor();
        if (debug) console.log(provendbSQLServerOut);
    });

    test('Test help', async () => {
        const output = await provendbSQLServer(' --help');
        expect(output).toEqual(expect.stringMatching('ProvenDB Connector for SQL Server'));
    });

    test('Anchor', async () => {
        jest.setTimeout(120000);
        let sql = `EXEC [dbo].[fanchorrequest] '${testAccount}demo.dbo.contractstable' , 'contractData,metaData', 'contractId BETWEEN 0 and 100' , 'CONTRACTID'`;
        let results = await connection.query(sql);
        const requestId = results.recordset[0][''];
        sql = `select * from provendbrequests where id=${requestId}`;
        let status = 'NEW';
        while (status === 'NEW') {
            results = await connection.query(sql);
            status = results.recordset[0].status;
            if (debug) console.log(status);
            await sleep(5000);
        }
        if (debug) console.log(results);
        await sleep(1500);
        expect(status).toEqual('SUCCESS');
    });

    test('Validate', async () => {
        jest.setTimeout(120000);
        let sql = `SELECT proofId from provendbrequests where id=(
                            SELECT MAX(id) FROM provendbrequests
                            WHERE requestType='ANCHOR'
                            AND status='SUCCESS')`;
        let results = await connection.query(sql);
        if (debug) console.log(results);
        const proofId = results.recordset[0].proofId;
        if (debug) console.log(proofId);
        sql = `EXEC [dbo].[fvalidaterequest]  '${proofId}'`;
        results = await connection.query(sql);
        if (debug) console.log(results);
        const requestId = results.recordset[0][''];
        sql = `select * from provendbrequests where id=${requestId}`;
        let status = 'NEW';
        while (status === 'NEW') {
            results = await connection.query(sql);
            status = results.recordset[0].status;
            if (debug) console.log(status);
            await sleep(5000);
        }
        if (debug) console.log(results);
        await sleep(1500);
        expect(status).toEqual('SUCCESS');
    });

    test('ValidateById', async () => {
        jest.setTimeout(120000);
        let sql = `  SELECT MAX(id) requestId FROM provendbrequests
                            WHERE requestType='ANCHOR'
                            AND status='SUCCESS'`;
        let results = await connection.query(sql);
        if (debug) console.log(results);
        const requestId = results.recordset[0].requestId;
        if (debug) console.log(requestId);
        sql = `EXEC [dbo].[fvalidaterequestId]  '${requestId}'`;
        results = await connection.query(sql);
        if (debug) console.log(results);
        const requestId2 = results.recordset[0][''];
        sql = `select * from provendbrequests where id=${requestId2}`;
        let status = 'NEW';
        while (status === 'NEW') {
            results = await connection.query(sql);
            status = results.recordset[0].status;
            if (debug) console.log(status);
            await sleep(5000);
        }
        if (debug) console.log(results);
        await sleep(1500);
        expect(status).toEqual('SUCCESS');
    });

    test('Tampering', async () => {
        jest.setTimeout(120000);

        let sql = `UPDATE ${testAccount}demo.dbo.contractstable
                      SET METADATA='{"info":"'+CAST(getDate() AS VARCHAR(100))+'"}'
                    WHERE CONTRACTID=11`;
        let results = await connection.query(sql);
        sql = `UPDATE ${testAccount}demo.dbo.contractstable
                  SET mytimestamp=getdate()
                WHERE CONTRACTID=49;`;
        results = await connection.query(sql);
        if (debug) console.log(results);
        sql = `SELECT proofId from provendbrequests where id=(
                        SELECT MAX(id) FROM provendbrequests
                        WHERE requestType='ANCHOR'
                        AND status='SUCCESS')`;
        results = await connection.query(sql);
        const proofId = results.recordset[0].proofId;
        if (debug) console.log(proofId);
        sql = `EXEC [dbo].[fvalidaterequest]  '${proofId}'`;
        results = await connection.query(sql);
        if (debug) console.log(results);
        const requestId = results.recordset[0][''];
        sql = `select * from provendbrequests where id=${requestId}`;
        let status = 'NEW';
        while (status === 'NEW') {
            results = await connection.query(sql);
            status = results.recordset[0].status;
            if (debug) console.log(status);
            await sleep(5000);
        }
        if (debug) console.log(results);
        status = results.recordset[0].status;
        const messages = JSON.parse(results.recordset[0].messages);
        if (debug) console.log(messages);
        const badkeys = messages[1];
        if (debug) console.log(badkeys);
        expect(badkeys.badKeys[0]).toEqual('11');
        expect(badkeys.badKeys.length).toEqual(1);
        expect(status).toEqual('FAILED');
    });
});



async function killMonitor() {
    try {
        const cmd = 'ps -ef |grep provendb-sqlserver |grep monitor|grep testConfig.yaml|awk \'{print "kill  ",$2}\'|/bin/sh -v';

        const cmdout = await exec(cmd);
        const output = cmdout.stdout;
        if (debug) console.log(output);
    } catch (error) {
        console.log(error.message);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
