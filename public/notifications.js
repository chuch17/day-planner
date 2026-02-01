// notifications.js - Centralized Notification Manager

class NotificationManager {
    constructor() {
        this.audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg'); 
        this.requestPermission();
        this.setupAudioUnlock();
        
        // Queue System
        this.queue = [];
        this.isProcessing = false;
        this.responseTimeout = null;
    }

    requestPermission() {
        if ("Notification" in window) {
            Notification.requestPermission();
        }
    }

    // New: Unlock AudioContext on first user interaction
    setupAudioUnlock() {
        const unlock = () => {
            console.log("[Audio] Unlocking AudioContext...");
            // Play a silent buffer or just resume context
            this.audio.play().then(() => {
                this.audio.pause();
                this.audio.currentTime = 0;
            }).catch(() => {});

            // Initialize TTS (warmup)
            if (window.speechSynthesis) {
                window.speechSynthesis.resume();
            }

            document.removeEventListener('click', unlock);
            document.removeEventListener('keydown', unlock);
        };

        document.addEventListener('click', unlock);
        document.addEventListener('keydown', unlock);
    }

    // Public API to trigger a notification
    trigger(title, message, type = 'info', onSpeechEnd = null) {
        console.log(`[Notification] Queuing: ${title}`);
        
        // Add to queue
        this.queue.push({
            title, 
            message, 
            type, 
            onSpeechEnd
        });

        // Try to process
        this.processQueue();
    }

    // Signal that the user has responded (or we want to move on)
    resolve() {
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }

        if (this.isProcessing) {
            console.log("[Notification] Current resolved. Moving to next.");
            this.isProcessing = false;
            // Add a small delay so it doesn't feel instant
            setTimeout(() => this.processQueue(), 1000);
        }
    }

    async processQueue() {
        if (this.isProcessing) return;
        if (this.queue.length === 0) return;

        this.isProcessing = true;
        const current = this.queue.shift(); // FIFO

        console.log(`[Notification] Processing: ${current.title}`);

        try {
            await this.executeNotification(current);
        } catch (e) {
            console.error("[Notification] Execution failed:", e);
            this.isProcessing = false; // Reset on error
            this.processQueue(); // Try next
        }
    }

    async executeNotification(item) {
        let { title, message, type, onSpeechEnd } = item;

        // --- NEW: Universal Data Unwrapping for Chat/System ---
        if (message && typeof message === 'object') {
            console.log("[Notification] Unwrapping message object:", message);
            // Look for common keys, including the new 'step1'
            message = message.trigger || message.success || message.message || message.step1 || JSON.stringify(message);
        }
        // ------------------------------------------------------

        // 1. Audio Alert
        this.playTone();

        // 2. Browser Notification
        if (Notification.permission === "granted") {
            try {
                new Notification(title, { body: message, icon: '/favicon.ico' });
            } catch (e) {
                console.error("[Notification] System notification failed:", e);
            }
        }

        // 3. Chat Log
        if (window.addMessageToChat) {
            window.addMessageToChat(`🔔 <b>${title}</b><br>${message}`, 'ai');
        }

        // 4. Voice (TTS)
        // We wrap the onSpeechEnd to handle the "Waiting" logic
        const wrappedOnSpeechEnd = () => {
            console.log(`[Notification] Speech ended. Waiting logic for type: ${type}`);
            
            // A. Trigger the original callback (opens mic)
            if (onSpeechEnd) {
                try {
                    onSpeechEnd(); 
                } catch (err) {
                    console.error("Error in onSpeechEnd callback:", err);
                }
            }

            // B. Wait logic
            if (this.responseTimeout) clearTimeout(this.responseTimeout);

            if (type === 'checkin') {
                // Wait for explicit user response (via script.js -> resolve())
                // Safety timeout: 30 seconds
                this.responseTimeout = setTimeout(() => {
                    console.log("[Notification] Timed out waiting for response.");
                    this.resolve();
                }, 30000); 
            } else {
                // For 'start' or 'info', resolve quickly to allow next in queue
                // Small delay to prevent abrupt overlap
                this.responseTimeout = setTimeout(() => {
                    this.resolve();
                }, 3000); 
            }
        };

        await this.speak(message, wrappedOnSpeechEnd);
    }

    playTone() {
        try {
            this.audio.currentTime = 0;
            const promise = this.audio.play();
            if (promise !== undefined) {
                promise.catch(error => {
                    console.warn("[Audio] Autoplay blocked. User interaction needed.", error);
                });
            }
        } catch (e) {
            console.error("[Audio] Error:", e);
        }
    }

    async speak(text, onSpeechEnd) {
        // --- CRITICAL FIX: Ensure text is a string ---
        if (typeof text !== 'string') {
            console.error("[TTS] Error: speak() received a non-string value:", text);
            // Try to extract text if it's a common object structure
            if (text && typeof text === 'object') {
                text = text.trigger || text.success || text.message || text.step1 || JSON.stringify(text);
            } else {
                text = String(text || "System error, Sir.");
            }
        }
        
        console.log(`[TTS] Requesting Piper Voice: "${text.substring(0, 30)}..."`);
        
        let callbackCalled = false;
        const safeCallback = () => {
            if (callbackCalled) return;
            callbackCalled = true;
            if (onSpeechEnd) onSpeechEnd();
        };

        // Increase safety timeout to 60s for slower hardware
        const safetyTimeout = setTimeout(() => {
            console.warn("[TTS] Speech callback safety timeout reached.");
            safeCallback();
        }, 60000);

        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'TTS Server Error');
            }
            const data = await response.json();
            
            const audioUrl = `${data.url}?t=${Date.now()}`;
            const combinedAudio = new Audio(audioUrl);
            
            // Pre-load the audio fully before playing to prevent hangs
            combinedAudio.preload = "auto";

            combinedAudio.oncanplaythrough = () => {
                console.log("[TTS] Audio loaded and ready to play.");
                combinedAudio.play().catch(e => {
                    console.error("[TTS] Playback Error:", e);
                    safeCallback();
                });
            };

            combinedAudio.onended = () => {
                console.log("[TTS] Audio playback finished naturally.");
                clearTimeout(safetyTimeout);
                safeCallback();
            };

            combinedAudio.onerror = (e) => {
                console.error("[TTS] Audio Object Error:", e);
                clearTimeout(safetyTimeout);
                safeCallback();
            };

        } catch (error) {
            console.error("[TTS] Error:", error.message);
            clearTimeout(safetyTimeout);
            
            // Fallback to browser voice if server fails
            this.fallbackSpeak(text);
            
            // Give browser voice time to finish before firing callback
            const estimatedDuration = Math.max(3000, text.length * 80); 
            setTimeout(safeCallback, estimatedDuration);
        }
    }

    fallbackSpeak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("System notification. " + text);
        window.speechSynthesis.speak(utterance);
    }
}

// Export singleton instance
window.notifier = new NotificationManager();
