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
const { loadAll } = require('js-yaml');
const sqlConnection = require('mssql');
const {
    setGracefulCleanup
} = require('tmp');
const log = require('simple-node-logger').createSimpleLogger();
const {
    flags
} = require('../commands/install');


const debug = false;

module.exports = {
    installPDB4SS: async (flags) => {
        if (flags.verbose) {
            log.setLevel('trace');
        }
        const dbaConnection = await connectSQLServer(flags);
        if (flags.dropExisting) {
            await dropUser(dbaConnection, flags);
            if (flags.createDemoAccount) {
                await dropDemoUser(dbaConnection, flags);
            }
        }
        await createUser(dbaConnection, flags);
        await createTables(dbaConnection, flags);
        if (flags.createDemoAccount) {
            await createDemoUser(dbaConnection, flags);
        }
    }
};

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
    sqls.push(`CREATE LOGIN ${flags.provendbUser} WITH PASSWORD='${flags.provendbPassword}'`);
    sqls.push(`CREATE USER ${flags.provendbUser} FOR LOGIN ${flags.provendbUser} WITH DEFAULT_SCHEMA=${flags.provendbUser}`);
    sqls.push(`CREATE DATABASE ${flags.provendbUser} `);
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
        @keyColumn    VARCHAR (4000) = 'ROWID'  ) 
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

async function connectSQLServer(flags) {
    if (flags.verbose) {
        log.setLevel('trace');
    }
    log.info('Connecting to SQL Server');
    try {
        // make sure that any items are correctly URL encoded in the connection string
        const connectionString = `${flags.sqlConnect};User Id=${flags.dbaUserName};Password=${flags.dbaPassword}`;
        log.trace('connection String: ', connectionString);
        const dbaConnection = await sqlConnection.connect(connectionString);
        const checkOutput = await dbaConnection.query('SELECT current_timestamp AS timestamp');
        const connectionTimestamp = checkOutput.recordset[0].timestamp;
        log.trace('Connected at ', connectionTimestamp);
        return (dbaConnection);
    } catch (error) {
        log.error(error.stack);
        throw Error(error);
    }
}
