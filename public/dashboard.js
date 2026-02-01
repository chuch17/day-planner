// dashboard.js - Handles the Clock and Status Dashboard (Left Panel)

const clockTime = document.getElementById("clock-time");
const clockDate = document.getElementById("clock-date");

// Active Event Elements
const activeEventCard = document.getElementById("active-event-card");
const activeType = document.getElementById("active-type");
const activeTitle = document.getElementById("active-title");
const eventCountdown = document.getElementById("event-countdown");
const nagContainer = document.getElementById("nag-container");
const nagCountdown = document.getElementById("nag-countdown");

// Next Event Elements
const nextEventCard = document.getElementById("next-event-card");
const nextTitle = document.getElementById("next-title");
const nextCountdown = document.getElementById("next-countdown");

const noEventMsg = document.getElementById("no-event-msg");

let lastSpokenCheckinId = null;
let lastSpokenStartId = null;
let prefetchedCheckinPhrase = null;
let prefetchedStartPhrase = null; // New separate variable
let lastPrefetchId = null; 
let lastStartPrefetchId = null; // New ID tracker

const getDashDateKey = (d) => {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const prefetchCheckinPhrase = async (eventTitle, type = 'checkin') => {
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay = "morning";
    if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
    if (hour >= 18) timeOfDay = "evening"; 

    try {
        console.log(`[Dashboard] Pre-fetching AI phrase (${type}) for "${eventTitle}"...`);
        const response = await fetch('/api/generate-checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventTitle, timeOfDay, type })
        });
        const data = await response.json();
        
        if (type === 'start') {
            prefetchedStartPhrase = data.phrase;
        } else {
            prefetchedCheckinPhrase = data.phrase;
        }
        
        console.log(`[Dashboard] Pre-fetch complete: "${data.phrase}"`);
    } catch (e) {
        console.error("[Dashboard] Pre-fetch failed:", e);
    }
};

const updateStatusDashboard = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentSeconds = now.getSeconds();
    const totalCurrentSeconds = currentMinutes * 60 + currentSeconds;

    // 1. Update Clock
    if (clockTime) clockTime.innerText = now.toLocaleTimeString('en-US', { hour12: true });
    if (clockDate) clockDate.innerText = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // 2. Access global events
    if (typeof window.events === 'undefined') return;

    const dayKey = getDashDateKey(now);
    const dayEvents = window.events[dayKey] || [];
    
    // Sort events
    dayEvents.sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));

    // --- PRIORITY SYNC (New Immediate Sync) ---
    if (window.priorityManager) {
        dayEvents.forEach(evt => {
            // CRITICAL: Skip everything if the event is already marked completed
            if (evt.completed) return;

            const startMins = evt.startHour * 60 + evt.startMin;
            const endMins = startMins + evt.duration;

            // 1. PRE-START (5m prior)
            if (currentMinutes < startMins) {
                window.priorityManager.addEvent(evt, 'pre_start');
                // Pre-fetch 90s before it fires (which is T-6.5m)
                const preStartFireTime = startMins - 5;
                if (currentMinutes >= preStartFireTime - 2 && currentMinutes < preStartFireTime) {
                    const item = window.priorityManager.getItem(evt.id, 'pre_start');
                    if (item) window.priorityManager.prefetch(item);
                }
                if (currentMinutes >= preStartFireTime) {
                    window.priorityManager.markAsDue(evt.id, 'pre_start');
                }
            }

            // 2. START (at start)
            if (currentMinutes <= startMins) {
                window.priorityManager.addEvent(evt, 'start');
                if (currentMinutes >= startMins - 2 && currentMinutes < startMins) {
                    const item = window.priorityManager.getItem(evt.id, 'start');
                    if (item) window.priorityManager.prefetch(item);
                }
                if (currentMinutes >= startMins) {
                    window.priorityManager.markAsDue(evt.id, 'start');
                }
            }

            // 3. CHECK-IN (5m after start)
            const checkinMins = startMins + 5;
            if (evt.type !== 'checklist' && currentMinutes <= checkinMins) {
                window.priorityManager.addEvent(evt, 'checkin', checkinMins);
                if (currentMinutes >= checkinMins - 2 && currentMinutes < checkinMins) {
                    const item = window.priorityManager.getItem(evt.id, 'checkin');
                    if (item) window.priorityManager.prefetch(item);
                }
                if (currentMinutes >= checkinMins) {
                    window.priorityManager.markAsDue(evt.id, 'checkin');
                }
            }

            // 4. PRE-END (5m before end)
            const preEndMins = endMins - 5;
            if (currentMinutes <= preEndMins) {
                window.priorityManager.addEvent(evt, 'pre_end', preEndMins);
                if (currentMinutes >= preEndMins - 2 && currentMinutes < preEndMins) {
                    const item = window.priorityManager.getItem(evt.id, 'pre_end');
                    if (item) window.priorityManager.prefetch(item);
                }
                if (currentMinutes >= preEndMins) {
                    window.priorityManager.markAsDue(evt.id, 'pre_end');
                }
            }

            // 5. AUDIT/END (at end)
            if (currentMinutes <= endMins) {
                window.priorityManager.addEvent(evt, 'end', endMins);
                if (currentMinutes >= endMins - 2 && currentMinutes < endMins) {
                    const item = window.priorityManager.getItem(evt.id, 'end') || window.priorityManager.getItem(evt.id, 'audit_b');
                    if (item) window.priorityManager.prefetch(item);
                }
                if (currentMinutes >= endMins) {
                    window.priorityManager.markAsDue(evt.id, evt.type === 'checklist' ? 'audit_b' : 'end');
                }
            }

            // 6. CHECKLIST ITEMS (Standby Triggers)
            if (evt.type === 'checklist' && !evt.completed) {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const startMins = evt.startHour * 60 + evt.startMin;
                const endMins = startMins + evt.duration;

                // ONLY add standby triggers if the checklist is currently active
                if (currentMinutes >= startMins && currentMinutes < endMins) {
                    evt.items.forEach(item => {
                        const itemText = typeof item === 'string' ? item : item.text;
                        const isCompleted = typeof item === 'object' ? item.completed : false;
                        
                        if (!isCompleted) {
                            window.priorityManager.addEvent({
                                ...evt,
                                title: itemText 
                            }, 'checklist_item', startMins + 1);
                        }
                    });
                }
            }
        });
    }

    // A. Find ACTIVE Event
    const activeEvent = dayEvents.find(evt => {
        if (evt.completed) return false; // Ignore completed events
        const start = evt.startHour * 60 + evt.startMin;
        const end = start + evt.duration;
        return currentMinutes >= start && currentMinutes < end;
    });

    // B. Find NEXT Event
    // If we have an active event, look for ones starting AFTER it ends
    // If no active event, look for ones starting AFTER now
    const nextEvent = dayEvents.find(evt => {
        const start = evt.startHour * 60 + evt.startMin;
        return start > currentMinutes;
    });

    // --- DISPLAY LOGIC ---

    // 1. Active Event Section
    if (activeEvent) {
        if (noEventMsg) noEventMsg.classList.add('hidden');
        if (activeEventCard) activeEventCard.classList.remove('hidden');

        if (activeType) activeType.innerText = activeEvent.type;
        if (activeTitle) activeTitle.innerText = activeEvent.title;
        
        // Timer: Count DOWN to END
        const targetTimeMin = (activeEvent.startHour * 60 + activeEvent.startMin) + activeEvent.duration;
        const diffSeconds = (targetTimeMin * 60) - totalCurrentSeconds;
        
        if (eventCountdown) {
            eventCountdown.innerText = formatTime(diffSeconds);
        }

        // Nag Timer (with Seconds!)
        if (activeEvent.reminderType === 'checkin' && activeEvent.checkInInterval) {
            if (nagContainer) nagContainer.classList.remove('hidden');
            
            const startSeconds = (activeEvent.startHour * 60 + activeEvent.startMin) * 60;
            const elapsedSeconds = totalCurrentSeconds - startSeconds;
            const intervalSeconds = activeEvent.checkInInterval * 60;
            
            // Calculate remaining time in current interval
            const nextNagSeconds = intervalSeconds - (elapsedSeconds % intervalSeconds);
            
            if (nagCountdown) nagCountdown.innerText = formatTime(nextNagSeconds); 
            
            const currentIntervalCount = Math.floor(elapsedSeconds / intervalSeconds);
            const triggerId = `${activeEvent.id}_nag_${currentIntervalCount}`;

        } else {
            if (nagContainer) nagContainer.classList.add('hidden');
        }

    } else {
        if (activeEventCard) activeEventCard.classList.add('hidden');
    }

    // 2. Next Event Section
    if (nextEvent) {
        if (noEventMsg && !activeEvent) noEventMsg.classList.add('hidden'); // Hide msg if we have at least one card
        if (nextEventCard) nextEventCard.classList.remove('hidden');

        if (nextTitle) nextTitle.innerText = nextEvent.title;

        // Timer: Count DOWN to START
        const startMin = nextEvent.startHour * 60 + nextEvent.startMin;
        const diffSeconds = (startMin * 60) - totalCurrentSeconds;

        if (nextCountdown) nextCountdown.innerText = formatTime(diffSeconds);

    } else {
        if (nextEventCard) nextEventCard.classList.add('hidden');
        
        // Show "Free" message only if BOTH are hidden
        if (!activeEvent && noEventMsg) {
            noEventMsg.classList.remove('hidden');
        }
    }
};

const formatTime = (totalSeconds) => {
    if (totalSeconds < 0) return "00:00:00";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    
    return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
};

// const triggerVoiceReminder = (evt) => { ... } // Removed in favor of notifications.js

window.updateStatusDashboard = updateStatusDashboard;

// Start the Clock Loop
setInterval(() => {
    updateStatusDashboard();
    if (window.priorityManager && window.priorityManager.tick) {
        window.priorityManager.tick();
    }
}, 1000);
updateStatusDashboard();
