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
            await installPDB4SS(flags);
            log.trace(flags.config);
            if (flags.config) {
                const connectionString = `${flags.sqlConnect};User Id=${flags.provendbUser};Password=${flags.provendbPassword}`;
                const dbConnection = {connectionType:'SQLSERVER', connectionString};
                await saveConfig(flags.config, dbConnection, flags.verbose);
            }
        } catch (error) {
            log.error('Failed to install:');
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
        description: 'SQL Server connection String',
        required: true,
        default: 'Server=localhost,1433;Encrypt=false'
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
