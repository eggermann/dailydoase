require('dotenv').config();
const fs = require('fs');
const os = require('os');

const resolvePrivateKey = (value) => {
    if (!value) return value;
    const filePath = value.startsWith('~/') ? `${os.homedir()}${value.slice(1)}` : value;
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
    // A non-PEM, unreadable value is a path typo, not a usable key. Returning
    // undefined lets an intentionally configured password authenticate instead.
    return value.includes('BEGIN') ? value.replace(/\\n/g, '\n') : undefined;
};

const parseJsonConfig = (value) => {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value.replace(/^['"]|['"]$/g, ''));
    } catch (error) {
        throw new Error(`Invalid SSH_PRIVATE_CONFIG JSON: ${error.message}`);
    }
};

const loadSshConfig = () => {
    const jsonConfig = parseJsonConfig(process.env.SSH_PRIVATE_CONFIG);
    if (jsonConfig) {
        return {
            ...jsonConfig,
            username: jsonConfig.username || jsonConfig.user,
            user: jsonConfig.user || jsonConfig.username,
            privateKey: resolvePrivateKey(jsonConfig.privateKey || jsonConfig.key),
        };
    }

    const host = process.env.SSH_HOST;
    const username = process.env.SSH_USER || process.env.SSH_USERNAME;
    const password = process.env.SSH_PASSWORD;
    const privateKey = process.env.SSH_KEY_PATH || process.env.SSH_PRIVATE_KEY_PATH;

    if (!host || !username) {
        throw new Error('Missing SSH_HOST or SSH_USER in .env');
    }

    const config = { host, username };
    if (password) {
        config.password = password;
    }
    if (privateKey) {
        config.privateKey = resolvePrivateKey(privateKey);
    }

    if (!config.password && !config.privateKey) {
        throw new Error('Set SSH_PASSWORD or SSH_KEY_PATH in .env');
    }

    return {
        ...config,
        user: config.username,
    };
};

module.exports = { loadSshConfig };
