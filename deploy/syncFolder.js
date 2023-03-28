const path = require('path');

const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const destinationPath = 'Projekte/dailyDoase';

const syncDir = './../images';

require('ssh-sync')({
        watch: true,
        /*
            will call rsync on any changes within the local.directory
        */
        local: {
            directory: syncDir
        },
        remote: {
            address: config.host,
            user: config.user,
            key: '/home/eggman/.ssh/id_rsa',
            directory: path.join(destinationPath, syncDir)
        }
    }
);