/*
 * Encapsulates all the relevant functions for interacting with SQL Server.
 *
 * Copyright (C) 2021  Southbank Software Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 * @Author: Guy Harrison
 */
const {
    loadAll
} = require('js-yaml');
const mssql = require('mssql');
const {
    setGracefulCleanup
} = require('tmp');
const log = require('simple-node-logger').createSimpleLogger();
const {
    anchorData
} = require('./provendb');
const {
    flags
} = require('../commands/install');


const debug = false;

module.exports = {
    connectSQLServer: async (config, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        log.info('Connecting to SQL Server');
        try {
            log.trace(config);
            // make sure that any items are correctly URL encoded in the connection string
            const connectionString = `${config.dbConnection.connectionString}`;
            log.trace('connection String: ', connectionString);
            const connection = await mssql.connect(connectionString);
            const checkOutput = await connection.query('SELECT current_timestamp AS timestamp');
            const connectionTimestamp = checkOutput.recordset[0].timestamp;
            log.trace('Connected at ', connectionTimestamp);
            return (connection);
        } catch (error) {
            log.error(error.stack);
            throw Error(error);
        }
    },
    installPDB4SS: async (flags) => {
        if (flags.verbose) {
            log.setLevel('trace');
        }
        const dbaConnection = await connectDBA(flags);
        if (flags.dropExisting) {
            if (flags.createDemoAccount) {
                await dropDemoUser(dbaConnection, flags);
            }
        }
        await dropUser(dbaConnection, flags);
        await createUser(dbaConnection, flags);
        await createTables(dbaConnection, flags);
        if (flags.createDemoAccount) {
            await createDemoUser(dbaConnection, flags);
        }
    },
    processRequests: async (connection, config, verbose = false) => {
        if (verbose) {
            log.setLevel('trace');
        }
        try {
            // TODO: transaction handling.
            // connection.query('BEGIN TRANSACTION'); //NB: NO CONNECTION POOL!
            let noDataFound = false;
            do {
                const querySQL = `
                        SELECT id,requesttype,requestjson FROM provendbrequests WITH (UPDLOCK)                
                         WHERE STATUS = 'NEW'
                        ORDER BY ID`;
                log.trace(querySQL);

                const output = await connection.query(querySQL);
                log.trace(output.recordset);
                if (output.recordset.length === 0) {
                    // await connection.commit; // release lock
                    noDataFound = true;
                } else {
                    log.trace(output.recordset);
                    for (let rn = 0; rn < output.recordset.length; rn++) {
                        const row = output.recordset[rn];
                        log.trace(row);
                        log.info('Processing request ', row.requestjson);
                        if (row.requesttype === 'ANCHOR') {
                            await processAnchorRequest(connection, config, row.id, JSON.parse(row.requestjson));
                        } else if (requestType === 'VALIDATE') {
                            await processValidateRequest(connection, config, row.id, JSON.parse(row.requestjson));
                        }
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            } while (!noDataFound);
        } catch (error) {
            log.error(error.message);

            throw Error(error);
        }
    }
};

async function processAnchorRequest(connection, config, id, requestJson) {
    log.trace('json: ', requestJson);
    let where;
    let keyColumn;
    let columns = '*';

    if (!('table' in requestJson)) {
        await invalidateRequest(connection, id, 'Must specify table argument in request');
        return;
    }
    try {
        if ('columns' in requestJson) {
            columns = requestJson.columns;
        }
        if ('where' in requestJson) {
            where = requestJson.where;
        }
        if ('keyColumn' in requestJson) {
            keyColumn = requestJson.keyColumn;
        }

        const proofId = await anchor1Table({
            connection,
            config,
            tableName: requestJson.table,
            whereClause: where,
            columnList: columns,
            keyColumn
        });
        await completeRequest(connection, id, proofId, '');
    } catch (error) {
        log.error('Error processing request: ', error.message);
        log.trace(error.stack);
        await invalidateRequest(connection, id, error.message);
    }
}

async function processValidateRequest(connection, config, id, requestJson, verbose) {
    if (verbose) {
        log.setLevel('trace');
    }
    log.trace('json: ', requestJson);
    let proofId;

    if (!('proofId' in requestJson)) {
        await invalidateRequest(id, 'Must specify proofId in request');
        return;
    }
    try {
        proofId = requestJson.proofId;
        const validateOracleProofOut = await module.exports.validateOracleProof(proofId, `${proofId}.provendb`, verbose);
        log.trace(validateOracleProofOut);
        if (validateOracleProofOut.proofIsValid) {
            await completeRequest(connection, id, proofId, validateOracleProofOut.messages);
        } else {
            await invalidateRequest(connection, id, JSON.stringify(validateOracleProofOut.messages));
        }
        await connection.query(
            `UPDATE provendbcontrol 
                SET last_checked=CURRENT_TIMESTAMP 
              WHERE proofId=:1`, [proofId]
        );
    } catch (error) {
        log.error('Error processing request: ', error.message);
        await invalidateRequest(connection, id, error.message);
    }
}

async function invalidateRequest(connection, id, message) {
    const sql = `
    UPDATE provendbrequests 
       SET status='FAILED',
           messages=@message,
           statusdate=getdate()
     WHERE ID=@id `;
    log.trace(sql);
    await connection.request().input('message', mssql.VarChar, message).input('id', mssql.Int, id).query(sql);
    log.error(`Request ${id} failed: ${message}`);
}

async function completeRequest(connection, id, proofId, messages = []) {
    const bindMessages = JSON.stringify(messages);
    const sql = `
    UPDATE provendbrequests 
       SET status='SUCCESS',
           statusdate=getdate(),
           proofId='${proofId}',
           messages='${bindMessages}'
     WHERE ID=${id}`;
    log.trace(sql);
    // TODO: Bind variables
    await connection.query(sql);
    log.info('Request ', id, ' succeeded');
}

async function anchor1Table({
    connection,
    config,
    tableName,
    whereClause,
    columnList,
    keyColumn
}) {
    /* const splitTableName = userNameTableName.split('.');
    if (splitTableName.length != 2) {
        const errm = 'Table Definitions should be in user.table format';
        log.error(errm);
        throw Error(errm);
    }
    const userName = splitTableName[0];
    const tableName = splitTableName[1];
    const tableDef = await module.exports.getTableDef(userName, tableName, verbose); */


    log.trace('Processing ', tableName);
    const tableData = await getTableData({
        connection,
        tableName,
        whereClause,
        columnList,
        keyColumn
    });
    log.trace(tableData[0]);

    const treeWithProof = await anchorData(tableData, config.anchorType, config.proofable.token, log.getLevel() === 'trace');
    if (debug) {
        console.log(treeWithProof);
        console.log(Object.keys(treeWithProof));
    }

    const proof = treeWithProof.proofs[0];
    const proofId = proof.id;
    /* await module.exports.saveproofToDB(
        treeWithProof,
        tableDef.tableOwner,
        tableDef.tableName,
        tableData,
        'AdHoc',
        whereClause,
        includeScn,
        columnList,
        keyColumn
    );
    log.info(`Proof ${proofId} created and stored to DB`);
    if (validate) {
        await module.exports.createProofFile(treeWithProof, validate, includeRowIds, verbose);
        log.info('Proof written to ', validate);
    } */

    return (proofId);
}

async function getTableData({
    connection,
    tableName,
    whereClause,
    columnList,
    keyColumn
}) {
    let where = '';
    let rowKey = keyColumn;
    if (!keyColumn || keyColumn === 'RID') {
        columnList = '%% physloc %% AS RID,' + columnList;
        rowKey = 'RID';
    }
    const keyValues = [];
    if (whereClause) {
        where = 'WHERE ' + whereClause;
    }
    const sql = `SELECT ${columnList} 
                 FROM ${tableName} 
                ${where}`;

    log.trace(sql);
    console.log(connection);
    const output = await connection.query(sql);
    for (let rowno = 0; rowno < output.recordset.length; rowno++) {
        const row = output.recordset[rowno];
        if (!(rowKey in row)) {
            throw Error(`key column ${keyColumn} not found in table`);
        }
        const key = row[rowKey];
        const value = row;
        keyValues.push({
            key,
            value
        });
    }
    return (keyValues);
}

async function createDemoUser(dbaConnection, flags) {
    log.info('Creating user and schema');
    const demoUser = flags.provendbUser + 'demo';
    const sqls = [];
    sqls.push(`CREATE LOGIN ${demoUser} WITH PASSWORD='${flags.provendbPassword}'
    `);
    sqls.push(`CREATE  USER ${demoUser} FOR LOGIN ${demoUser} 
    `);
    sqls.push(`CREATE DATABASE ${demoUser}
    `);
    sqls.push(`ALTER AUTHORIZATION ON DATABASE::${demoUser} TO ${flags.provendbUser}`);
    sqls.push(`USE ${demoUser}
    `);
    sqls.push(`CREATE TABLE contractsTable(
        contractId   NUMERIC IDENTITY PRIMARY KEY,
        metaData     VARCHAR(4000) CHECK (ISJSON(metadata)=1),
        contractData VARCHAR(4000) NOT NULL,
        mytimestamp DATE DEFAULT getdate()
      )`);
    sqls.push(`
    DECLARE
        @counter INTEGER=0; 
    BEGIN
        WHILE @counter < 1000 BEGIN
            INSERT INTO contractsTable(metaData,contractData)
            values( 
                '{"name":"A Name","Date":"A Date"}','jdfksljfdskfsdioweljdslfsdjlewowefsdfjl'
            );
            set @counter=@counter+1;
        END
    END
    `);
    for (let sqli = 0; sqli < sqls.length; sqli++) {
        const sql = sqls[sqli];
        try {
            log.trace(sql);
            await dbaConnection.query(sql);
        } catch (error) {
            log.warn(error.message, ' while executing ', sql);
        }
    }
}
async function createUser(dbaConnection, flags) {
    log.info('Creating user and schema');
    const sqls = [];
    sqls.push(`CREATE DATABASE ${flags.provendbUser} `);
    sqls.push(`CREATE LOGIN ${flags.provendbUser} WITH PASSWORD='${flags.provendbPassword}', DEFAULT_DATABASE=${flags.provendbUser}`);
    sqls.push(`CREATE USER ${flags.provendbUser} FOR LOGIN ${flags.provendbUser}`);
    sqls.push(`ALTER AUTHORIZATION ON DATABASE::${flags.provendbUser} TO ${flags.provendbUser}`);

    for (let sqli = 0; sqli < sqls.length; sqli++) {
        const sql = sqls[sqli];
        try {
            log.trace(sql);
            await dbaConnection.query(sql);
        } catch (error) {
            log.error(error.message, ' while executing ', sql);
            throw Error(error);
        }
    }
}

async function createTables(dbaConnection, flags) {
    log.info('Creating tables and procedures');
    const sqls = [];
    sqls.push(`USE ${flags.provendbUser}`);
    sqls.push(` 
    CREATE TABLE provendbcontrol (
        proofid      VARCHAR(256) PRIMARY KEY,
        owner_name   VARCHAR(128) NOT NULL,
        table_name   VARCHAR(128) NOT NULL,
        start_time   DATE NOT NULL,
        end_time     DATE NOT NULL,
        proof        NVARCHAR NOT NULL CHECK (ISJSON(proof)=1),
        proofType    VARCHAR(30) NOT NULL,
        whereclause  VARCHAR(2000),
        metadata     VARCHAR(4000) CHECK (ISJSON(metadata)=1),
        last_checked DATE
    )
    `);
    sqls.push(` 
    CREATE INDEX provendbcontrol_i1 ON
    provendbcontrol (
        owner_name,
        table_name,
        start_time,
        end_time)
    `);
    sqls.push(` 
    CREATE TABLE provendbcontrolrows (
        proofid     VARCHAR(256) NOT NULL,
        rowid_key   VARCHAR(128) NOT NULL,
        lsn BINARY, 
        versions_starttime timestamp,
        CONSTRAINT provendbcontrolrowids_pk 
        PRIMARY KEY ( proofid,rowid_key,lsn ) )
    `);
    sqls.push(` 
    ALTER TABLE provendbcontrolrows
    ADD CONSTRAINT provendbcontrolrowids_fk1 FOREIGN KEY ( proofid )
                REFERENCES provendbcontrol ( proofid )
    `);
    sqls.push(` 
    CREATE INDEX provendbcontrolrows_i1 
    ON provendbcontrolrows(rowid_key)
    `);
    sqls.push(` 
    CREATE TABLE provendbRequests (
        id NUMERIC  NOT NULL IDENTITY PRIMARY KEY,
        requestType VARCHAR(12) DEFAULT('ANCHOR'),
        requestJSON VARCHAR(4000) ,
        status      VARCHAR(12) DEFAULT('NEW'),
        statusDate  DATE DEFAULT (GETDATE()),
        messages    VARCHAR(4000),
        proofId     VARCHAR(256), 
        CONSTRAINT  requestIsJSON CHECK (ISJSON(requestJSON)=1) 
    )
    `);
    sqls.push(` 
    CREATE INDEX provendbRequests_i1 ON provendbRequests(status,statusDate)
    `);
    sqls.push(` 
    CREATE    PROCEDURE fanchorrequest (
        @tablename    VARCHAR(4000),
        @columnlist   VARCHAR(4000) = '*',
        @whereclause  VARCHAR (4000) = NULL,
        @keyColumn    VARCHAR (4000) = 'RID'  ) 
        AS BEGIN
        DECLARE @l_id    numeric;
        DECLARE @l_json  VARCHAR(4000);

        set @l_json = '{"table":"' + isnull(@tablename, '') + '"';
        IF @columnlist IS NOT NULL BEGIN
            set @l_json = isnull(@l_json, '') + ',"columns":"' + isnull(@columnlist, '') + '"';
        END

        IF @whereclause IS NOT NULL BEGIN
            set @l_json = isnull(@l_json, '') + ',"where":"' + isnull(@whereclause, '') + '"';
        END

        IF @keyColumn IS NOT NULL BEGIN
           set @l_json = isnull(@l_json, '')  + ',"keyColumn":"' + ISNULL(@keyColumn, '') + '"';
        END

        set @l_json = isnull(@l_json, '') + '}';
        INSERT INTO provendbrequests
            ( requesttype,requestjson )
        VALUES
            ( 'ANCHOR', @l_json );
        SELECT SCOPE_IDENTITY();

        END
    `);
    sqls.push(` 
    CREATE PROCEDURE fvalidateRequest ( @proofid varchar(512))  
    AS
    BEGIN
        DECLARE @l_id   numeric
        DECLARE @l_json VARCHAR(4000);
    
        SET @l_json ='{"proofId":"' + @proofId + '"}';
        INSERT INTO provendbrequests
            ( requesttype, requestjson )
        VALUES
            ( 'VALIDATE', @l_json )
        ;
        SELECT SCOPE_IDENTITY();
    END
    `);
    for (let sqli = 0; sqli < sqls.length; sqli++) {
        const sql = sqls[sqli];
        try {
            log.trace(sql);
            await dbaConnection.query(sql);
        } catch (error) {
            log.error(error.message, ' while executing ', sql);
            throw Error(error);
        }
    }
}

async function dropUser(dbaConnection, flags) {
    log.info(`Dropping user and objects for ${flags.provendbUser}`);
    const sqls = [];
    sqls.push(` USE ${flags.provendbUser} `);
    sqls.push(' DROP PROCEDURE fanchorrequest ');
    sqls.push(' DROP PROCEDURE fvalidaterequest ');
    sqls.push(' DROP TABLE provendbcontrolrows ');
    sqls.push(' DROP TABLE provendbcontrol ');
    sqls.push(' DROP TABLE provendbRequests ');
    sqls.push(' USE master ');
    sqls.push(`DROP DATABASE ${flags.provendbUser} `);
    sqls.push(`DROP USER ${flags.provendbUser} `);
    sqls.push(`DROP LOGIN ${flags.provendbUser} `);

    for (let sqli = 0; sqli < sqls.length; sqli++) {
        const sql = sqls[sqli];
        try {
            log.trace(sql);
            await dbaConnection.query(sql);
        } catch (error) {
            log.warn(error.message, ' while executing ', sql);
        }
    }
}

async function dropDemoUser(dbaConnection, flags) {
    const demoUser = flags.provendbUser + 'demo';
    log.info(`Dropping user and objects for ${demoUser}`);
    const sqls = [];
    sqls.push(` USE ${demoUser} `);
    sqls.push(' DROP TABLE contractsTable ');
    sqls.push(' USE master ');
    sqls.push(`DROP DATABASE ${demoUser} `);
    sqls.push(`DROP USER ${demoUser} `);
    sqls.push(`DROP LOGIN ${demoUser} `);

    for (let sqli = 0; sqli < sqls.length; sqli++) {
        const sql = sqls[sqli];
        try {
            log.trace(sql);
            await dbaConnection.query(sql);
        } catch (error) {
            log.warn(error.message, ' while executing ', sql);
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function connectDBA(flags) {
    if (flags.verbose) {
        log.setLevel('trace');
    }
    log.info('Connecting to SQL Server');
    try {
        // make sure that any items are correctly URL encoded in the connection string
        const connectionString = `${flags.sqlConnect};User Id=${flags.dbaUserName};Password=${flags.dbaPassword}`;
        log.trace('connection String: ', connectionString);
        const dbaConnection = await mssql.connect(connectionString);
        const checkOutput = await dbaConnection.query('SELECT current_timestamp AS timestamp');
        const connectionTimestamp = checkOutput.recordset[0].timestamp;
        log.trace('Connected at ', connectionTimestamp);
        return (dbaConnection);
    } catch (error) {
        log.error(error.stack);
        throw Error(error);
    }
}
