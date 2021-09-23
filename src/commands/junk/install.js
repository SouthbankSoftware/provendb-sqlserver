const {
    Command,
    flags
} = require('@oclif/command');

const log = require('simple-node-logger').createSimpleLogger();
const passwordPrompt = require('password-prompt');

/*const {
    saveConfig
} = require('../services/config');*/



class InstallCommand extends Command {
    async run() {
        try {
            // Extract flags.
            const {
                flags
            } = this.parse(InstallCommand);
            const { createDemoAccount
            } = flags;

            if (verbose) {
                log.setLevel('trace');
            }
            log.trace(flags);
        } catch (error) {
            log.error('Failed to install:');
            log.error(error.message);
        }
    }
}

InstallCommand.description = `Installs the ProvenDB for SQL Server users and tables
`;

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
    oracleConnect: flags.string({
        description: 'SQL Server connection String',
        required: true
    }),
    dbaPassword: flags.string({
        description: 'DBA Password',
        required: false
    }),
    dbaUserName: flags.string({
        description: 'DBA Username',
        required: false
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
