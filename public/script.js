const currentDate = document.querySelector(".calendar-current-date");
const daysTag = document.querySelector(".calendar-dates");
const prevNextIcon = document.querySelectorAll(".calendar-navigation span");
const selectedDateHeader = document.getElementById("selected-date");
const dayTimeline = document.getElementById("day-timeline");
const addEventBtn = document.getElementById("add-event-btn");
const eventModal = document.getElementById("event-modal");
const closeModal = document.querySelector(".close-modal");
const eventForm = document.getElementById("event-form");
const eventHourSelect = document.getElementById("event-hour");
const eventMinSelect = document.getElementById("event-min");
const eventAmpmSelect = document.getElementById("event-ampm");
const eventEndHourSelect = document.getElementById("event-end-hour");
const eventEndMinSelect = document.getElementById("event-end-min");
const eventEndAmpmSelect = document.getElementById("event-end-ampm");
const templatesList = document.getElementById("templates-list");

// Recurrence Elements
const recurrenceSection = document.getElementById("recurrence-section");
const recurrenceUnit = document.getElementById("recurrence-unit");
const recurrenceDays = document.getElementById("recurrence-days");
const eventTypeRadios = document.querySelectorAll('input[name="event-type"]');

// Action Modal Elements
const actionModal = document.getElementById("action-modal");
const closeActionModal = document.querySelector(".close-action");
const actionTitle = document.getElementById("action-title");
const editBtn = document.getElementById("action-edit");
const delayBtn = document.getElementById("action-delay");
const deleteBtn = document.getElementById("action-delete");

// Reminder Elements
const eventReminderType = document.getElementById("event-reminder-type");
const checkinSettings = document.getElementById("checkin-settings");

// Status Dashboard Elements
// const clockTime = document.getElementById("clock-time"); // Moved to dashboard.js
// const clockDate = document.getElementById("clock-date");
// const activeEventCard = document.getElementById("active-event-card");
// const activeType = document.getElementById("active-type");
// const activeTitle = document.getElementById("active-title");
// const eventCountdown = document.getElementById("event-countdown");
// const nagContainer = document.getElementById("nag-container");
// const nagCountdown = document.getElementById("nag-countdown");
// const noEventMsg = document.getElementById("no-event-msg");

let date = new Date();
let currYear = date.getFullYear();
let currMonth = date.getMonth();

let selectedDate = new Date();
window.selectedDate = selectedDate;
let events = {};
window.events = events;
let templates = [];
window.templates = templates;
let selectedEvent = null;

const months = ["January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December"];

const typeIcons = {
    'fixed': 'fa-lock',
    'flexible': 'fa-water',
    'routine': 'fa-sync-alt',
    'deadline': 'fa-flag',
    'blocker': 'fa-ban',
    'checklist': 'fa-list-check'
};

const getDateKey = (d) => {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
window.getDateKey = getDateKey;

// API Functions
const fetchEvents = async () => {
    try {
        const response = await fetch('/api/events');
        window.events = await response.json(); 
        events = window.events; 
        renderCalendar();
        renderDayView();
        // Update active checklist if the function exists (from checklist.js)
        if (window.updateActiveChecklistDisplay) {
            window.updateActiveChecklistDisplay();
        }
    } catch (error) {
        console.error('Error fetching events:', error);
    }
};

const saveEvents = async (eventsData) => {
    try {
        const payload = Array.isArray(eventsData) ? eventsData : [eventsData];
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            await fetchEvents();
        }
    } catch (error) {
        console.error('Error saving events:', error);
    }
};
window.saveEvents = saveEvents;

const updateEvent = async (eventData) => {
    try {
        const response = await fetch(`/api/events/${eventData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });
        if (response.ok) {
            await fetchEvents();
        }
    } catch (error) {
        console.error('Error updating event:', error);
    }
};
window.updateEvent = updateEvent;

const deleteEvent = async (eventId, deleteSeries = false) => {
    try {
        const url = `/api/events/${eventId}${deleteSeries ? '?series=true' : ''}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });
        if (response.ok) {
            await fetchEvents();
        }
    } catch (error) {
        console.error('Error deleting event:', error);
    }
};

const fetchTemplates = async () => {
    try {
        const response = await fetch('/api/templates');
        window.templates = await response.json();
        templates = window.templates;
        renderTemplates();
    } catch (error) {
        console.error('Error fetching templates:', error);
    }
};
window.fetchTemplates = fetchTemplates;

const saveTemplate = async (templateData) => {
    try {
        const response = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });
        if (response.ok) {
            await fetchTemplates();
        }
    } catch (error) {
        console.error('Error saving template:', error);
    }
};
window.saveTemplate = saveTemplate;

// Rendering Functions
const renderCalendar = () => {
    let firstDayofMonth = new Date(currYear, currMonth, 1).getDay();
    let lastDateofMonth = new Date(currYear, currMonth + 1, 0).getDate();
    let lastDayofMonth = new Date(currYear, currMonth, lastDateofMonth).getDay();
    let lastDateofLastMonth = new Date(currYear, currMonth, 0).getDate();
    let liTag = "";

    for (let i = firstDayofMonth; i > 0; i--) {
        liTag += `<li class="inactive">${lastDateofLastMonth - i + 1}</li>`;
    }

    for (let i = 1; i <= lastDateofMonth; i++) {
        let isSelected = i === selectedDate.getDate() && 
                        currMonth === selectedDate.getMonth() && 
                        currYear === selectedDate.getFullYear() ? "active" : "";
        liTag += `<li class="${isSelected}" onclick="selectDay(${i})">${i}</li>`;
    }

    for (let i = lastDayofMonth; i < 6; i++) {
        liTag += `<li class="inactive">${i - lastDayofMonth + 1}</li>`
    }

    currentDate.innerText = `${months[currMonth]} ${currYear}`;
    daysTag.innerHTML = liTag;
}

const selectDay = (day) => {
    selectedDate = new Date(currYear, currMonth, day);
    renderCalendar();
    renderDayView();
}

const renderDayView = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    selectedDateHeader.innerText = selectedDate.toLocaleDateString('en-US', options);

    const dayKey = getDateKey(selectedDate);
    const dayEvents = events[dayKey] || [];

    let timelineHtml = "";
    
    for (let hour = 0; hour < 24; hour++) {
        for (let min = 0; min < 60; min += 15) {
            let ampm = hour >= 12 ? 'PM' : 'AM';
            let displayHour = hour % 12;
            displayHour = displayHour ? displayHour : 12;
            let displayMin = min < 10 ? '0' + min : min;
            let timeString = `${displayHour}:${displayMin} ${ampm}`;
            let timeValue = `${hour}:${min}`; 

            let eventHtml = '';
            dayEvents.forEach(evt => {
                const evtStartHour = parseInt(evt.startHour);
                const evtStartMin = parseInt(evt.startMin);
                
                // Allow event to show up in the slot if its start time falls within this 15-min window
                if (evtStartHour === hour && evtStartMin >= min && evtStartMin < min + 15) {
                    let slotHeight = 50; 
                    let slotsSpan = evt.duration / 15;
                    
                    // Calculate top offset within the slot for precise minute placement
                    const minOffset = evtStartMin - min;
                    const topOffset = (minOffset / 15) * slotHeight;
                    
                    let heightStyle = `height: ${slotsSpan * slotHeight - 4}px; top: ${topOffset + 2}px;`; 
                    
                    let overlayClass = evt.occupiesTime === false ? 'overlay' : '';
                    let checklistClass = evt.type === 'checklist' ? 'checklist' : '';
                    if (evt.occupiesTime === false) {
                        heightStyle = `height: 30px; top: ${topOffset + 10}px;`; 
                    }

                    eventHtml += `
                        <div class="event-item ${overlayClass} ${checklistClass}" 
                             style="background-color: ${evt.color}; ${heightStyle}"
                             onclick="openActionModal(event, '${evt.id}')">
                            <i class="fas ${typeIcons[evt.type]} event-icon"></i>
                            <span class="event-title">${evt.title}</span>
                        </div>
                    `;
                }
            });

            timelineHtml += `
                <div class="time-slot" data-time="${timeValue}">
                    <div class="time-label">${min === 0 ? timeString : ''}</div> 
                    <div class="time-content">
                        ${eventHtml}
                    </div>
                </div>
            `;
        }
    }
    dayTimeline.innerHTML = timelineHtml;
}

// Status Dashboard Logic
// (Moved to dashboard.js)

// Chat UI Logic
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatHistory = document.getElementById("chat-history");

const addMessageToChat = (text, sender, isSync = false) => {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("chat-msg", sender);
    
    let content = `<div class="msg-bubble">${text}</div>`;
    
    // Add "Read Aloud" button for AI messages
    if (sender === 'ai') {
        content += `
            <button class="read-aloud-btn" onclick="window.notifier.speak('${text.replace(/'/g, "\\'")}')">
                <i class="fas fa-volume-up"></i>
            </button>
        `;
    }
    
    msgDiv.innerHTML = content;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; 

    // --- NEW: Trigger Widget Check ---
    if (sender === 'ai' && window.renderChatChecklistWidget) {
        window.renderChatChecklistWidget();
    }
};

// Load chat history on startup
const fetchChatHistory = async () => {
    try {
        const res = await fetch('/api/chat-history');
        const history = await res.json();
        chatHistory.innerHTML = ''; // Clear initial greeting
        history.forEach(msg => addMessageToChat(msg.text, msg.sender, true));
    } catch (e) {
        console.error('Failed to load chat history:', e);
    }
};
fetchChatHistory();

const handleChatSubmit = async () => {
    const rawText = chatInput.value.trim();
    if (!rawText) return;
    const text = rawText.toLowerCase();

    // 0. Signal Notification System that user responded
    // Also signal Priority Manager
    if (window.notifier && window.notifier.resolve) {
        window.notifier.resolve();
    }
    if (window.priorityManager) {
        window.priorityManager.resolveCurrent("user_input");
    }

    // 1. Show User Message
    addMessageToChat(rawText, "user");
    chatInput.value = "";

    // --- COMPOSITE TRIGGER INTERCEPT (Lego Logic) ---
    const now = new Date();
    const dayKey = getDateKey(now);
    const dayEvents = events[dayKey] || [];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const activeChecklist = dayEvents.find(e => {
        const start = e.startHour * 60 + e.startMin;
        const end = start + e.duration;
        return e.type === 'checklist' && nowMins >= start && nowMins < end && !e.completed;
    });

    if (activeChecklist && activeChecklist.aiScript) {
        // Lego Piece A: Action Keywords
        const actionKeywords = ['done', 'finished', 'completed', 'checked', 'did it', 'check off', 'all set', 'took care of'];
        const hasAction = actionKeywords.some(k => text.includes(k));
        
        if (hasAction) {
            console.log("[Chat] Action Keyword detected. Searching for Object Piece...");
            
            // Lego Piece B: Object Variations (from AI Script)
            let targetItemIndex = -1;
            let targetItemText = "";

            activeChecklist.items.forEach((item, index) => {
                if (item.completed) return; // Skip already done items

                const itemTextRaw = typeof item === 'string' ? item : item.text;
                const itemText = itemTextRaw.toLowerCase();
                const script = activeChecklist.aiScript.itemScripts.find(s => s.text.toLowerCase() === itemText);
                
                // Check exact text, fuzzy match, or AI variations
                const variations = script?.variations?.map(v => v.toLowerCase()) || [];
                // CRITICAL FIX: Ensure we match the WHOLE word to avoid partial matches on empty strings or short words
                const isMatch = text.includes(itemText) || (variations.length > 0 && variations.some(v => v.length > 2 && text.includes(v)));

                if (isMatch) {
                    targetItemIndex = index;
                    targetItemText = itemTextRaw;
                }
            });

            // If no specific object mentioned, assume the NEXT item in the list
            if (targetItemIndex === -1) {
                console.log("[Chat] No specific object found. Checking for 'Next Item' fallback...");
                const nextItem = activeChecklist.items.find(item => !item.completed);
                if (nextItem) {
                    targetItemIndex = activeChecklist.items.indexOf(nextItem);
                    targetItemText = typeof nextItem === 'string' ? nextItem : nextItem.text;
                    console.log(`[Chat] Defaulting to next item: ${targetItemText}`);
                }
            }

            if (targetItemIndex !== -1) {
                console.log(`[Chat] Composite Match! Item: ${targetItemText}`);
                
                // 1. INSTANT UI UPDATE
                if (window.toggleChecklistItem) {
                    window.toggleChecklistItem(activeChecklist.id, targetItemIndex);
                    
                    // Force immediate chat widget refresh
                    setTimeout(() => {
                        if (window.renderChatChecklistWidget) window.renderChatChecklistWidget();
                    }, 50);

                    // 2. INSTANT TRIGGER SIGNAL (No Server Wait)
                    if (window.priorityManager && window.priorityManager.triggerStandby) {
                        window.priorityManager.triggerStandby(activeChecklist.id, targetItemText);
                    }

                    // 3. STOP - We intercepted the command
                    return; 
                }
            }
        }
    }

    // --- END COMPOSITE INTERCEPT ---

    // --- INTERCEPT LOGIC: Check for pending Yes/No buttons ---
    // If user types "yes" or "no", and there is a pending check-in, CLICK IT manually.
    const pendingYesBtn = document.querySelector('.checkin-btn.yes:not(:disabled)');
    const pendingNoBtn = document.querySelector('.checkin-btn.no:not(:disabled)');

    if (pendingYesBtn && (text === 'yes' || text === 'yeah' || text === 'yep' || text === 'sure')) {
        console.log("Intercepting 'Yes' - Clicking button manually");
        pendingYesBtn.click();
        return; // STOP! Do not send to AI.
    }

    if (pendingNoBtn && (text === 'no' || text === 'nope' || text === 'nah')) {
        console.log("Intercepting 'No' - Clicking button manually");
        pendingNoBtn.click();
        return; // STOP! Do not send to AI.
    }
    // ---------------------------------------------------------

    // 2. Send to Backend
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: rawText })
        });
        const data = await response.json();

        // 3. Show AI Response
        if (data.reply) {
            addMessageToChat(data.reply, "ai");
            // Auto-speak the response using our new server-side mixer
            if (window.notifier) {
                window.notifier.speak(data.reply);
            }
        }

        // 4. Execute Action
        if (data.action) {
            console.log("Action received:", data.action);
            handleAIAction(data.action); // Defined in voice.js or moved here
        }

    } catch (error) {
        console.error("Chat Error:", error);
        addMessageToChat("Sorry, I'm having trouble connecting to my brain.", "ai");
    }
};

chatSendBtn.addEventListener("click", handleChatSubmit);
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleChatSubmit();
});

// Expose for voice.js to use
window.addMessageToChat = addMessageToChat;

// --- NEW: Chat Checklist Widget Logic ---
const renderChatChecklistWidget = () => {
    const now = new Date();
    const dayKey = getDateKey(now);
    const dayEvents = events[dayKey] || [];
    const nowMins = now.getHours() * 60 + now.getMinutes();
    
    const activeChecklist = dayEvents.find(e => {
        const start = e.startHour * 60 + e.startMin;
        const end = start + e.duration;
        return e.type === 'checklist' && nowMins >= start && nowMins < end && !e.completed;
    });

    // Remove existing widget if any
    const existingWidget = document.getElementById('chat-checklist-widget');
    if (existingWidget) existingWidget.remove();

    if (!activeChecklist) return;

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "chat-checklist-widget";
    widgetDiv.className = "chat-checklist-widget";
    
    const completedCount = activeChecklist.items.filter(item => item.completed).length;
    const progress = (completedCount / activeChecklist.items.length) * 100;

    widgetDiv.innerHTML = `
        <div class="chat-widget-header">
            <i class="fas fa-list-check"></i>
            <span>${activeChecklist.title}</span>
            <span class="chat-widget-progress">${Math.round(progress)}%</span>
        </div>
        <div class="chat-widget-items">
            ${activeChecklist.items.map((item, index) => {
                const itemText = typeof item === 'string' ? item : item.text;
                return `
                    <div class="chat-widget-item ${item.completed ? 'completed' : ''}" onclick="window.toggleChecklistItem(${activeChecklist.id}, ${index}); window.priorityManager.triggerStandby(${activeChecklist.id}, '${itemText.replace(/'/g, "\\'")}')">
                        <i class="fa${item.completed ? 's fa-check-square' : 'r fa-square'}"></i>
                        <span>${itemText}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Insert at the top of chat history or after the last AI message
    chatHistory.appendChild(widgetDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
};
window.renderChatChecklistWidget = renderChatChecklistWidget;

const renderTemplates = () => {
    // Filter out checklist templates from the regular event modal list
    const regularTemplates = templates.filter(t => t.type !== 'checklist');
    
    if (regularTemplates.length === 0) {
        templatesList.innerHTML = '<div class="empty-templates">No saved templates yet.</div>';
        return;
    }

    templatesList.innerHTML = regularTemplates.map(t => `
        <div class="template-item" onclick="loadTemplate('${t.title.replace(/'/g, "\\'")}', '${t.type}', '${t.color}', ${t.duration}, ${t.occupiesTime}, '${t.reminderType}', '${t.checkInInterval}')">
            <span class="template-color-dot" style="background-color: ${t.color}"></span>
            <div class="template-info">
                <span class="template-title">${t.title}</span>
                <span class="template-type"><i class="fas ${typeIcons[t.type]}"></i> ${t.type}</span>
            </div>
        </div>
    `).join('');
}

window.loadTemplate = (title, type, color, duration, occupiesTime, reminderType, checkInInterval) => {
    document.getElementById("event-title").value = title;
    document.querySelector(`input[name="event-type"][value="${type}"]`).checked = true;
    document.getElementById("event-color").value = color;
    document.getElementById("event-duration").value = duration;
    
    let isOccupying = occupiesTime !== undefined ? occupiesTime : true;
    document.getElementById("event-occupies-time").checked = isOccupying;
    
    // Reminder settings
    document.getElementById("event-reminder-type").value = reminderType || 'none';
    if (reminderType === 'checkin') {
        checkinSettings.classList.remove('hidden');
        document.getElementById("checkin-interval").value = checkInInterval || '15';
    } else {
        checkinSettings.classList.add('hidden');
    }

    handleTypeChange(type);
};

// Reminder Logic
eventReminderType.addEventListener('change', (e) => {
    if (e.target.value === 'checkin') {
        checkinSettings.classList.remove('hidden');
    } else {
        checkinSettings.classList.add('hidden');
    }
});

// Smart Delay Logic
const findNextFreeSlot = (event, dayEvents) => {
    let currentStart = event.startHour * 60 + event.startMin;
    let duration = event.duration;
    
    let searchStart = currentStart + 15;
    
    const sortedEvents = dayEvents
        .filter(e => e.id !== event.id && e.occupiesTime !== false)
        .map(e => ({
            start: e.startHour * 60 + e.startMin,
            end: e.startHour * 60 + e.startMin + e.duration
        }))
        .sort((a, b) => a.start - b.start);

    for (let time = searchStart; time < 24 * 60; time += 15) {
        let proposedStart = time;
        let proposedEnd = time + duration;
        let isConflict = false;
        
        for (const e of sortedEvents) {
            if (proposedStart < e.end && proposedEnd > e.start) {
                isConflict = true;
                break;
            }
        }
        
        if (!isConflict) {
            return {
                hour: Math.floor(proposedStart / 60),
                min: proposedStart % 60
            };
        }
    }
    return null; 
};

window.openActionModal = (e, eventId) => {
    e.stopPropagation();
    const dayKey = getDateKey(selectedDate);
    const dayEvents = events[dayKey] || [];
    selectedEvent = dayEvents.find(evt => evt.id == eventId);
    
    if (selectedEvent) {
        actionTitle.innerText = selectedEvent.title;
        actionModal.style.display = "flex";
    }
};

closeActionModal.addEventListener("click", () => {
    actionModal.style.display = "none";
});

window.addEventListener("click", (e) => {
    if (e.target === actionModal) {
        actionModal.style.display = "none";
    }
});

editBtn.addEventListener("click", () => {
    if (!selectedEvent) return;
    
    document.getElementById("event-title").value = selectedEvent.title;
    
    // Set 3-part time (Start)
    let h = selectedEvent.startHour;
    let m = selectedEvent.startMin;
    let ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12 || 12;
    
    eventHourSelect.value = h12;
    eventMinSelect.value = m;
    eventAmpmSelect.value = ampm;

    // Set 3-part time (End)
    let endTotalMins = (h * 60 + m) + selectedEvent.duration;
    let endH = (Math.floor(endTotalMins / 60)) % 24;
    let endM = endTotalMins % 60;
    let endAmpm = endH >= 12 ? 'PM' : 'AM';
    let endH12 = endH % 12 || 12;

    eventEndHourSelect.value = endH12;
    eventEndMinSelect.value = endM;
    eventEndAmpmSelect.value = endAmpm;
    const typeRadio = document.querySelector(`input[name="event-type"][value="${selectedEvent.type}"]`);
    if (typeRadio) {
        typeRadio.checked = true;
    }
    
    document.getElementById("event-color").value = selectedEvent.color;
    const occupiesTimeCheckbox = document.getElementById("event-occupies-time");
    if (occupiesTimeCheckbox) {
        occupiesTimeCheckbox.checked = selectedEvent.occupiesTime !== false;
    }
    
    // Load reminder settings
    document.getElementById("event-reminder-type").value = selectedEvent.reminderType || 'none';
    if (selectedEvent.reminderType === 'checkin') {
        checkinSettings.classList.remove('hidden');
        document.getElementById("checkin-interval").value = selectedEvent.checkInInterval || '15';
    } else {
        checkinSettings.classList.add('hidden');
    }

    eventForm.dataset.editId = selectedEvent.id;
    
    actionModal.style.display = "none";
    eventModal.style.display = "flex";
});

deleteBtn.addEventListener("click", () => {
    if (!selectedEvent) return;
    
    // Check if part of a series
    if (selectedEvent.seriesId) {
        // Prompt for Series Deletion
        if (confirm("Delete ONLY this specific event instance?\n(Click Cancel to see option for deleting the entire series)")) {
             deleteEvent(selectedEvent.id, false);
        } else {
             if (confirm("Do you want to delete the ENTIRE series (all future events)?")) {
                 deleteEvent(selectedEvent.id, true);
             }
        }
    } else {
        // Standard Event
        if (confirm("Are you sure you want to delete this event?")) {
            deleteEvent(selectedEvent.id);
        }
    }
    actionModal.style.display = "none";
});

delayBtn.addEventListener("click", () => {
    if (!selectedEvent) return;
    const dayKey = getDateKey(selectedDate);
    const dayEvents = events[dayKey] || [];
    const nextSlot = findNextFreeSlot(selectedEvent, dayEvents);
    
    if (nextSlot) {
        const updatedEvent = {
            ...selectedEvent,
            startHour: nextSlot.hour,
            startMin: nextSlot.min
        };
        updateEvent(updatedEvent);
        actionModal.style.display = "none";
    } else {
        alert("No free slot found for the rest of the day!");
    }
});

const populateTimeSelect = () => {
    const hours = [eventHourSelect, eventEndHourSelect];
    const mins = [eventMinSelect, eventEndMinSelect];

    hours.forEach(select => {
        if (!select) return;
        select.innerHTML = "";
        for (let i = 1; i <= 12; i++) {
            let opt = document.createElement("option");
            opt.value = i;
            opt.text = i;
            select.appendChild(opt);
        }
    });

    mins.forEach(select => {
        if (!select) return;
        select.innerHTML = "";
        for (let i = 0; i < 60; i++) {
            let opt = document.createElement("option");
            opt.value = i;
            opt.text = i < 10 ? '0' + i : i;
            select.appendChild(opt);
        }
    });
}
window.populateTimeSelect = populateTimeSelect;

eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const title = document.getElementById("event-title").value;
    
    // Start Time
    const hour12 = parseInt(eventHourSelect.value);
    const min = parseInt(eventMinSelect.value);
    const ampm = eventAmpmSelect.value;
    let startHour = hour12;
    if (ampm === 'PM' && startHour < 12) startHour += 12;
    if (ampm === 'AM' && startHour === 12) startHour = 0;

    // End Time
    const endHour12 = parseInt(eventEndHourSelect.value);
    const endMin = parseInt(eventEndMinSelect.value);
    const endAmpm = eventEndAmpmSelect.value;
    let endHour = endHour12;
    if (endAmpm === 'PM' && endHour < 12) endHour += 12;
    if (endAmpm === 'AM' && endHour === 12) endHour = 0;

    // Calculate Duration in minutes
    let startTotalMins = startHour * 60 + min;
    let endTotalMins = endHour * 60 + endMin;
    
    // Handle overnight events if necessary (though usually duration is what we want)
    if (endTotalMins < startTotalMins) {
        endTotalMins += 24 * 60; 
    }
    const duration = endTotalMins - startTotalMins;

    const type = document.querySelector('input[name="event-type"]:checked').value;
    const color = document.getElementById("event-color").value;
    const saveAsTemplate = document.getElementById("save-as-template").checked;
    const occupiesTime = document.getElementById("event-occupies-time").checked;
    
    // New Reminder Fields
    const reminderType = document.getElementById("event-reminder-type").value;
    const checkInInterval = document.getElementById("checkin-interval").value;

    const dayKey = getDateKey(selectedDate);
    const editId = eventForm.dataset.editId;
    
    const baseEvent = {
        dateKey: dayKey, 
        title,
        startHour: startHour,
        startMin: min,
        duration,
        type,
        color,
        occupiesTime,
        reminderType,
        checkInInterval: reminderType === 'checkin' ? parseInt(checkInInterval) : null
    };

    if (editId) {
        const updatedEvent = { ...baseEvent, id: parseFloat(editId) };
        updateEvent(updatedEvent);
        delete eventForm.dataset.editId;
    } else {
        let eventsToSave = [];
        if (type === 'routine') {
            const interval = document.getElementById('recurrence-interval').value;
            const unit = document.getElementById('recurrence-unit').value;
            const endDate = document.getElementById('recurrence-end').value;
            const selectedDays = [];
            if (unit === 'weeks') {
                document.querySelectorAll('.week-days-selector input:checked').forEach(cb => selectedDays.push(cb.value));
            }
            const recurrenceOptions = { interval, unit, endDate, selectedDays };
            
            // Assign Series ID
            baseEvent.seriesId = Date.now();
            
            eventsToSave = generateRecurringEvents(baseEvent, recurrenceOptions);
        } else {
            eventsToSave.push({ ...baseEvent, id: Date.now() });
        }
        saveEvents(eventsToSave);
    }

    if (saveAsTemplate) {
        const newTemplate = { 
            title, type, color, duration, occupiesTime,
            reminderType, checkInInterval: reminderType === 'checkin' ? parseInt(checkInInterval) : null
        };
        saveTemplate(newTemplate);
    }

    eventModal.style.display = "none";
    eventForm.reset();
});

const handleTypeChange = (type) => {
    if (type === 'routine') {
        recurrenceSection.classList.remove('hidden');
    } else {
        recurrenceSection.classList.add('hidden');
    }
};

eventTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        handleTypeChange(e.target.value);
    });
});

recurrenceUnit.addEventListener('change', (e) => {
    if (e.target.value === 'weeks') {
        recurrenceDays.classList.remove('hidden');
    } else {
        recurrenceDays.classList.add('hidden');
    }
});

// Modal Handlers
addEventBtn.addEventListener("click", () => {
    eventForm.reset();
    delete eventForm.dataset.editId;
    checkinSettings.classList.add('hidden');
    recurrenceSection.classList.add('hidden');
    eventModal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
    eventModal.style.display = "none";
});

window.addEventListener("click", (e) => {
    if (e.target === eventModal) {
        eventModal.style.display = "none";
    }
});

// Expose recurrence generator for checklist.js to use if needed
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};
window.addDays = addDays;

const generateRecurringEvents = (baseEvent, options) => {
    const eventsList = [];
    const startDate = new Date(window.selectedDate || new Date()); 
    let endDate;
    if (options.endDate) {
        endDate = new Date(options.endDate);
    } else {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 3);
    }

    let currentDate = new Date(startDate);
    const interval = parseInt(options.interval) || 1;

    if (options.unit === 'days' && interval > 1) {
        while (currentDate <= endDate) {
            eventsList.push({
                ...baseEvent,
                id: Date.now() + Math.random(),
                dateKey: getDateKey(currentDate)
            });
            currentDate = addDays(currentDate, interval);
        }
        return eventsList;
    }

    while (currentDate <= endDate) {
        let shouldAdd = false;
        if (options.unit === 'days') {
            shouldAdd = true;
        } else if (options.unit === 'weeks') {
            const dayOfWeek = currentDate.getDay(); 
            if (options.selectedDays.includes(dayOfWeek.toString())) {
                shouldAdd = true;
            }
        }

        if (shouldAdd) {
            eventsList.push({
                ...baseEvent,
                id: Date.now() + Math.random(),
                dateKey: getDateKey(currentDate)
            });
        }
        currentDate = addDays(currentDate, 1);
    }
    return eventsList;
};
window.generateRecurringEvents = generateRecurringEvents;

prevNextIcon.forEach(icon => {
    icon.addEventListener("click", () => {
        currMonth = icon.id === "calendar-prev" ? currMonth - 1 : currMonth + 1;
        if(currMonth < 0 || currMonth > 11) {
            date = new Date(currYear, currMonth, new Date().getDate());
            currYear = date.getFullYear();
            currMonth = date.getMonth();
        } else {
            date = new Date();
        }
        renderCalendar();
    });
});

populateTimeSelect();
fetchEvents();
fetchTemplates();