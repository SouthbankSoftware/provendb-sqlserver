const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const {
    connectSQLServer,
    processRequests

} = require('../services/sqlserver');

const {
    getConfig
} = require('../services/config');

// TODO: Should not terminate when Oracle connection is lost
// TODO: When a proof is found to be invalidate, mabye mark invalid and don't try again
class MonitorCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(MonitorCommand);
            const {
                tables,
                interval,
                maxTime,
                verbose,
                validateInterval
            } = flags;

            // Load Config
            const config = await getConfig(flags.config);

            if (verbose) {
                log.setLevel('trace');
                log.trace(config);
            }

            // Establish connection:
            const connection = await connectSQLServer(config, verbose);

            log.info(`Monitoring with ${interval} s interval.`);
            // eslint-disable-next-line no-constant-condition

            const monitorStartTime = (new Date().getTime());
            let monitorLoop = true;
            while (monitorLoop) {
                const elapsedTime = (new Date().getTime()) - monitorStartTime;
                log.trace(`Elapsed time ${elapsedTime}`);
                if ((elapsedTime > (maxTime * 1000)) && maxTime > 0) {
                    log.info(`Max monitoring time ${maxTime} exceeded`);
                    log.info('Exiting');
                    monitorLoop = false;
                    break;
                }

                log.info('Looking for new requests in the provendbRequests table');
                await processRequests(connection, config, verbose);
                log.info(`Waiting for ${interval} seconds`);
                // TODO: Equivalent of DBMS_ALERT?
                await new Promise((resolve) => setTimeout(resolve, 1000 * interval));
            }
        } catch (error) {
            log.error('Failed to monitor database:');
            log.error(error.message);
        }
    }
}

//  TODO: write test cases for monitor requests table
//  TODO: write test cases for columnLists

MonitorCommand.description = `Monitor the database for commands.

provendb-sqlserver will await requests made through the stored procedure
interface and execute them. 
`;

MonitorCommand.flags = {
    interval: flags.integer({
        char: 'i',
        description: 'polling interval',
        default: 120
    }),
    maxTime: flags.integer({
        char: 'm',
        description: 'Maximum number of seconds to monitor',
        default: 0
    }),
    verbose: flags.boolean({
        char: 'v',
        description: 'increased logging verbosity',
        default: false
    }),
    config: flags.string({
        string: 'c',
        description: 'config file location',
        required: false
    })/*,
    validateInterval: flags.integer({
        string: 'k',
        description: 're-validate proofs which have not been validated after this many seconds',
        required: false
    })*/
    // TODO: Implement the validateInterval flag
};

module.exports = MonitorCommand;
