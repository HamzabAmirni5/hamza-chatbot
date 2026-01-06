const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');

const sessionDir = path.join(__dirname, 'session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function getGPTResponse(message) {
    try {
        // Using Hercai Free API - Reliable for simple GPT responses
        // You can swap this for any other API (e.g. OpenAI)
        const { data } = await axios.get(`https://hercai.zaide.op/v2/hercai?question=${encodeURIComponent(message)}`);
        return data.reply;
    } catch (error) {
        console.error("GPT API Error:", error.message);
        return "⚠️ I'm having trouble connecting to my brain server.";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['GPT Auto Bot', 'Chrome', '1.0.0'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: undefined,
    });

    // Pairing Code Login
    if (!sock.authState.creds.registered) {
        console.log(chalk.yellow("⚠️ No session found. Please pair."));
        try {
            const phoneNumber = await question(chalk.green('Enter your WhatsApp number (e.g., 2126...): '));
            if (phoneNumber) {
                const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
                console.log(chalk.bgGreen.black(` Your Pairing Code: `), chalk.bold.red(code));
            }
        } catch (e) {
            console.error("Pairing Error:", e);
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red(`Connection closed. Reconnecting: ${shouldReconnect}`));
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Bot Connected! GPT Auto-Reply is active for ALL messages.'));
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            // Only process notify messages
            if (chatUpdate.type !== 'notify') return;

            for (const msg of chatUpdate.messages) {
                if (!msg.message || msg.key.fromMe) continue; // Ignore self and empty messages

                const type = Object.keys(msg.message)[0];

                // Extract text body
                let body = (type === 'conversation') ? msg.message.conversation :
                    (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
                        (type === 'imageMessage') ? msg.message.imageMessage.caption :
                            (type === 'videoMessage') ? msg.message.videoMessage.caption : '';

                if (!body) continue;

                // Ignore Status Updates and Newsletters
                if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.includes('@newsletter')) continue;

                console.log(chalk.cyan(`Thinking response for: ${body.substring(0, 30)}...`));

                // Send "typing..." status
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

                // Get GPT Response
                const reply = await getGPTResponse(body);

                // Reply to user
                await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error in message handler:', err);
        }
    });

    // Handle unhandled rejections to prevent crash
    process.on('uncaughtException', console.error);
    process.on('unhandledRejection', console.error);
}

startBot();
