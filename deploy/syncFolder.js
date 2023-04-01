const path = require('path');

const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const getFolderFromRemote = require('./getFolderFromRemote');
const handleDownloadedFolders = require('./handleDownloadedFolders.js');

const syncDir = './../images';
const destinationPath = 'Projekte/dailyDoase';

const _={
    sync:()=>{
        console.log('start upload sync');
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
    }
}
getFolderFromRemote().then(async () => {
   await  handleDownloadedFolders.pruneEmptyImages();
    console.log('done download and prune');

    //process.exit()

    _.sync()
})

//_.sync()