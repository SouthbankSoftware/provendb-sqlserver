const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const passwordPrompt = require('password-prompt');
const {
    installPDB4SS
} = require('../services/sqlserver');
const {
    saveConfig
} = require('../services/config');
const { setGracefulCleanup } = require('tmp');


/* const {
    saveConfig
} = require('../services/config'); */



class InstallCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(InstallCommand);
            const verbose = flags.verbose;


            if (verbose) {
                log.setLevel('trace');
            }
            log.trace(flags);

            if (!flags.dbaPassword) {
                flags.dbaPassword = await passwordPrompt(`Enter ${dbUserName} password: `, {
                    method: 'mask'
                });
            }
            const connectionString=await installPDB4SS(flags);
            log.trace(flags.config);
            if (flags.config) {
                log.trace(connectionString)
                 const dbConnection = {connectionType:'SQLSERVER', connectionString};
                await saveConfig(flags.config, dbConnection, flags.verbose);
            }
            log.info('Install complete');
            await sleep(1000)
            process.exit(0)
        } catch (error) {
            log.error('Failed to install:');
            log.trace(error.stack);
            log.error(error.message);
        }
    }
}

InstallCommand.description = 'Installs the ProvenDB for SQL Server users and tables';

InstallCommand.flags = {

    verbose: flags.boolean({
        char: 'v',
        description: 'increased logging verbosity',
        default: false
    }),
    config: flags.string({
        description: 'Create config file',
        required: false
    }),
    sqlConnect: flags.string({
        description: 'SQL Server connection String (over-rides instance and port)',
        required: false
    }),
    instance: flags.string({
        description: 'SQL Server instance',
        required: false,
        default: 'localhost'
    }),
    port: flags.integer({
        description: 'SQL Server port',
        required: false,
        default: 1433
    }),
    dbaPassword: flags.string({
        description: 'DBA Password',
        required: false
    }),
    dbaUserName: flags.string({
        description: 'DBA Username',
        required: false,
        default: 'SA'
    }),
    provendbUser: flags.string({
        description: 'ProvenDB User Name (defaut: provendb)',
        default: 'provendb'
    }),
    provendbPassword: flags.string({
        description: 'ProvenDB User Password',
        required: true
    }),
    dropExisting: flags.boolean({
        description: 'Drop existing users if they exist',
        default: false
    }),
    createDemoAccount: flags.boolean({
        description: 'Create the ProvenDB Demo account ',
        default: false
    }),
};

module.exports = InstallCommand;


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}