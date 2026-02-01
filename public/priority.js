class PriorityManager {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.currentExecution = null;
        this.history = [];
        this.completedIds = new Set();
    }

    // Add an event to the priority system
    addEvent(event, type, targetTimeMins = null) {
        // --- NEW: TWO AUDIT MODEL FOR CHECKLISTS ---
        if (event.type === 'checklist' && type === 'end') {
            // Path B (Timed)
            this.addEvent(event, 'audit_b');
            // Path A (Standby)
            this.addEvent(event, 'audit_a');
            return;
        }

        // Construct unique ID for this notification
        let uniqueId = `${event.id}_${type}`;
        
        if (type === 'checklist_item') {
            const itemText = typeof event.title === 'string' ? event.title : event.title.text;
            uniqueId = `${event.id}_item_${itemText.replace(/\s+/g, '_')}`;
        } else if (targetTimeMins) {
            uniqueId += `_${targetTimeMins}`;
        }

        // --- FIX: Prevent adding items if the event is already completed ---
        if (event.completed) {
            return;
        }

        // Prevent duplicates (either already queued or completed)
        if (this.queue.some(item => item.uniqueId === uniqueId) || this.completedIds.has(uniqueId)) {
            return;
        }

        // Calculate sort time (minutes since midnight)
        let sortTime = 0;
        if (targetTimeMins !== null) {
            sortTime = targetTimeMins;
        } else if (type === 'start') {
            sortTime = event.startHour * 60 + event.startMin;
        } else if (type === 'end' || type === 'audit_b') {
            sortTime = (event.startHour * 60 + event.startMin) + event.duration;
        } else if (type === 'pre_start') {
            sortTime = (event.startHour * 60 + event.startMin) - 5;
        } else if (type === 'pre_end') {
            sortTime = (event.startHour * 60 + event.startMin) + event.duration - 5;
        } else if (type === 'checkin') {
            sortTime = (event.startHour * 60 + event.startMin) + 5;
        } else {
            sortTime = event.startHour * 60 + event.startMin;
        }

        // Human readable time
        const h = Math.floor((sortTime + 1440) % 1440 / 60);
        const m = (sortTime + 1440) % 1440 % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const dispH = h % 12 || 12;
        const dispM = m < 10 ? '0' + m : m;
        const displayTime = `${dispH}:${dispM} ${ampm}`;

        const priorityItem = {
            uniqueId,
            id: event.id,
            title: event.title,
            type, // 'pre_start', 'start', 'checkin', 'pre_end', 'end', 'checklist_item', 'audit_a', 'audit_b'
            status: 'scheduled',
            phrase: null,
            addedAt: Date.now(),
            requiresResponse: (type === 'checkin' || type === 'end' || type === 'audit_b'),
            isDue: false,
            sortTime,
            displayTime,
            isStandby: (type === 'checklist_item' || type === 'audit_a')
        };

        this.queue.push(priorityItem);

        // Sort queue by time
        this.queue.sort((a, b) => {
            if (a.isStandby && !b.isStandby) return 1;
            if (!a.isStandby && b.isStandby) return -1;
            if (a.sortTime !== b.sortTime) return a.sortTime - b.sortTime;
            const endTypes = ['end', 'audit_b'];
            if (endTypes.includes(a.type) && !endTypes.includes(b.type)) return -1;
            if (!endTypes.includes(a.type) && endTypes.includes(b.type)) return 1;
            return 0;
        });

        this.render();
        this.manageBuffer();
    }

    // Check for Checklist Victory (Auto-cancel end messages & Path A Briefing)
    async checkChecklistVictory(eventId) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const dayKey = window.getDateKey(now);
        const todaysEvents = window.events[dayKey] || [];
        const event = todaysEvents.find(e => e.id === eventId);
        
        if (event && event.type === 'checklist') {
            const allDone = event.items.every(item => item.completed);
            if (allDone) {
                console.log(`[Priority] Victory detected for ${event.title}. Executing Path A.`);
                
                // 1. Filter out pre_end and audit_b for this specific event
                this.queue = this.queue.filter(item => {
                    const isEndTrigger = (item.id === eventId && (item.type === 'pre_end' || item.type === 'audit_b'));
                    return !isEndTrigger;
                });

                // 2. Mark event as completed on calendar
                if (!event.completed) {
                    event.completed = true;
                    if (window.updateEvent) await window.updateEvent(event);
                }

                // 3. Trigger the Audit Path A standby item
                const auditA = this.queue.find(item => item.id === eventId && item.type === 'audit_a');
                if (auditA) {
                    console.log("[Priority] Activating Audit Path A trigger.");
                    this.triggerStandbyAudit(eventId, 'audit_a');
                }

                this.render();
            }
        }
    }

    async triggerStandbyAudit(eventId, type) {
        if (this.isProcessing) {
            setTimeout(() => this.triggerStandbyAudit(eventId, type), 1000);
            return;
        }

        const item = this.queue.find(i => i.id === eventId && i.type === type);
        if (item) {
            this.isProcessing = true;
            this.currentExecution = item;
            item.status = 'executing';
            item.isDue = true; 
            this.render();
            this.executeItem(item);
        }
    }

    async triggerStandby(eventId, itemText) {
        console.log(`[Priority] Attempting to trigger standby for ${itemText}`);
        
        // Construct the uniqueId to check if already completed
        const uniqueId = `${eventId}_item_${itemText.replace(/\s+/g, '_')}`;
        if (this.completedIds.has(uniqueId)) {
            console.log(`[Priority] Item ${itemText} already completed.`);
            return;
        }

        // If we are already processing something, queue this trigger for a few milliseconds
        if (this.isProcessing) {
            console.log("[Priority] Busy. Retrying standby trigger in 1s...");
            setTimeout(() => this.triggerStandby(eventId, itemText), 1000);
            return;
        }

        const item = this.queue.find(i => i.uniqueId === uniqueId);
        if (item) {
            console.log(`[Priority] Triggering Standby: ${item.title}`);
            this.isProcessing = true;
            this.currentExecution = item;
            item.status = 'executing';
            item.isDue = true; 
            this.render();
            this.executeItem(item);
        } else {
            console.warn(`[Priority] Standby item not found in queue: ${itemText}`);
        }
    }

    // New: Manage Rolling Buffer (Keep top 3 loaded)
    manageBuffer() {
        // Find items that need loading
        // We only want to load items that are NOT 'ready' and NOT 'loading' already.
        // We want the TOP 3 scheduled items.
        
        const scheduledItems = this.queue.filter(item => item.status === 'scheduled');
        
        // We only care about the first 3
        const bufferTarget = scheduledItems.slice(0, 3);
        
        // But we only want to load ONE at a time to avoid thundering herd.
        // Is anything currently loading?
        const anythingLoading = this.queue.some(item => item.status === 'loading');
        
        if (!anythingLoading && bufferTarget.length > 0) {
            // Load the first one in the buffer
            this.prefetch(bufferTarget[0]);
        }
    }

    checkTimeTriggers() {
        if (this.queue.length === 0 || this.isProcessing) return;

        // Get the first "Ready" item
        const nextItem = this.queue.find(item => item.status === 'ready');
        if (!nextItem) return;

        // Check if it is TIME to fire
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        
        // Check exact time match (or slightly past)
        if (currentMins >= nextItem.sortTime) {
            console.log(`[Priority] Time Trigger for ${nextItem.title} (${nextItem.type})`);
            this.isProcessing = true;
            this.currentExecution = nextItem;
            nextItem.status = 'executing';
            this.render();
            this.runCountdown(nextItem).then(() => this.executeItem(nextItem));
        }
    }

    // Call this from dashboard loop
    tick() {
        // --- NEW: Aggressive Purge of Completed Events ---
        const now = new Date();
        const dayKey = window.getDateKey ? window.getDateKey(now) : `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
        const todaysEvents = window.events[dayKey] || [];
        
        // Remove any queued items for events that are now marked completed
        const originalLength = this.queue.length;
        this.queue = this.queue.filter(item => {
            const event = todaysEvents.find(e => e.id === item.id);
            // If event is completed, only keep it if it's currently being executed/waited on
            // (to allow the current speech to finish)
            if (event && event.completed && item.status !== 'executing' && item.status !== 'waiting') {
                console.log(`[Priority] Purging trigger for completed event: ${item.title}`);
                return false;
            }
            return true;
        });
        
        if (this.queue.length !== originalLength) {
            this.render();
        }
        // ------------------------------------------------

        this.checkTimeTriggers();
    }

    getItem(id, type) {
        return this.queue.find(i => i.id === id && i.type === type);
    }

    markAsDue(id, type) {
        const item = this.queue.find(i => i.id === id && i.type === type);
        if (item) {
            console.log(`[Priority] Marked as DUE: ${item.title}`);
            item.isDue = true;
            
            // Force process immediately if ready
            if (item.status === 'ready' && !this.isProcessing) {
                this.isProcessing = true;
                this.currentExecution = item;
                item.status = 'executing';
                this.render();
                this.runCountdown(item).then(() => this.executeItem(item));
            } else {
                // Just let the loop catch it
                this.processQueue();
            }
        }
    }

    // Pre-fetch AI response
    async prefetch(item) {
        if (item.status === 'ready' || item.status === 'loading') return;
        
        // --- NEW: Skip Pre-fetch for Audit items (Logic is local) ---
        if (item.type === 'audit_a' || item.type === 'audit_b') {
            item.status = 'ready';
            item.phrase = { trigger: "Local logic" };
            this.processQueue();
            this.manageBuffer();
            return;
        }
        // ------------------------------------------------------------

        // --- NEW: Check for Pre-generated AI Script ---
        const now = new Date();
        const dayKey = window.getDateKey ? window.getDateKey(now) : `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
        const event = window.events[dayKey]?.find(e => e.id === item.id);
        
        if (event && event.aiScript) {
            if (item.type === 'pre_start') {
                console.log(`[Priority] Using pre-generated pre-start trailer for ${item.title}`);
                item.phrase = { trigger: event.aiScript.preStartSummary || event.aiScript.summary };
                item.status = 'ready';
                this.processQueue();
                this.manageBuffer();
                return;
            } else if (item.type === 'start') {
                console.log(`[Priority] Using pre-generated start briefing for ${item.title}`);
                item.phrase = { trigger: event.aiScript.startSummary || event.aiScript.summary };
                item.status = 'ready';
                this.processQueue();
                this.manageBuffer();
                return;
            } else if (item.type === 'pre_end') {
                console.log(`[Priority] Using pre-generated pre-end warning for ${item.title}`);
                item.phrase = { trigger: event.aiScript.preEndSummary || event.aiScript.summary };
                item.status = 'ready';
                this.processQueue();
                this.manageBuffer();
                return;
            } else if (item.type === 'checklist_item') {
                // ONLY prefetch if the item is still incomplete in the actual event data
                const actualItem = event.items.find(i => (typeof i === 'string' ? i : i.text) === item.title);
                if (actualItem && actualItem.completed) {
                    console.log(`[Priority] Skipping prefetch for already completed item: ${item.title}`);
                    item.status = 'completed';
                    this.completedIds.add(item.uniqueId);
                    this.queue = this.queue.filter(i => i.uniqueId !== item.uniqueId);
                    this.render();
                    return;
                }

                console.log(`[Priority] Using pre-generated item script for ${item.title}`);
                const script = event.aiScript.itemScripts.find(s => s.text === item.title);
                
                // Check if this was the last item for the completion message
                const isLastItem = event.items.filter(i => !i.completed).length === 1;
                
                if (script) {
                    let triggerText = script.success;
                    if (isLastItem && event.aiScript.completionMessage) {
                        triggerText += " " + event.aiScript.completionMessage;
                    }
                    item.phrase = { trigger: triggerText };
                    item.status = 'ready';
                    this.processQueue();
                    this.manageBuffer();
                    return;
                }
            }
        }

        item.status = 'loading';
        this.render();

        try {
            console.log(`[Priority] Pre-fetching for ${item.title} (${item.type})`);
            
            // Determine time of day
            const now = new Date();
            const hour = now.getHours();
            let timeOfDay = "morning";
            if (hour >= 12 && hour < 18) timeOfDay = "afternoon";
            if (hour >= 18) timeOfDay = "evening";

            const response = await fetch('/api/generate-checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    eventTitle: item.title, 
                    timeOfDay, 
                    type: item.type 
                })
            });
            const data = await response.json();
            
            item.phrase = data; // Now an object: { trigger, reply_yes, reply_no }
            item.status = 'ready'; // Ready but maybe not due
            this.render();
            
            // Try to start execution if free AND due
            this.processQueue(); 
            
            // Trigger buffer check again (to load next one)
            this.manageBuffer();

        } catch (e) {
            console.error("[Priority] Pre-fetch failed:", e);
            // Smarter Fallback Object
            let fallback = { trigger: "Shall we proceed, Sir?", reply_yes: "Very good.", reply_no: "As you wish." };
            
            if (item.type === 'start') {
                fallback = { trigger: `Sir, it is time to begin ${item.title}.`, reply_yes: "Splendid.", reply_no: "I understand." };
            } else if (item.type === 'end' || item.type === 'audit_a' || item.type === 'audit_b') {
                fallback = { trigger: `The time for ${item.title} has concluded, Sir. Did we finish?`, reply_yes: "Excellent.", reply_no: "Noted." };
            } else if (item.type === 'checklist_item') {
                fallback = { trigger: `With that task handled, shall we move to the next, Sir?`, reply_yes: "Onward.", reply_no: "Understood." };
            }
            
            item.phrase = fallback;
            item.status = 'ready';
            this.processQueue();
            this.manageBuffer();
        }
    }

    // Main Loop
    async processQueue() {
        if (this.isProcessing) return;
        
        // Find next ready item THAT IS ALSO DUE
        const nextItem = this.queue.find(item => item.status === 'ready' && item.isDue);
        if (!nextItem) return;

        this.isProcessing = true;
        this.currentExecution = nextItem;
        nextItem.status = 'executing';
        this.render();

        // Start Countdown (Visual only, 3 seconds)
        await this.runCountdown(nextItem);

        // Execute (Speak + Chat)
        await this.executeItem(nextItem);
    }

    runCountdown(item) {
        return new Promise(resolve => {
            let count = 3;
            item.countdown = count;
            this.render();

            const timer = setInterval(() => {
                count--;
                item.countdown = count;
                this.render();

                if (count <= 0) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1000);
        });
    }

    async executeItem(item) {
        console.log(`[Priority] Executing: ${item.title} (${item.type})`);
        
        const now = new Date();
        const dayKey = window.getDateKey(now);
        const event = window.events[dayKey]?.find(e => e.id === item.id);

        // --- NEW: TWO-PATH AUDIT ENGINE ---
        if (item.type === 'audit_a') {
            console.log("[Priority] Path A: Executing Victory Briefing.");
            // Path A is a standby trigger, so remove audit_b if it exists
            this.queue = this.queue.filter(i => !(i.id === item.id && i.type === 'audit_b'));
            await this.executePathAVictory(event);
            this.resolveCurrent("completed");
            return;
        }

        if (item.type === 'audit_b') {
            if (event && event.type === 'checklist') {
                const pendingItems = event.items.filter(i => !i.completed);
                if (pendingItems.length > 0) {
                    console.log("[Priority] Path B: Entering Audit Mode.");
                    // Remove audit_a standby if it exists
                    this.queue = this.queue.filter(i => !(i.id === item.id && i.type === 'audit_a'));
                    this.startAuditMode(event, pendingItems);
                    return; 
                } else {
                    // Fallback: If timed audit_b triggers but everything is done
                    console.log("[Priority] Path B triggered but list is done. Switching to Path A.");
                    this.queue = this.queue.filter(i => !(i.id === item.id && i.type === 'audit_a'));
                    await this.executePathAVictory(event);
                    this.resolveCurrent("completed");
                    return;
                }
            }
        }
        // --------------------------------------------

        // 1. Trigger Notification (Chat + Voice)
        return new Promise(resolve => {
            // Extract trigger phrase
            let triggerText = "Shall we proceed, Sir?";
            if (item.phrase) {
                // CRITICAL FIX: Ensure we extract the string from the object
                triggerText = item.phrase.trigger || item.phrase.success || (typeof item.phrase === 'string' ? item.phrase : "Ready?");
                
                // --- THE NULL FILTER: Safety gate to prevent "null" from being spoken ---
                triggerText = triggerText.replace(/\bnull\b/gi, "everything");
            }

            // --- HOLD MECHANISM: Transition Bridge ---
            if (this.justFinishedAudit && item.type === 'pre_start') {
                triggerText = `With that logged, Sir, your next event is approaching. ${triggerText}`;
                this.justFinishedAudit = false;
            }

            window.notifier.trigger(
                item.type === 'start' ? "Event Starting" : "Check-in",
                triggerText,
                item.type,
                () => {
                    console.log("[Priority] Speech ended.");
                    
                    if (item.requiresResponse) {
                        item.status = 'waiting';
                        this.render();
                        
                        this.responseTimeout = setTimeout(() => {
                            this.resolveCurrent("timeout");
                        }, 60000);

                         const voiceOrb = document.getElementById('voice-orb');
                         if (voiceOrb) voiceOrb.click();

                         if (window.addCheckInToChat) {
                             window.addCheckInToChat(triggerText, item.id);
                         }
                    } else {
                        this.resolveCurrent("completed");
                    }
                }
            );
        });
    }

    async executePathAVictory(event) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const dayKey = window.getDateKey(now);
        const todaysEvents = window.events[dayKey] || [];

        // 1. Mark event as completed
        if (!event.completed) {
            event.completed = true;
            if (window.updateEvent) await window.updateEvent(event);
        }

        // 2. Efficiency Briefing
        const futureEvents = todaysEvents
            .filter(e => !e.completed && (e.startHour * 60 + e.startMin) > currentMins)
            .sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));
        
        const nextEvent = futureEvents[0];
        let briefing = (event.aiScript && event.aiScript.completionMessage) 
            ? event.aiScript.completionMessage 
            : `Splendid work, Sir! You have completed the ${event.title} checklist perfectly. `;
        
        if (!event.aiScript || !event.aiScript.completionMessage) {
            if (nextEvent) {
                const nextStartMins = nextEvent.startHour * 60 + nextEvent.startMin;
                const gap = nextStartMins - currentMins;
                const nextH = nextEvent.startHour % 12 || 12;
                const nextM = nextEvent.startMin < 10 ? '0' + nextEvent.startMin : nextEvent.startMin;
                const nextAmPm = nextEvent.startHour >= 12 ? 'PM' : 'AM';
                briefing += `You are ${gap} minutes ahead of schedule. Your next event, ${nextEvent.title}, is scheduled for ${nextH}:${nextM} ${nextAmPm}. Enjoy your free time, Sir.`;
            } else {
                briefing += `You have completed all your tasks for today. Well done, Sir.`;
            }
        }

        // --- ROBUST SPEECH: With timeout to prevent hanging ---
        await new Promise(resolve => {
            const safetyTimeout = setTimeout(() => {
                console.warn("[Priority] Path A speech timed out. Moving on.");
                resolve();
            }, 15000); // 15s max

            window.notifier.speak(briefing, () => {
                clearTimeout(safetyTimeout);
                resolve();
            });
            
            if (window.addMessageToChat) window.addMessageToChat(briefing, "ai");
        });
    }

    // Called by script.js when User says "Yes" or types in chat
    // --- AUDIT MODE ENGINE ---
    async startAuditMode(event, pendingItems) {
        this.isProcessing = true;
        this.auditContext = {
            event: event,
            items: pendingItems,
            currentIndex: 0
        };

        // 1. SILENCE TRIGGERS: Remove any pending checklist_item triggers for this event
        console.log(`[Priority] Silencing remaining triggers for ${event.title} audit.`);
        this.queue = this.queue.filter(item => !(item.id === event.id && item.type === 'checklist_item'));

        const briefing = `Sir, the time for your ${event.title} has concluded, but I see ${pendingItems.length} items still pending. Let's perform a quick audit.`;
        
        // Briefing
        await new Promise(resolve => {
            window.notifier.speak(briefing, resolve);
            if (window.addMessageToChat) window.addMessageToChat(briefing, "ai");
        });

        this.askAuditQuestion();
    }

    async askAuditQuestion() {
        const context = this.auditContext;
        if (!context || context.currentIndex >= context.items.length) {
            this.finishAudit();
            return;
        }

        const currentItem = context.items[context.currentIndex];
        const question = `Did you finish ${currentItem.text}, Sir?`;
        
        // Update current execution for UI state
        this.currentExecution = { 
            id: context.event.id, 
            uniqueId: `audit_${context.event.id}_${context.currentIndex}`,
            type: 'audit', 
            title: currentItem.text,
            requiresResponse: true,
            status: 'waiting',
            displayTime: 'NOW'
        };
        this.render();

        window.notifier.trigger("Checklist Audit", question, "audit", () => {
            console.log("[Priority] Audit question spoken.");
            // Open mic for response
            const voiceOrb = document.getElementById('voice-orb');
            if (voiceOrb) voiceOrb.click();
        });
    }

    async finishAudit() {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const dayKey = window.getDateKey(now);
        const todaysEvents = window.events[dayKey] || [];
        
        let msg = (this.auditContext.event.aiScript && this.auditContext.event.aiScript.completionMessage)
            ? this.auditContext.event.aiScript.completionMessage
            : `Audit complete. I've updated your record for the ${this.auditContext.event.title}, Sir.`;
        
        // Path B "Smart" Check (Only add if no forged message or if forged message doesn't mention schedule)
        if (!this.auditContext.event.aiScript || !this.auditContext.event.aiScript.completionMessage) {
            const futureEvents = todaysEvents
                .filter(e => !e.completed && (e.startHour * 60 + e.startMin) > currentMins)
                .sort((a, b) => (a.startHour * 60 + a.startMin) - (b.startHour * 60 + b.startMin));

            if (futureEvents.length === 0) {
                msg += " I see you have no further tasks for the rest of the day. Enjoy your evening, Sir.";
            }
        }

        // --- SILENCE PATH A VICTORY: Prevent overlapping briefings ---
        const eventId = this.auditContext.event.id;
        this.queue = this.queue.filter(item => !(item.id === eventId && item.type === 'audit_a'));
        // --------------------------------------------------------------

        // --- FIX: Force move to completed log after speech ---
        await new Promise(resolve => {
            const safetyTimeout = setTimeout(() => {
                console.warn("[Priority] Audit finish speech timed out.");
                resolve();
            }, 15000);

            window.notifier.speak(msg, () => {
                clearTimeout(safetyTimeout);
                resolve();
            });
            if (window.addMessageToChat) window.addMessageToChat(msg, "ai");
        });
        
        // Mark event as completed on calendar
        this.auditContext.event.completed = true;
        if (window.updateEvent) await window.updateEvent(this.auditContext.event);
        
        // Final cleanup and state reset
        const auditItemId = `audit_${this.auditContext.event.id}_${this.auditContext.items.length - 1}`;
        this.completedIds.add(auditItemId);
        
        this.auditContext = null;
        this.isProcessing = false;
        this.currentExecution = null;
        this.justFinishedAudit = true; 
        this.render();
        // Force a processQueue to clear the "Speaking" state from UI
        setTimeout(() => this.processQueue(), 100);
    }

    async resolveCurrent(reason) {
        if (!this.currentExecution) return;

        // --- Handle Audit Mode Resolution (Path B) ---
        if (this.auditContext && this.currentExecution.type === 'audit') {
            console.log(`[Priority] Audit response received for: ${this.currentExecution.title}`);
            const currentItem = this.auditContext.items[this.auditContext.currentIndex];
            
            // "Check it off" in UI regardless of yes/no
            currentItem.completed = true; 
            if (window.updateEvent) window.updateEvent(this.auditContext.event);

            // Removed per-item acknowledgement for efficiency

            this.auditContext.currentIndex++;
            setTimeout(() => this.askAuditQuestion(), 500); 
            return;
        }

        // --- Handle Path A Resolution ---
        if (this.currentExecution.type === 'audit' && this.currentExecution.auditPath === 'A') {
            this.justFinishedAudit = true;
        }

        console.log(`[Priority] Resolved current item via ${reason}`);
        
        if (this.responseTimeout) clearTimeout(this.responseTimeout);

        // Update Status
        this.currentExecution.status = 'completed';
        this.currentExecution.result = reason; 
        this.completedIds.add(this.currentExecution.uniqueId); 
        
        this.history.unshift(this.currentExecution); 
        if (this.history.length > 50) this.history.pop(); 

        this.queue = this.queue.filter(i => i !== this.currentExecution);
        this.currentExecution = null;
        this.isProcessing = false;
        this.render();

        setTimeout(() => {
            this.processQueue();
            this.manageBuffer();
        }, 1000);
    }

    render() {
        this.renderQueue();
        this.renderHistory();
    }

    renderQueue() {
        const listContainer = document.getElementById('priority-list');
        if (!listContainer) return;

        if (this.queue.length === 0) {
            listContainer.innerHTML = '<div class="empty-priority">All tasks organized.</div>';
            return;
        }

        listContainer.innerHTML = this.queue.map((item, index) => {
            return this.generateItemHTML(item, index, false);
        }).join('');
    }

    renderHistory() {
        if (!this.history) this.history = []; // Safety check for uninitialized history
        
        const historyContainer = document.getElementById('priority-history');
        if (!historyContainer) return;

        if (this.history.length === 0) {
            historyContainer.innerHTML = '<div class="empty-priority">No completed actions yet.</div>';
            return;
        }

        historyContainer.innerHTML = this.history.map((item, index) => {
            return this.generateItemHTML(item, index, true);
        }).join('');
    }

    generateItemHTML(item, index, isHistory) {
        let statusIcon = '';
        let statusClass = '';
        let extraInfo = item.displayTime; // Default to Time

        if (isHistory) {
            statusIcon = '<i class="fas fa-check-square"></i>'; // Checkbox style
            statusClass = 'completed';
            extraInfo = `Done (${item.result === 'manual_dismiss' ? 'No' : 'Yes'})`;
        } else {
            // Queue Logic
            if (item.status === 'scheduled') {
                statusIcon = '<i class="far fa-square"></i>';
                statusClass = 'scheduled';
            } else if (item.status === 'loading') {
                statusIcon = '<i class="fas fa-circle-notch fa-spin"></i>';
                statusClass = 'loading';
                extraInfo = 'Generating...';
            } else if (item.status === 'ready') {
                statusIcon = '<i class="far fa-square"></i>'; // Ready is just a state, visual is same
                statusClass = 'ready';
            } else if (item.status === 'executing') {
                statusIcon = '<i class="fas fa-play-circle"></i>';
                statusClass = 'executing';
                extraInfo = item.countdown ? `Speaking in ${item.countdown}s` : 'Speaking...';
            } else if (item.status === 'waiting') {
                statusIcon = '<i class="far fa-question-circle"></i>';
                statusClass = 'waiting';
                extraInfo = 'Waiting...';
            }
        }

        const typeLabel = item.type === 'audit_a' ? 'AUDIT: PATH A' : item.type === 'audit_b' ? 'AUDIT: PATH B' : item.type.toUpperCase();
        let typeClass = 'type-checkin';
        if (item.type === 'start') typeClass = 'type-start';
        if (item.type === 'end' || item.type === 'audit_a' || item.type === 'audit_b') typeClass = 'type-end';
        if (item.isStandby) {
            typeClass = 'type-standby';
            extraInfo = item.status === 'ready' ? 'READY' : 'STANDBY';
        }

        return `
            <div class="priority-item ${statusClass} ${item.isStandby ? 'standby-item' : ''}">
                <div class="priority-index">${isHistory ? '<i class="fas fa-check"></i>' : index + 1}</div>
                <div class="priority-content">
                    <div class="priority-header">
                        <span class="priority-type ${typeClass}">${typeLabel}</span>
                        <span class="priority-status-text">${extraInfo}</span>
                    </div>
                    <div class="priority-title">${item.title}</div>
                </div>
                <div class="priority-icon">
                    ${statusIcon}
                </div>
            </div>
        `;
    }
}

window.priorityManager = new PriorityManager();
