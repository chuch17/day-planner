require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Used for Ollama
const { exec, spawn } = require('child_process'); // For running Piper
const http = require('http');
const WebSocket = require('ws');
const { Porcupine, BuiltinKeyword, getBuiltinKeywordPath } = require('@picovoice/porcupine-node');
const { PvRecorder } = require('@picovoice/pvrecorder-node');

const app = express();
const port = 3022;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Wake Word Engine (Porcupine) ---
const PICOVOICE_ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY;
let porcupine = null;
let recorder = null;
let isWakeWordRunning = false;

async function startWakeWord() {
    if (!PICOVOICE_ACCESS_KEY || PICOVOICE_ACCESS_KEY === 'your_access_key_here') {
        console.warn("[WakeWord] No valid AccessKey found in .env. Wake word disabled.");
        return;
    }

    try {
        // Built-in keyword 'JARVIS' is available in Porcupine
        const keywordPath = getBuiltinKeywordPath(BuiltinKeyword.JARVIS);
        porcupine = new Porcupine(PICOVOICE_ACCESS_KEY, [keywordPath], [0.5]);
        
        const frameLength = porcupine.frameLength;
        recorder = new PvRecorder(frameLength);
        recorder.start();

        console.log(`[WakeWord] Listening for "Hey Jarvis"...`);
        isWakeWordRunning = true;

        while (isWakeWordRunning) {
            const pcm = await recorder.read();
            const keywordIndex = porcupine.process(pcm);
            if (keywordIndex !== -1) {
                console.log("[WakeWord] detected 'Jarvis'!");
                // Broadcast to all connected WebSocket clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'WAKE_WORD_DETECTED', keyword: 'Jarvis' }));
                    }
                });
            }
        }
    } catch (e) {
        console.error("[WakeWord] Error:", e.message);
        stopWakeWord();
    }
}

function stopWakeWord() {
    isWakeWordRunning = false;
    if (recorder) {
        recorder.stop();
        recorder.release();
        recorder = null;
    }
    if (porcupine) {
        porcupine.release();
        porcupine = null;
    }
}

// Start wake word engine (DISABLED FOR NOW)
// startWakeWord();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data file paths
const EVENTS_FILE = path.join(__dirname, 'data', 'events.json');
const TEMPLATES_FILE = path.join(__dirname, 'data', 'templates.json');
const CHAT_HISTORY_FILE = path.join(__dirname, 'data', 'chat_history.json');
const PIPER_DIR = path.join(__dirname, 'piper');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Ensure output directory exists (public)
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// Helper to read data
const readData = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data || (filePath.includes('events') ? '{}' : '[]'));
        }
        return filePath.includes('events') ? {} : [];
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return filePath.includes('events') ? {} : [];
    }
};

// Helper to write data
const writeData = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err);
        return false;
    }
};

// Chat History Persistence
let chatHistory = readData(CHAT_HISTORY_FILE);
if (!Array.isArray(chatHistory)) chatHistory = [];

function saveChatMessage(text, sender) {
    chatHistory.push({ text, sender, timestamp: new Date().toISOString() });
    // Keep last 100 messages
    if (chatHistory.length > 100) chatHistory.shift();
    writeData(CHAT_HISTORY_FILE, chatHistory);
    
    // Broadcast to all clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'NEW_CHAT_MESSAGE', data: { text, sender } }));
        }
    });
}

// --- API Routes ---

// Get chat history
app.get('/api/chat-history', (req, res) => {
    res.json(chatHistory);
});

// Endpoint to Forge a single item script (Sequential & Autonomous)
app.post('/api/forge-item', async (req, res) => {
    const { itemText, nextItemText, checklistTitle, history } = req.body;

    const systemPrompt = `
    You are Jarvis, a sophisticated, highly creative AI Assistant.
    GOAL: Forge an organic, 100% UNIQUE response for completing the task: "${itemText}".
    
    CONTEXT:
    - Current Checklist: "${checklistTitle}"
    - Next Task: ${nextItemText && nextItemText !== "null" ? `"${nextItemText}"` : "NONE (This is the final task of the list)"}
    - RECENTLY USED (FORBIDDEN PHRASES): ${JSON.stringify(history || [])}

    MANDATORY RULES:
    1. BE CONCISE: Max 12-15 words total.
    2. VARIETY IS KEY: Do NOT follow a fixed "Great job on X, next up is Y" template. 
    3. RANDOMIZE STRUCTURE: 
       - Sometimes start with the next task.
       - Sometimes use a witty observation about the current task.
       - Sometimes just a quick nod and a pivot.
    4. NO HALLUCINATIONS: If Next Task is "NONE", DO NOT mention a next task. NEVER use the word "null".
    5. FINAL TASK LOGIC: If this is the final task, focus on a sense of accomplishment or checking off the list.
    6. PERSONA: Address the user as "Sir". Be professional and efficient.

    OUTPUT FORMAT (JSON ONLY):
    {
      "variations": ["5-8 creative ways a user might phrase this"],
      "success": "Your unique, unstructured response here."
    }
    `;

    try {
        console.log(`[Server] Forging concise item: "${itemText}"...`);
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: "llama3",
            prompt: systemPrompt,
            stream: false,
            format: "json",
            options: { temperature: 0.9, num_ctx: 2048, num_predict: 150 }
        }, { timeout: 300000 });

        const jsonResponse = JSON.parse(response.data.response);
        
        // Final Safety Check: Never allow "null" to leak into the success string
        if (jsonResponse.success) {
            jsonResponse.success = jsonResponse.success.replace(/\bnull\b/gi, "everything");
        }

        res.json(jsonResponse);
    } catch (error) {
        console.error("[Forge] Item Error:", error.message);
        res.json({
            variations: [itemText.toLowerCase()],
            success: nextItemText && nextItemText !== "null"
                ? `Well done on ${itemText}, Sir. Next up is ${nextItemText}.`
                : `That completes the ${itemText}, Sir. Excellent.`
        });
    }
});

// Endpoint to Forge Summaries
app.post('/api/forge-summaries', async (req, res) => {
    const { title, items } = req.body;

    const systemPrompt = `
    You are Jarvis, a sophisticated, witty, yet highly efficient AI Assistant.
    GOAL: Forge a brief, professional "Trailer", "Briefing", and "Warning" for: "${title}".
    Items: ${items.join(', ')}

    RULES:
    1. Modern English only. No archaic flair.
    2. Be concise (max 15-20 words per script). Address him as Sir.
    3. PRE-START TRAILER: Give a sophisticated, human-like heads-up. Instead of just listing items, summarize the "mission". E.g., "Sir, your morning routine begins in 5 minutes. We'll be focusing on your personal care and preparation."
    4. START BRIEFING: Announce the start with energy. Clearly state the first task.
    5. PRE-END WARNING: Mention 5 minutes remaining and remind him of the objective.
    6. COMPLETION MESSAGE: A final professional victory script. If this was the last thing on the schedule, mention he has a clear day ahead.

    OUTPUT FORMAT (JSON ONLY):
    {
      "preStartSummary": "Sophisticated trailer here.",
      "startSummary": "Energetic briefing here.",
      "preEndSummary": "Polite 5-minute warning here.",
      "completionMessage": "Professional victory script here."
    }
    `;

    try {
        console.log(`[Server] Forging concise summaries for: "${title}"...`);
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: "llama3",
            prompt: systemPrompt,
            stream: false,
            format: "json", 
            options: { temperature: 0.7, num_ctx: 2048, num_predict: 250 }
        }, { timeout: 300000 }); // 5 minute timeout

        res.json(JSON.parse(response.data.response));
    } catch (error) {
        console.error("[Forge] Summary Error:", error.message);
        // Robust Fallback
        res.json({
            preStartSummary: `Sir, your ${title} begins in five minutes. we have ${items.length} tasks to handle.`,
            startSummary: `It is time for your ${title}, Sir. Shall we begin with ${items[0]}?`,
            preEndSummary: `Sir, you have five minutes remaining for your ${title}.`,
            completionMessage: `That concludes the ${title}, Sir. Splendid work.`
        });
    }
});

const os = require('os');

// PIPER TTS ENDPOINT
app.post('/api/speak', (req, res) => {
    let text = req.body.text;
    if (!text) return res.status(400).json({ error: 'Text required' });

    // Sanity check for variable names
    if (/^[a-z]+[A-Z][a-z]+$/.test(text)) {
        console.warn(`[TTS] Warning: Detected potential variable name: "${text}"`);
    }

    const fileName = `tts_${Date.now()}.wav`;
    const outputFile = path.join(PUBLIC_DIR, fileName);
    const piperPath = path.join(PIPER_DIR, 'piper.exe');
    const modelPath = path.join(PIPER_DIR, 'en_GB-alan-medium.onnx'); 
    const ffmpegPath = path.join(__dirname, 'ffmpeg_tool', 'bin', 'ffmpeg.exe');
    const jinglePath = path.join(PUBLIC_DIR, 'jingle.mp3');
    const tempVoiceFile = path.join(PUBLIC_DIR, `temp_voice_${Date.now()}.wav`);

    console.log(`[TTS] Request for: "${text.substring(0, 30)}..."`);

    try {
        const { execSync } = require('child_process');
        
        console.log(`[TTS] Running Piper (Sync)...`);
        
        // Increase timeout to 60s for Piper generation
        execSync(`"${piperPath}" --model "${modelPath}" --output_file "${tempVoiceFile}"`, { 
            input: text,
            windowsHide: true,
            timeout: 60000 
        });

        if (!fs.existsSync(tempVoiceFile)) {
            throw new Error('Voice file not generated');
        }

        // 2. Mix with Jingle
        if (fs.existsSync(jinglePath) && fs.existsSync(ffmpegPath)) {
            console.log("[TTS] Mixing with Jingle...");
            const mixCommand = `"${ffmpegPath}" -y -i "${jinglePath}" -i "${tempVoiceFile}" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1" "${outputFile}"`;
            
            // Use a slightly longer timeout for FFmpeg mixing
            exec(mixCommand, { timeout: 30000 }, (mixError, mixStdout, mixStderr) => {
                if (fs.existsSync(tempVoiceFile)) {
                    try { fs.unlinkSync(tempVoiceFile); } catch(e) {}
                }

                if (mixError) {
                    console.error(`[FFmpeg] Mix Error: ${mixError.message}`);
                    console.log("[TTS] Falling back to raw voice.");
                    try {
                        if (fs.existsSync(tempVoiceFile)) {
                            fs.renameSync(tempVoiceFile, outputFile);
                        }
                    } catch(e) {
                        console.error("[TTS] Rename fallback failed:", e.message);
                    }
                }
                res.json({ url: `/${fileName}` });
            });
        } else {
            console.log("[TTS] Delivering raw voice.");
            fs.renameSync(tempVoiceFile, outputFile);
            res.json({ url: `/${fileName}` });
        }

    } catch (e) {
        console.error(`[TTS] Critical Catch: ${e.message}`);
        if (fs.existsSync(tempVoiceFile)) {
            try { fs.unlinkSync(tempVoiceFile); } catch(err) {}
        }
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});


// Endpoint to Generate Phrase (Pre-fetch) - Supports 'checkin', 'start', 'pre_start', 'pre_end', 'end'
app.post('/api/generate-checkin', async (req, res) => {
    const { eventTitle, timeOfDay, type } = req.body;
    
    let systemPrompt = "";

    if (type === 'pre_start') {
        systemPrompt = `
        You are Jarvis. It is ${timeOfDay}.
        Context: The event "${eventTitle}" will start in 5 minutes.
        GOAL: Generate a JSON object: { "trigger": "..." }
        RULE: Just a friendly heads-up addressed to "Sir". "Excuse me Sir, ${eventTitle} begins in 5 minutes."
        `;
    } else if (type === 'start') {
        systemPrompt = `
        You are Jarvis. It is ${timeOfDay}.
        Context: The event "${eventTitle}" is starting NOW.
        GOAL: Generate a JSON object: { "trigger": "..." }
        RULE: Inform the user it's time to begin. Address him as "Sir". "It is time for ${eventTitle}, Sir."
        `;
    } else if (type === 'checkin') {
        systemPrompt = `
        You are Jarvis. It is ${timeOfDay}.
        Context: The event "${eventTitle}" started 5 minutes ago.
        GOAL: Generate a JSON object: { "trigger": "...", "reply_yes": "...", "reply_no": "..." }
        RULE: Ask if they actually started it. Address him as "Sir". "Regarding ${eventTitle}, did you start it, Sir??"
        `;
    } else if (type === 'pre_end') {
        systemPrompt = `
        You are Jarvis. It is ${timeOfDay}.
        Context: The event "${eventTitle}" ends in 5 minutes.
        GOAL: Generate a JSON object: { "trigger": "..." }
        RULE: Notify the user of remaining time. Address him as "Sir". "Sir, you have 5 minutes remaining for ${eventTitle}."
        `;
    } else if (type === 'end') {
        systemPrompt = `
        You are Jarvis. It is ${timeOfDay}.
        Context: The event "${eventTitle}" has ended.
        GOAL: Generate a JSON object: { "trigger": "...", "reply_yes": "...", "reply_no": "..." }
        RULE: Ask if they finished the task. Address him as "Sir". "The time for ${eventTitle} has concluded. Did you finish it, Sir??"
        `;
    }

    try {
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: "llama3",
            prompt: systemPrompt,
            stream: false,
            format: "json", 
            options: {
                temperature: 0.85, 
                num_ctx: 1024
            }
        }, { timeout: 120000 }); 

        const jsonResponse = JSON.parse(response.data.response);
        res.json(jsonResponse); 

    } catch (error) {
        console.error("Gen Error:", error.message);
        // Fallbacks
        const fallbacks = {
            pre_start: { trigger: `${eventTitle} starts in 5 minutes, sir.` },
            start: { trigger: `It's time for ${eventTitle}, sir.` },
            checkin: { trigger: `Did you start ${eventTitle}, sir?`, reply_yes: "Splendid.", reply_no: "I see." },
            pre_end: { trigger: `5 minutes left for ${eventTitle}, sir.` },
            end: { trigger: `${eventTitle} has ended. Did you finish, sir?`, reply_yes: "Excellent.", reply_no: "Understood." }
        };
        res.json(fallbacks[type] || fallbacks.checkin);
    }
});

// Chat Endpoint (Using Local Llama 3 via Ollama)
app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.message;
    
    try {
        // 1. Get Current Context (Today's Events)
        const eventsData = readData(EVENTS_FILE);
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        const todaysEvents = eventsData[dateKey] || [];
        
        // Find Active Event (CRITICAL: Must not be completed)
        const nowMins = today.getHours() * 60 + today.getMinutes();
        const activeEvent = todaysEvents.find(e => {
            const start = e.startHour * 60 + e.startMin;
            const end = start + e.duration;
            // Precise logic: Event must be in current time range AND NOT COMPLETED
            return nowMins >= start && nowMins < end && e.completed !== true;
        });

        // 2. System Prompt - TIGHTENED FOR CHECK AND BALANCES
        const systemPrompt = `
        You are Jarvis, a professional and precise AI Day Planner Assistant. 
        Current Date: ${today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
        Current Time: ${today.toLocaleTimeString()}.
        
        SOURCE OF TRUTH (Actual Status):
        - ACTIVE EVENT NOW: ${activeEvent ? JSON.stringify(activeEvent) : "None (User is currently in transition or free time)"}
        - TODAY'S SCHEDULE: ${JSON.stringify(todaysEvents)}
        
        MANDATORY RULES:
        1. ALWAYS address the user as "Sir". NEVER invent or use any other name.
        2. DO NOT initiate scheduling advice or check-ins. The Priority Queue handles all timing.
        3. IF "ACTIVE EVENT NOW" is "None", acknowledge the user is ahead of schedule or in a buffer zone if they ask about their status.
        4. IF the user asks to create/delete/complete an event, use the provided JSON actions.
        5. DO NOT hallucinate events that aren't in the schedule.
        6. Keep replies professional, concise, and reactive only.
        
        Supported JSON Actions:
        - { "type": "create_event", "data": { ... } }
        - { "type": "delete_event", "id": ... }
        - { "type": "complete_event", "id": ... }
        - { "type": "read_schedule" }
        - { "reply": "Your text response here" }
        `;

        // 3. Call Local Ollama API
        console.log("Sending to Ollama...");
        const response = await axios.post('http://localhost:11434/api/chat', {
            model: "llama3", // Make sure this matches what you pulled in Ollama
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            stream: false,
            format: "json" // Forces JSON output
        }, {
            timeout: 180000 // 180 second timeout for CPU inference (increased for first run)
        });

        const aiContent = response.data.message.content;
        console.log("Ollama Response:", aiContent);

        // Save User Message
        saveChatMessage(userMessage, 'user');

        // 4. Parse Response
        try {
            const parsed = JSON.parse(aiContent);
            
            // If the AI just sent a reply text inside JSON
            if (parsed.reply) {
                saveChatMessage(parsed.reply, 'ai');
                return res.json({ reply: parsed.reply });
            }
            
            // If the AI sent an action (create_event, etc.)
            // We'll wrap it in our standard format for the frontend
            if (parsed.type) {
                saveChatMessage("On it.", 'ai');
                return res.json({ 
                    reply: "On it.", 
                    action: parsed 
                });
            }

            // Fallback if structure is weird
            const fallbackReply = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            saveChatMessage(fallbackReply, 'ai');
            return res.json({ reply: fallbackReply });

        } catch (e) {
            // If not JSON, send raw text
            saveChatMessage(aiContent, 'ai');
            return res.json({ reply: aiContent });
        }

    } catch (error) {
        console.error("Ollama Error:", error.message);
        if (error.code === 'ECONNREFUSED') {
            res.status(500).json({ reply: "I can't reach your brain (Ollama). Is it running? Run 'ollama run llama3' in a terminal." });
        } else {
            res.status(500).json({ reply: "Sorry, my local brain is having trouble." });
        }
    }
});

// Get all events
app.get('/api/events', (req, res) => {
    const events = readData(EVENTS_FILE);
    res.json(events);
});

// Save new event(s)
app.post('/api/events', (req, res) => {
    const data = req.body; 
    const events = readData(EVENTS_FILE);
    
    const newEvents = Array.isArray(data) ? data : [data];
    
    newEvents.forEach(evt => {
        const dateKey = evt.dateKey;
        if (!events[dateKey]) {
            events[dateKey] = [];
        }
        events[dateKey].push(evt);
    });
    
    if (writeData(EVENTS_FILE, events)) {
        res.status(201).json({ success: true, count: newEvents.length });
    } else {
        res.status(500).json({ error: 'Failed to save events' });
    }
});

// Update an event
app.put('/api/events/:id', (req, res) => {
    const eventId = parseFloat(req.params.id); 
    const updatedEvent = req.body;
    const events = readData(EVENTS_FILE);
    
    let found = false;
    for (const key in events) {
        const index = events[key].findIndex(e => e.id === eventId);
        if (index !== -1) {
            events[key].splice(index, 1); // Remove old
            found = true;
            break; 
        }
    }
    
    if (found) {
        const newKey = updatedEvent.dateKey;
        if (!events[newKey]) {
            events[newKey] = [];
        }
        events[newKey].push(updatedEvent);
        
        if (writeData(EVENTS_FILE, events)) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to write data' });
        }
    } else {
        res.status(404).json({ error: 'Event not found' });
    }
});

// Delete an event or series
app.delete('/api/events/:id', (req, res) => {
    const eventId = parseFloat(req.params.id);
    const deleteSeries = req.query.series === 'true'; 
    const events = readData(EVENTS_FILE);
    
    let deletedCount = 0;
    
    if (deleteSeries) {
        let seriesId = null;
        for (const key in events) {
            const evt = events[key].find(e => e.id === eventId);
            if (evt && evt.seriesId) {
                seriesId = evt.seriesId;
                break;
            }
        }

        if (seriesId) {
            for (const key in events) {
                const originalLength = events[key].length;
                events[key] = events[key].filter(e => e.seriesId !== seriesId);
                if (events[key].length < originalLength) {
                    deletedCount += (originalLength - events[key].length);
                }
                if (events[key].length === 0) {
                    delete events[key];
                }
            }
        }
    } 
    
    if (!deleteSeries || deletedCount === 0) {
        let found = false;
        for (const key in events) {
            const index = events[key].findIndex(e => e.id === eventId);
            if (index !== -1) {
                events[key].splice(index, 1);
                if (events[key].length === 0) {
                    delete events[key];
                }
                found = true;
                break;
            }
        }
        if (found) deletedCount = 1;
    }
    
    if (deletedCount > 0) {
        if (writeData(EVENTS_FILE, events)) {
            res.json({ success: true, count: deletedCount });
        } else {
            res.status(500).json({ error: 'Failed to write data' });
        }
    } else {
        res.status(404).json({ error: 'Event not found' });
    }
});

// Mark event as complete
app.post('/api/events/:id/complete', (req, res) => {
    const eventId = parseFloat(req.params.id);
    const events = readData(EVENTS_FILE);
    
    let found = false;
    for (const key in events) {
        const evt = events[key].find(e => e.id === eventId);
        if (evt) {
            evt.completed = true;
            evt.color = "#808080"; // Turn gray to visually indicate completion
            found = true;
            break;
        }
    }
    
    if (found) {
        if (writeData(EVENTS_FILE, events)) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to write data' });
        }
    } else {
        res.status(404).json({ error: 'Event not found' });
    }
});

// Get all templates
app.get('/api/templates', (req, res) => {
    const templates = readData(TEMPLATES_FILE);
    res.json(templates);
});

// Save a new template
app.post('/api/templates', (req, res) => {
    const newTemplate = req.body;
    let templates = readData(TEMPLATES_FILE);
    
    const exists = templates.find(t => t.title === newTemplate.title && t.type === newTemplate.type);
    if (!exists) {
        templates.push(newTemplate);
        if (writeData(TEMPLATES_FILE, templates)) {
            res.status(201).json({ success: true, template: newTemplate });
        } else {
            res.status(500).json({ error: 'Failed to save template' });
        }
    } else {
        res.status(200).json({ success: true, message: 'Template already exists' });
    }
});

// Delete a template
app.delete('/api/templates/:title', (req, res) => {
    const title = req.params.title;
    let templates = readData(TEMPLATES_FILE);
    
    const initialLength = templates.length;
    templates = templates.filter(t => t.title !== title);
    
    if (templates.length < initialLength) {
        if (writeData(TEMPLATES_FILE, templates)) {
            res.json({ success: true, message: `Template "${title}" deleted` });
        } else {
            res.status(500).json({ error: 'Failed to update templates file' });
        }
    } else {
        res.status(404).json({ error: 'Template not found' });
    }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  
  // Startup check for Piper
  try {
      const piperPath = path.join(PIPER_DIR, 'piper.exe');
      const { execSync } = require('child_process');
      const out = execSync(`"${piperPath}" --version`);
      console.log(`[Startup] Piper Check: ${out.toString().trim()}`);
  } catch (e) {
      console.error(`[Startup] Piper Check FAILED: ${e.message}`);
  }
});
