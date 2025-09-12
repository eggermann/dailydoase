const fs = require('fs')
const path = require('path')
const { NodeSSH } = require('node-ssh')

const ssh = new NodeSSH()


const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const destinationPath = 'Projekte/dailyDoase'///testDEPLOY;


const uploadDir = (localDir, remoteDir) => {

    const failed = []
    const successful = []
    return ssh.putDirectory(localDir, remoteDir, {
        recursive: true,
        concurrency: 1,
        // ^ WARNING: Not all servers support high concurrency
        // try a bunch of values and see what works on your server
        validate: function (itemPath) {
            const baseName = path.basename(itemPath);
            const deny = new Set(['.git', '.github', 'node_modules']);
            return !baseName.startsWith('.') && !deny.has(baseName);
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
    })
}

let fileNames = [
    'webpack.config.cjs',
    /*'composition.js',*/
    'start.js',
    /*'exemplar-cntr.txt', 
    'folder-cntr.txt', 
    */
    'semantic-stream.js',
    'package.json',
    'modulePolyfill.js'];

fileNames = fileNames.map(name => {
    return { local: __dirname + '/../' + name, remote: destinationPath + '/' + name };
});

ssh.connect({
    host: config.host,
    username: config.user,
    password: config.password,
}).then((i) => {

    (async () => {
        // Ensure base destination exists on remote
        await ssh.execCommand(`mkdir -p ${destinationPath}`);

        // Upload top-level files first
        await ssh.putFiles(fileNames);
        console.log("The File thing is done")

        // Upload candidate directories if they exist locally
        const candidates = [
            'lib',               // always include lib
            'dist',              // root-level dist (if webpack outputs here)
            'lib/web/dist'       // nested dist (webpack default)
        ];

        for (const name of candidates) {
            const localPath = path.resolve(__dirname, '..', name);
            if (!fs.existsSync(localPath)) {
                console.log(`skip: ${name} (not found at ${localPath})`);
                continue;
            }
            const remotePath = `${destinationPath}/${name}`;
            console.log('upload dir =>', name, 'from', localPath, 'to', remotePath);
            await ssh.execCommand(`mkdir -p ${remotePath}`);
            await uploadDir(localPath, remotePath);
        }

        // Done with all transfers
        // Run npm install on remote
        await ssh.execCommand(`cd ${destinationPath} && npm i `);
        ssh.dispose();
    })().catch((error) => {
        console.log("Something's wrong")
        console.log(error)
        ssh.dispose();
    })

})
