const fs = require('fs')
const path = require('path')
const {NodeSSH} = require('node-ssh')

const ssh = new NodeSSH()


const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const destinationPath = 'Projekte/dailyDoase/testDEPLOY';


const uploadDir = (localDir, remoteDir) => {

    const failed = []
    const successful = []
    ssh.putDirectory(localDir, remoteDir, {
        recursive: true,
        concurrency: 1,
        // ^ WARNING: Not all servers support high concurrency
        // try a bunch of values and see what works on your server
        validate: function (itemPath) {
            const baseName = path.basename(itemPath)
            return baseName.substr(0, 1) !== '.' && // do not allow dot files
                baseName !== 'node_modules' // do not allow node_modules
        },
        tick: function (localPath, remotePath, error) {
            if (error) {
                console.log('failed transfers', localPath)
                failed.push(localPath)
            } else {
                console.log('successful transfers', localPath)
                successful.push(localPath)
            }
        }
    }).then(function (status) {
        console.log('the directory transfer was', status ? 'successful' : 'unsuccessful')
        console.log('failed transfers', failed.join(', '))
        console.log('successful transfers', successful.join(', '))

        ssh.dispose();
    })
}

let fileNames = [/*'composition.js',*/ 'start.js', /*'exemplar-cntr.txt', 'folder-cntr.txt', */'package.json'];
fileNames = fileNames.map(name => {
    return {local: __dirname + '/../' + name, remote: destinationPath + '/' + name};
});

ssh.connect({
    host: config.host,
    username: config.user,
    password: config.password,
}).then((i) => {

    ssh.putFiles(fileNames).then(function () {
        console.log("The File thing is done")



        const folders = ['lib'/*, 'images'*/].map(name => {
            console.log('------> ',name)
            uploadDir(__dirname + '/../' + name, destinationPath + '/' + name);
        });


    }, function (error) {
        console.log("Something's wrong")
        console.log(error)
    })

})
