// ... existing code ...

// --- WebSocket Wake Word Listener ---
const setupWakeWordWS = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('[WakeWord] Connected to server proxy.');
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'WAKE_WORD_DETECTED') {
            console.log('[WakeWord] "Jarvis" detected! Activating microphone...');
            const voiceOrb = document.getElementById('voice-orb') || document.getElementById('mobile-voice-orb');
            if (voiceOrb) {
                voiceOrb.click(); // Trigger the existing recognition logic
                
                // Visual feedback on the orb
                voiceOrb.classList.add('wake-word-flash');
                setTimeout(() => voiceOrb.classList.remove('wake-word-flash'), 1000);
            }
        }
    };

    socket.onclose = () => {
        console.warn('[WakeWord] Disconnected. Retrying in 5s...');
        setTimeout(setupWakeWordWS, 5000);
    };

    socket.onerror = (err) => {
        console.error('[WakeWord] Socket error:', err);
    };
};

// Initialize WebSocket
setupWakeWordWS();

// --- NEURAL BRIDGE: Listen for Pulse from Native Shell ---
window.addEventListener('message', (event) => {
    // We accept messages from the parent (the Native Shell)
    if (event.data && event.data.type === 'WAKE_WORD_DETECTED') {
        console.log('[NeuralBridge] Pulse received from Native Shell. Activating...');
        const voiceOrb = document.getElementById('voice-orb') || document.getElementById('mobile-voice-orb');
        if (voiceOrb) {
            voiceOrb.click();
            voiceOrb.classList.add('wake-word-flash');
            setTimeout(() => voiceOrb.classList.remove('wake-word-flash'), 1000);
        }
    }
});

// Voice Interaction Logic (supports both desktop voice-orb and mobile mobile-voice-orb)
const voiceOrb = document.getElementById('voice-orb') || document.getElementById('mobile-voice-orb');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition && voiceOrb) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceOrb.classList.add('listening');
    };

    recognition.onend = () => {
        voiceOrb.classList.remove('listening');
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('User said:', transcript);
        
        const chatInput = document.getElementById("chat-input");
        if (chatInput) {
            chatInput.value = transcript;
            chatInput.focus();
            
            // Start Auto-Send Timer (desktop only - has chat-input-area)
            startAutoSendTimer();
        } else if (window.sendMobileVoiceMessage) {
            // Mobile: use custom handler if provided
            window.sendMobileVoiceMessage(transcript);
        } else {
            showToast(transcript, 'info');
        }

        // Remove the "Speaking" animation since we are just waiting for user now
        voiceOrb.classList.remove('speaking');
    };

    // Auto-Send Timer Logic (desktop only)
    let autoSendTimeout;
    const startAutoSendTimer = () => {
        const inputArea = document.querySelector('.chat-input-area');
        if (!inputArea) return; // Mobile has no chat input area
        
        // Clear existing timer if any
        if (document.getElementById('auto-send-bar')) {
            document.getElementById('auto-send-bar').remove();
        }
        if (autoSendTimeout) clearTimeout(autoSendTimeout);

        // Create Visual Timer Bar
        const timerBar = document.createElement('div');
        timerBar.id = 'auto-send-bar';
        inputArea.appendChild(timerBar);

        // 1. Initial "Grace Period" (2s) - Bar is static or pulsing
        // 2. Then "Countdown" (4s) - Bar shrinks
        
        // We'll use CSS animation for the 4s shrink
        // But first we wait 2s
        setTimeout(() => {
            if (!document.getElementById('auto-send-bar')) return; // Cancelled?
            
            timerBar.classList.add('counting-down'); // Triggers 4s CSS animation
            
            // Set the actual trigger
            autoSendTimeout = setTimeout(() => {
                const sendBtn = document.getElementById("chat-send-btn");
                if (sendBtn && document.getElementById("chat-input").value.trim() !== "") {
                    sendBtn.click(); // Auto-Click Send
                    showToast("Auto-sent voice message.", "success");
                }
                if (timerBar) timerBar.remove();
            }, 4000); // 4 seconds
            
        }, 2000); // 2 seconds grace
        
        // Allow cancellation by clicking the bar or typing
        const cancelTimer = () => {
            if (timerBar) timerBar.remove();
            if (autoSendTimeout) clearTimeout(autoSendTimeout);
        };
        
        timerBar.addEventListener('click', cancelTimer);
        const chatInputEl = document.getElementById("chat-input");
        if (chatInputEl) chatInputEl.addEventListener('input', cancelTimer);
    };

    voiceOrb.addEventListener('click', () => {
        try {
            recognition.start();
        } catch (e) {
            console.log('Recognition already started');
        }
    });
} else {
    if (voiceOrb) voiceOrb.style.display = 'none';
    console.log('Web Speech API not supported');
}

// Text-to-Speech (Updated to use Piper via notifications.js)
const speak = (text) => {
    if (window.notifier) {
        window.notifier.speak(text);
    } else {
        // Fallback
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
};

// Toast Notification System
const showToast = (msg, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    
    // Style roughly (we should add to CSS)
    toast.style.position = 'fixed';
    toast.style.bottom = '100px';
    toast.style.right = '30px';
    toast.style.background = type === 'error' ? '#ef4444' : '#333';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    toast.style.zIndex = '2000';
    toast.style.animation = 'fadeIn 0.3s';

    setTimeout(() => {
        toast.remove();
    }, 3000);
};

// AI Action Handler (Removed - now in script.js)
// const handleAIAction = async (actionWrapper) => { ... }

