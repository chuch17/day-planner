// checklist.js - Logic for Checklist Creator and Dropdown

const checklistToggleBtn = document.getElementById("checklist-toggle-btn");
const checklistDropdown = document.getElementById("checklist-dropdown");
const openChecklistCreatorBtn = document.getElementById("open-checklist-creator-btn");
const checklistCreatorModal = document.getElementById("checklist-creator-modal");
const closeCreatorModal = document.querySelector(".close-creator");
const checklistItemInput = document.getElementById("checklist-item-input");
const addItemToPreviewBtn = document.getElementById("add-item-to-preview-btn");
const checklistPreviewList = document.getElementById("checklist-preview-list");
const previewItemCount = document.getElementById("preview-item-count");
const deployChecklistBtn = document.getElementById("deploy-checklist-btn");

// Thinking Lab Elements
const thinkingLabOverlay = document.getElementById("thinking-lab-overlay");
const labStatus = document.getElementById("lab-status");
const labLog = document.getElementById("lab-log");
const dotAnalyze = document.getElementById("dot-analyze");
const dotForge = document.getElementById("dot-forge");
const dotSync = document.getElementById("dot-sync");

// Checklist Recurrence Elements
const checklistRecurrenceSection = document.getElementById("checklist-recurrence-section");
const checklistRecurrenceUnit = document.getElementById("checklist-recurrence-unit");
const checklistRecurrenceDays = document.getElementById("checklist-recurrence-days");
const checklistTypeRadios = document.querySelectorAll('input[name="checklist-type"]');

let currentChecklistItems = [];

// Handle Type/Recurrence change for checklists
checklistTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'routine') {
            checklistRecurrenceSection.classList.remove('hidden');
            // Show days selection by default for routine
            checklistRecurrenceDays.classList.remove('hidden');
        } else {
            checklistRecurrenceSection.classList.add('hidden');
            checklistRecurrenceDays.classList.add('hidden');
        }
    });
});

checklistRecurrenceUnit.addEventListener('change', (e) => {
    // We already show days for routine, but this handles switching between days/weeks
    // If unit is weeks, definitely show days. If days, maybe hide them? 
    // Actually for Routine, selecting days is usually what's wanted regardless of interval.
    if (e.target.value === 'weeks' || document.querySelector('input[name="checklist-type"]:checked').value === 'routine') {
        checklistRecurrenceDays.classList.remove('hidden');
    } else {
        checklistRecurrenceDays.classList.add('hidden');
    }
});

// --- Dropdown Logic ---

checklistToggleBtn.addEventListener("click", () => {
    checklistDropdown.classList.toggle("open");
    checklistToggleBtn.classList.toggle("active");
    if (checklistDropdown.classList.contains("open")) {
        updateActiveChecklistDisplay();
    }
});

const updateActiveChecklistDisplay = () => {
    if (!window.getDateKey || !window.events) return;
    const now = new Date();
    const dayKey = window.getDateKey(now);
    // Use global window.events from script.js
    const dayEvents = window.events[dayKey] || [];
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Find the active checklist based on current time
    const activeChecklist = dayEvents.find(evt => {
        if (evt.type !== 'checklist') return false;
        const start = parseInt(evt.startHour) * 60 + parseInt(evt.startMin);
        const end = start + parseInt(evt.duration);
        return nowMins >= start && nowMins < end;
    });

    if (!activeChecklist) {
        checklistToggleBtn.classList.remove("has-active");
        checklistDropdown.innerHTML = `
            <div class="checklist-placeholder">
                <i class="fas fa-clipboard-list"></i>
                <h3>Active Checklist</h3>
                <p>No active checklist for this timeframe, Sir.</p>
                <div class="ghost-lines">
                    <div class="ghost-line"></div>
                    <div class="ghost-line"></div>
                    <div class="ghost-line"></div>
                </div>
            </div>
        `;
        return;
    }

    checklistToggleBtn.classList.add("has-active");
    // Render the active checklist items
    const completedCount = activeChecklist.items.filter(item => item.completed).length;
    const progress = (completedCount / activeChecklist.items.length) * 100;

    checklistDropdown.innerHTML = `
        <div class="active-checklist-container">
            <div class="active-checklist-header">
                <div class="checklist-info">
                    <h3>${activeChecklist.title}</h3>
                    <span class="active-tag">● ACTIVE NOW</span>
                </div>
                <div class="checklist-progress-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${Math.round(progress)}%</span>
                </div>
            </div>
            <div class="active-checklist-items">
                ${activeChecklist.items.map((item, index) => `
                    <div class="active-item ${item.completed ? 'completed' : ''}" onclick="toggleChecklistItem(${activeChecklist.id}, ${index})">
                        <div class="checkbox">
                            ${item.completed ? '<i class="fas fa-check"></i>' : ''}
                        </div>
                        <span class="item-label">${typeof item === 'string' ? item : item.text}</span>
                    </div>
                `).join('')}
            </div>
            <div class="checklist-footer">
                <p>Ends at: ${formatChecklistTime(parseInt(activeChecklist.startHour), parseInt(activeChecklist.startMin), parseInt(activeChecklist.duration))}</p>
            </div>
        </div>
    `;
};

const formatChecklistTime = (startH, startM, duration) => {
    let totalMins = startH * 60 + startM + duration;
    let h = Math.floor(totalMins / 60) % 24;
    let m = totalMins % 60;
    let ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12 || 12;
    return `${h12}:${m < 10 ? '0' + m : m} ${ampm}`;
};

window.toggleChecklistItem = async (checklistId, itemIndex) => {
    // Find the checklist in the local state
    let targetChecklist = null;
    let dateKey = null;

    if (!window.events) return;

    for (const key in window.events) {
        targetChecklist = window.events[key].find(e => e.id === checklistId);
        if (targetChecklist) {
            dateKey = key;
            break;
        }
    }

    if (targetChecklist) {
        // Initialize item as object if it's just a string
        if (typeof targetChecklist.items[itemIndex] === 'string') {
            targetChecklist.items[itemIndex] = {
                text: targetChecklist.items[itemIndex],
                completed: false
            };
        }
        
        targetChecklist.items[itemIndex].completed = !targetChecklist.items[itemIndex].completed;
        
        // --- NEW: AI Partner Feedback ---
        if (targetChecklist.items[itemIndex].completed && targetChecklist.aiScript && window.notifier) {
            // Checkmark logic already handled by script.js calling triggerStandby
            // But if triggered manually from Dropdown, we still want the Priority Queue pulse
            if (window.priorityManager && window.priorityManager.triggerStandby) {
                const itemText = targetChecklist.items[itemIndex].text;
                window.priorityManager.triggerStandby(targetChecklist.id, itemText);
            }
            
            // NEW: Check for Checklist Victory (Auto-cancel end messages)
            if (window.priorityManager && window.priorityManager.checkChecklistVictory) {
                window.priorityManager.checkChecklistVictory(targetChecklist.id);
            }
        }
        
        // Update on server
        if (window.updateEvent) {
            await window.updateEvent(targetChecklist);
            updateActiveChecklistDisplay();
        }
    }
};

// Update active checklist display every minute to keep up with time
updateActiveChecklistDisplay(); // Initial call
setInterval(updateActiveChecklistDisplay, 60000);

// --- Checklist Creator Logic ---

const populateChecklistTimeSelects = () => {
    const hours = [
        document.getElementById("checklist-start-hour"), 
        document.getElementById("checklist-end-hour")
    ];
    const mins = [
        document.getElementById("checklist-start-min"), 
        document.getElementById("checklist-end-min")
    ];

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
};

const renderSavedChecklists = () => {
    const savedList = document.getElementById("creator-saved-list");
    // Access global templates
    const checklistTemplates = (window.templates || []).filter(t => t.items && t.items.length > 0);

    if (checklistTemplates.length === 0) {
        savedList.innerHTML = '<div class="empty-saved">No saved checklists yet.</div>';
        return;
    }

    savedList.innerHTML = checklistTemplates.map(t => `
        <div class="saved-checklist-item">
            <span class="template-title" onclick="loadChecklistTemplate('${t.title.replace(/'/g, "\\'")}')">${t.title}</span>
            <div class="template-actions">
                <i class="fas fa-file-import load-icon" onclick="loadChecklistTemplate('${t.title.replace(/'/g, "\\'")}')" title="Load Template"></i>
                <i class="fas fa-trash-alt delete-template-icon" onclick="deleteChecklistTemplate(event, '${t.title.replace(/'/g, "\\'")}')" title="Delete Template"></i>
            </div>
        </div>
    `).join('');
};

window.deleteChecklistTemplate = async (event, title) => {
    event.stopPropagation(); // Prevent loading the template when clicking delete
    
    if (!confirm(`Are you sure you want to delete the "${title}" template, Sir?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/templates/${encodeURIComponent(title)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log(`[Checklist] Template "${title}" deleted successfully.`);
            if (window.fetchTemplates) {
                await window.fetchTemplates(); // Refresh global templates
                renderSavedChecklists(); // Re-render the list
            }
            if (window.notifier) {
                window.notifier.speak(`The ${title} template has been removed, Sir.`);
            }
        } else {
            console.error("[Checklist] Failed to delete template.");
            alert("Failed to delete template.");
        }
    } catch (error) {
        console.error("[Checklist] Error deleting template:", error);
    }
};

window.loadChecklistTemplate = (title) => {
    const template = (window.templates || []).find(t => t.title === title);
    if (template) {
        document.getElementById("checklist-name").value = template.title;
        currentChecklistItems = template.items.map(item => {
            return typeof item === 'string' ? item : item.text;
        });
        renderChecklistPreview();
        if (window.notifier) {
            window.notifier.speak(`Loaded the ${title} template, Sir.`);
        }
    }
};

openChecklistCreatorBtn.addEventListener("click", async () => {
    checklistCreatorModal.style.display = "flex";
    currentChecklistItems = [];
    if (window.fetchTemplates) await window.fetchTemplates(); // Refresh templates from server
    renderChecklistPreview();
    renderSavedChecklists();
    populateChecklistTimeSelects(); // Ensure time selects are populated
    document.getElementById("checklist-name").value = "";
    checklistItemInput.value = "";
    document.getElementById("save-checklist-as-template").checked = false;
});

closeCreatorModal.addEventListener("click", () => {
    checklistCreatorModal.style.display = "none";
});

const renderChecklistPreview = () => {
    if (currentChecklistItems.length === 0) {
        checklistPreviewList.innerHTML = `
            <div class="empty-preview-msg">
                <i class="fas fa-list-ul"></i>
                <p>Your checklist items will appear here.</p>
            </div>
        `;
        previewItemCount.innerText = "0 items";
        return;
    }

    previewItemCount.innerText = `${currentChecklistItems.length} item${currentChecklistItems.length === 1 ? '' : 's'}`;
    checklistPreviewList.innerHTML = currentChecklistItems.map((item, index) => `
        <div class="preview-item">
            <div class="item-dot"></div>
            <span class="item-text">${item}</span>
            <i class="fas fa-times remove-item" onclick="removePreviewItem(${index})"></i>
        </div>
    `).join('');
};

window.removePreviewItem = (index) => {
    currentChecklistItems.splice(index, 1);
    renderChecklistPreview();
};

const addItemToPreview = () => {
    const text = checklistItemInput.value.trim();
    if (text) {
        currentChecklistItems.push(text);
        checklistItemInput.value = "";
        checklistItemInput.focus();
        renderChecklistPreview();
        // Auto-scroll to bottom
        checklistPreviewList.scrollTop = checklistPreviewList.scrollHeight;
    }
};

addItemToPreviewBtn.addEventListener("click", addItemToPreview);
checklistItemInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addItemToPreview();
});

// --- Sequential Forge Logic ---
// --- PERSISTENT DNA: Script memory across refreshes ---
const getScriptHistory = () => {
    try {
        const history = localStorage.getItem('jarvis_script_history');
        return history ? JSON.parse(history) : [];
    } catch (e) { return []; }
};

const saveScriptHistory = (newPhrase) => {
    let history = getScriptHistory();
    history.push(newPhrase);
    if (history.length > 100) history.shift(); // Keep last 100
    localStorage.setItem('jarvis_script_history', JSON.stringify(history));
};

const forgeChecklistSequentially = async (title, items) => {
    const forgedScripts = {
        itemScripts: [],
        preStartSummary: "",
        startSummary: "",
        preEndSummary: "",
        completionMessage: ""
    };

    const currentHistory = getScriptHistory();

    // --- STAGE 1: TACTICAL ITEM FORGE ---
    addLogHeader("STAGE 1: TACTICAL ITEM FORGE");
    for (let i = 0; i < items.length; i++) {
        const itemText = typeof items[i] === 'string' ? items[i] : items[i].text;
        const nextItemText = items[i+1] ? (typeof items[i+1] === 'string' ? items[i+1] : items[i+1].text) : null;
        
        updateLogItemStatus(`script-${i}`, "working");
        updateLabStatus(`Forging unique script for: ${itemText}...`);

        let approved = false;
        let attempts = 0;
        let itemResult = null;

        while (!approved && attempts < 3) {
            attempts++;
            try {
                const response = await fetch('/api/forge-item', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        itemText, 
                        nextItemText, 
                        checklistTitle: title,
                        history: currentHistory.slice(-15) // Use persistent history
                    })
                });
                itemResult = await response.json();

                // --- THE DEBUGGER: Script DNA Check ---
                const isDuplicate = itemResult && itemResult.success && currentHistory.some(old => 
                    old.toLowerCase().includes(itemResult.success.toLowerCase().substring(0, 20))
                );

                if (!isDuplicate && itemResult && itemResult.success) {
                    approved = true;
                    saveScriptHistory(itemResult.success);
                } else {
                    addLogItem(`Refining phrasing for ${itemText}...`, "working");
                }
            } catch (e) {
                console.error(`Forge failed for ${itemText}`, e);
                break;
            }
        }

        forgedScripts.itemScripts.push({
            text: itemText,
            variations: itemResult?.variations || [itemText.toLowerCase()],
            success: itemResult?.success || `Excellent work on ${itemText}.`
        });

        updateLogItemStatus(`script-${i}`, "done");
        await delay(200);
    }

    // --- STAGE 2: STRATEGIC EVENT ARCHITECTURE ---
    addLogHeader("STAGE 2: STRATEGIC EVENT ARCHITECTURE");
    updateLabStatus("Forging event lifecycle scripts...");

    const summarySteps = [
        { id: 'summary-prestart', label: 'Forging Pre-Start Trailer', key: 'preStartSummary' },
        { id: 'summary-start', label: 'Forging Start Briefing', key: 'startSummary' },
        { id: 'summary-preend', label: 'Forging Pre-End Warning', key: 'preEndSummary' },
        { id: 'summary-completion', label: 'Forging Completion Briefing', key: 'completionMessage' }
    ];

    // Add them to log as pending
    summarySteps.forEach(step => addLogItem(step.label, "pending", step.id));

    try {
        // We call the API once, but we'll simulate the sequential "thinking" in the log
        const summaryResp = await fetch('/api/forge-summaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, items })
        });
        const summaries = await summaryResp.json();

        for (const step of summarySteps) {
            updateLogItemStatus(step.id, "working");
            updateLabStatus(`${step.label}...`);
            await delay(800); // Simulate Jarvis "thinking" about each summary
            forgedScripts[step.key] = summaries[step.key];
            saveScriptHistory(summaries[step.key]); // Save summaries to history too
            updateLogItemStatus(step.id, "done");
        }
    } catch (e) {
        console.error("Summary forge failed", e);
        // Fallbacks are handled by the server, but we'll mark them as done anyway
        summarySteps.forEach(step => updateLogItemStatus(step.id, "done"));
    }

    return forgedScripts;
};

deployChecklistBtn.addEventListener("click", async () => {
    const name = document.getElementById("checklist-name").value.trim();
    const startHour12 = parseInt(document.getElementById("checklist-start-hour").value);
    const startMin = parseInt(document.getElementById("checklist-start-min").value);
    const startAmpm = document.getElementById("checklist-start-ampm").value;
    const endHour12 = parseInt(document.getElementById("checklist-end-hour").value);
    const endMin = parseInt(document.getElementById("checklist-end-min").value);
    const endAmpm = document.getElementById("checklist-end-ampm").value;

    if (!name) { alert("Please give your checklist a title, Sir."); return; }
    if (currentChecklistItems.length === 0) { alert("A checklist needs at least one item, Sir."); return; }

    let startHour = startHour12;
    if (startAmpm === 'PM' && startHour < 12) startHour += 12;
    if (startAmpm === 'AM' && startHour === 12) startHour = 0;
    let endHour = endHour12;
    if (endAmpm === 'PM' && endHour < 12) endHour += 12;
    if (endAmpm === 'AM' && endHour === 12) endHour = 0;
    let startTotalMins = startHour * 60 + startMin;
    let endTotalMins = endHour * 60 + endMin;
    if (endTotalMins < startTotalMins) endTotalMins += 24 * 60;
    const duration = endTotalMins - startTotalMins;

    const checklistEvent = {
        dateKey: window.getDateKey(window.selectedDate),
        title: name,
        startHour, startMin, duration,
        type: 'checklist',
        color: '#22c55e',
        occupiesTime: true,
        items: currentChecklistItems.map(item => ({ text: typeof item === 'string' ? item : item.text, completed: false })),
        id: Date.now()
    };

    thinkingLabOverlay.classList.remove("hidden");
    resetLabLog();

    try {
        addLogHeader("STAGE 1: DISSECTING GOALS");
        updateDot("analyze", "active");
        currentChecklistItems.forEach((item, i) => addLogItem(`Analyzing: ${typeof item === 'string' ? item : item.text}`, "pending", `item-${i}`));
        await delay(500);
        for(let i=0; i<currentChecklistItems.length; i++) { updateLogItemStatus(`item-${i}`, "done"); }
        updateDot("analyze", "complete");

        // --- NEW: Multi-Stage Procedural Forge ---
        updateDot("forge", "active");
        
        // Prepare item slots in log for Stage 1
        currentChecklistItems.forEach((item, i) => {
            const itemText = typeof item === 'string' ? item : item.text;
            addLogItem(`Forging unique script for: ${itemText}`, "pending", `script-${i}`);
        });

        const aiScript = await forgeChecklistSequentially(name, currentChecklistItems);
        
        updateDot("forge", "complete");

        addLogHeader("STAGE 3: NEURAL SYNCHRONIZATION");
        updateDot("sync", "active");
        addLogItem("Mapping triggers to Priority Queue", "working", "sync-pq");
        await delay(800);
        updateLogItemStatus("sync-pq", "done");
        addLogItem("Broadcasting to AI Assistant", "working", "sync-chat");
        await delay(500);
        updateLogItemStatus("sync-chat", "done");

        checklistEvent.aiScript = aiScript;
        
        // Handle Routine logic
        const type = document.querySelector('input[name="checklist-type"]:checked').value;
        let eventsToSave = [];

        if (type === 'routine') {
            const interval = document.getElementById('checklist-recurrence-interval').value;
            const unit = document.getElementById('checklist-recurrence-unit').value;
            const endDate = document.getElementById('checklist-recurrence-end').value;
            const selectedDays = [];
            document.querySelectorAll('#checklist-week-days input:checked').forEach(cb => selectedDays.push(cb.value));
            const recurrenceOptions = { interval, unit, endDate, selectedDays };
            checklistEvent.seriesId = Date.now();
            if (window.generateRecurringEvents) {
                eventsToSave = window.generateRecurringEvents(checklistEvent, recurrenceOptions);
            } else {
                eventsToSave.push(checklistEvent);
            }
        } else {
            eventsToSave.push(checklistEvent);
        }

        // Save as Template if checked
        const saveAsTemplate = document.getElementById("save-checklist-as-template").checked;
        if (saveAsTemplate && window.saveTemplate) {
            const templateData = {
                title: name,
                type: 'checklist',
                color: '#22c55e',
                duration: duration,
                items: currentChecklistItems.map(item => typeof item === 'string' ? item : item.text)
                // --- CLEAN TEMPLATE: No aiScript saved here ---
            };
            await window.saveTemplate(templateData);
        }

        if (window.saveEvents) {
            await window.saveEvents(eventsToSave);
            updateActiveChecklistDisplay();
            if (window.updateStatusDashboard) window.updateStatusDashboard();
            thinkingLabOverlay.classList.add("hidden");
            checklistCreatorModal.style.display = "none";
        }
        updateDot("sync", "complete");
    } catch (error) {
        console.error("Thinking Lab failed:", error);
        addLogItem("CRITICAL ERROR", "error");
    }
});

// Helper functions for Thinking Lab
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const updateLabStatus = (text) => {
    labStatus.innerText = text;
};

const addLogHeader = (text) => {
    const header = document.createElement("div");
    header.className = "log-entry log-header";
    header.innerText = `> ${text}`;
    labLog.appendChild(header);
    labLog.scrollTop = labLog.scrollHeight;
};

const addLogItem = (text, status = "pending", id = "") => {
    const item = document.createElement("div");
    if (id) item.id = `log-${id}`;
    item.className = `log-entry log-item status-${status}`;
    item.innerHTML = `<i class="fas ${status === 'done' ? 'fa-check-circle' : status === 'working' ? 'fa-circle-notch fa-spin' : 'fa-circle'}"></i> <span>${text}</span>`;
    labLog.appendChild(item);
    labLog.scrollTop = labLog.scrollHeight;
};

const updateLogItemStatus = (id, status) => {
    const item = document.getElementById(`log-${id}`);
    if (item) {
        item.className = `log-entry log-item status-${status}`;
        const icon = item.querySelector("i");
        if (status === 'done') icon.className = "fas fa-check-circle";
        else if (status === 'working') icon.className = "fas fa-circle-notch fa-spin";
        else icon.className = "far fa-circle";
    }
};

const updateDot = (stage, status) => {
    const dot = document.getElementById(`dot-${stage}`);
    if (dot) {
        dot.className = `step-dot ${status}`;
    }
};

const resetLabLog = () => {
    labStatus.innerText = "Initializing procedural forge...";
    labLog.innerHTML = "";
    [dotAnalyze, dotForge, dotSync].forEach(dot => {
        dot.className = "step-dot";
    });
};

// Expose update function for script.js to call after fetching events
window.updateActiveChecklistDisplay = updateActiveChecklistDisplay;
