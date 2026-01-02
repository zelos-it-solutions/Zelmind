// Enable GitHub-flavored markdown and line breaks
marked.setOptions({
    gfm: true,
    breaks: true,
    smartLists: true,
    smartypants: false,
    headerIds: false,
    mangle: false
});

// Auto-dismiss Flash Messages
document.addEventListener('DOMContentLoaded', function () {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
        setTimeout(function () {
            const alerts = messagesContainer.querySelectorAll('.alert');
            alerts.forEach(function (alert) {
                alert.style.opacity = '0';
                setTimeout(function () { alert.remove(); }, 500); // Remove after fade out
            });
        }, 5000);
    }
});

// Get the Google Calendar icon URL from a data attribute on the body
const googleCalendarIconUrl = document.body.dataset.googleCalendarIconUrl; // Assuming data-google-calendar-icon-url on body
const googleConnectUrl = document.body.dataset.googleConnectUrl || '/accounts/google/login/'; // Assuming data-google-connect-url on body, fallback

// --- Status Indicator System ---
let currentStatusIndicator = null;

function showStatus(message, type = 'loading') {
    // Remove previous status if it exists
    if (currentStatusIndicator) {
        currentStatusIndicator.remove();
    }

    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    const statusDiv = document.createElement('div');
    statusDiv.className = `status-indicator status-${type}`;
    statusDiv.innerHTML = `
        ${type === 'loading' ? '<div class="spinner"></div>' : ''}
        ${type === 'success' ? '<span class="status-icon">✓</span>' : ''}
        ${type === 'warning' ? '<span class="status-icon">⚠</span>' : ''}
        <span class="status-text">${message}</span>
    `;

    chatMessages.appendChild(statusDiv);
    currentStatusIndicator = statusDiv;

    // Auto-scroll to show status
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Auto-remove success/warning after 2 seconds
    if (type === 'success' || type === 'warning') {
        setTimeout(() => {
            if (statusDiv.parentElement) {
                statusDiv.style.opacity = '0';
                setTimeout(() => statusDiv.remove(), 300);
            }
            if (currentStatusIndicator === statusDiv) {
                currentStatusIndicator = null;
            }
        }, 2000);
    }

    return statusDiv;
}

function clearStatus() {
    if (currentStatusIndicator) {
        currentStatusIndicator.remove();
        currentStatusIndicator = null;
    }
}




// --- Sidebar Toggle ---
document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.sidebar-wrapper').classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
    });
});

// --- Textarea Autosize & Enter key ---
const textarea = document.getElementById("chat-input");
if (textarea) {
    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('blur', () => {
        if (textarea.value.trim() === '') {
            textarea.style.height = '35px';
        }
    });
    textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const form = document.getElementById("chat-form");
            if (form) {
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); // Trigger form submit
                }
            }
        }
    });
}


function autoResize() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
}

// --- Scroll to Bottom ---
function scrollChatToBottom() {
    const chatMessagesContainer = document.getElementById("chat-box");
    if (chatMessagesContainer) {
        const last = chatMessagesContainer.querySelector('.message:last-child');
        if (last) {
            last.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    }
}

// --- Welcome Message Logic ---

// Function to remove the welcome message (static or animating) - Kept as it's used when sending the first message
function removeWelcomeMessage() {
    const chatMessagesContainer = document.getElementById("chat-box");
    if (!chatMessagesContainer) return;
    const welcomeMessageBubble = chatMessagesContainer.querySelector('.message .bubble[data-welcome-message="true"]');
    if (welcomeMessageBubble) {
        const messageDiv = welcomeMessageBubble.closest('.message');
        if (messageDiv) {
            messageDiv.remove();
        }
    }
}

// Function to type text character by character into a bubble element
// Uses timestamp-based logic to support background tab persistence and consistent speed
function typeText(element, rawText, speed = 10, callback = null) { // Increased default speed (lower ms)
    const textStr = String(rawText);

    if (!document.body.contains(element)) {
        console.warn("Attempted to type text into element not in DOM. Aborting animation.");
        if (callback) callback();
        return;
    }

    element.textContent = "";
    element.classList.add('typing-in-progress');

    const startTime = Date.now();

    function update() {
        if (!document.body.contains(element)) {
            if (callback) callback();
            return;
        }

        const now = Date.now();
        const elapsed = now - startTime;
        // Calculate how many characters should be shown based on elapsed time
        const charIndex = Math.floor(elapsed / speed);

        if (charIndex < textStr.length) {
            // Update content to current index
            element.textContent = textStr.substring(0, charIndex + 1);
            requestAnimationFrame(update);
        } else {
            element.classList.remove('typing-in-progress');
            element.innerHTML = marked.parse(textStr);
            if (callback) callback();
        }
    }

    requestAnimationFrame(update);
}

// Basic HTML escaping helper (important for injecting dynamic text into HTML)
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// --- Chat Message Appending (Handles Structured Responses) ---
// Function to create and append a message bubble or structured content and handles different response types based on data from the backend
function appendMessage(sender, responseData, isTyping = false, convoId = null, isFirstActualMessage = false, placeholderElement = null) {
    const chatMessagesContainer = document.getElementById("chat-box");
    if (!chatMessagesContainer) {
        console.error("Chat messages container not found!");
        return null;
    }

    const responseType = responseData?.type || 'text';
    const responseContent = responseType === 'text' ? responseData?.response : responseData?.content;


    let messageDiv;
    let contentContainer;
    let avatarDiv = null;

    // If a placeholder element (the typing indicator bubble) is provided, use its parent message div
    if (placeholderElement) {
        messageDiv = placeholderElement.closest('.message');
        if (!messageDiv) {
            console.error("Placeholder element found, but its parent message div is missing!");
            // Fallback to creating a new message div if parent not found
            messageDiv = document.createElement("div");
            messageDiv.classList.add("message", sender + "-message");
        }
        contentContainer = placeholderElement;

    } else {
        messageDiv = document.createElement("div");
        messageDiv.classList.add("message", sender + "-message");

        contentContainer = document.createElement("div");
        if (responseType === 'text') {
            contentContainer.classList.add("bubble");
        }
    }


    // Set data attributes on the message div
    messageDiv.dataset.sender = sender;
    if (convoId) {
        messageDiv.dataset.convoId = convoId;
    }
    if (isFirstActualMessage) {
        messageDiv.dataset.isFirstActualMessage = 'true';
    }

    // Give an avatar to user messages AND to all agent messages, but avoid duplicates
    if (sender === 'user' || sender === 'agent') {
        avatarDiv = messageDiv.querySelector('.avatar');
        if (!avatarDiv) {
            avatarDiv = document.createElement("div");
            avatarDiv.classList.add('avatar', sender + '-avatar');
            messageDiv.prepend(avatarDiv);

            if (sender === 'user') {
                const userAvatarMain = document.querySelector('.nav-user .avatar');
                const userInitial = userAvatarMain ? userAvatarMain.textContent.trim() : 'U';
                avatarDiv.textContent = userInitial;

            } else { // agent avatar (calendar icon SVG)
                avatarDiv.innerHTML = `
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14
                             c0 1.1.9 2 2 2h14
                             c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM19 20H5V8h14v12z"
                          fill="#5F6368"/>
                  </svg>`;
            }
        }
    }


    // Handle content based on response type and typing status
    if (isTyping && responseType === 'text') {
        // If creating a new typing message, add the typing indicator HTML
        if (!placeholderElement) {
            contentContainer.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            messageDiv.classList.add("typing-message");
            messageDiv.appendChild(contentContainer);
            chatMessagesContainer.appendChild(messageDiv);
        }
        return contentContainer;

    } else {
        messageDiv.classList.remove("typing-message");
        const typingIndicator = contentContainer.querySelector('.typing-indicator');
        if (typingIndicator) typingIndicator.remove();


        // Handle different response types to populate contentContainer
        if (responseType === 'text') {
            contentContainer.classList.add("bubble");
            const textContent = responseContent || '';

            messageDiv.dataset.raw = textContent;

            if (placeholderElement) {
                typeText(contentContainer, textContent, 3, scrollChatToBottom);
            } else {
                contentContainer.innerHTML = marked.parse(textContent);
            }

        } else if (responseType === 'event_success') {
            renderEventSuccess(contentContainer, responseData);

        } else if (responseType === 'event_confirmation_request') {
            renderEventPreview(contentContainer, responseContent, convoId, responseContent.message_id);

        } else if (responseType === 'event_deletion_confirmation') {
            renderEventDeletionConfirmation(contentContainer, responseContent, convoId, responseContent.message_id);

            // Add agent message text alongside the card if present
            if (responseData?.response) {
                const textBubble = document.createElement('div');
                textBubble.className = 'bubble';
                textBubble.style.marginTop = '8px';
                textBubble.innerHTML = marked.parse(responseData.response);

                // Find message-content or create it
                let messageContent = messageDiv.querySelector('.message-content');
                if (!messageContent) {
                    messageContent = document.createElement('div');
                    messageContent.classList.add('message-content');
                    messageDiv.appendChild(messageContent);
                }
                messageContent.appendChild(textBubble);
            }

        } else if (responseType === 'event_update_confirmation') {
            renderEventUpdateConfirmation(contentContainer, responseContent, convoId, responseContent.message_id);

            // Add agent message text alongside the card if present
            if (responseData?.response) {
                const textBubble = document.createElement('div');
                textBubble.className = 'bubble';
                textBubble.style.marginTop = '8px';
                textBubble.innerHTML = marked.parse(responseData.response);

                // Find message-content or create it
                let messageContent = messageDiv.querySelector('.message-content');
                if (!messageContent) {
                    messageContent = document.createElement('div');
                    messageContent.classList.add('message-content');
                    messageDiv.appendChild(messageContent);
                }
                messageContent.appendChild(textBubble);
            }

        } else if (responseType === 'event_updated') {
            contentContainer.classList.remove("bubble");
            contentContainer.innerHTML = `
                \u003cdiv style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; color: #fff; display: flex; align-items: center; gap: 12px;"\u003e
                    \u003cdiv style="background: #333; border-radius: 50%; padding: 8px;"\u003e
                        \u003csvg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"\u003e
                            \u003cpath d="M20 6L9 17l-5-5" /\u003e
                        \u003c/svg\u003e
                    \u003c/div\u003e
                    \u003cdiv style="font-weight: 600;"\u003eEvent Updated\u003c/div\u003e
                \u003c/div\u003e
            `;

            // Add agent message text alongside the card if present
            if (responseData?.response) {
                const textBubble = document.createElement('div');
                textBubble.className = 'bubble';
                textBubble.style.marginTop = '8px';
                textBubble.innerHTML = marked.parse(responseData.response);

                // Find message-content or create it
                let messageContent = messageDiv.querySelector('.message-content');
                if (!messageContent) {
                    messageContent = document.createElement('div');
                    messageContent.classList.add('message-content');
                    messageDiv.appendChild(messageContent);
                }
                messageContent.appendChild(textBubble);
            }

        } else if (responseType === 'event_deleted') {
            contentContainer.classList.remove("bubble");
            contentContainer.innerHTML = `
                <div style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; color: #fff; display: flex; align-items: center; gap: 12px;">
                    <div style="background: #333; border-radius: 50%; padding: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </div>
                    <div style="font-weight: 600;">Event Deleted</div>
                </div>
            `;

            // Add agent message text alongside the card if present
            if (responseData?.response) {
                const textBubble = document.createElement('div');
                textBubble.className = 'bubble';
                textBubble.style.marginTop = '8px';
                textBubble.innerHTML = marked.parse(responseData.response);

                // Find message-content or create it
                let messageContent = messageDiv.querySelector('.message-content');
                if (!messageContent) {
                    messageContent = document.createElement('div');
                    messageContent.classList.add('message-content');
                    messageDiv.appendChild(messageContent);
                }
                messageContent.appendChild(textBubble);
            }

        } else if (responseType === 'needs_connection') {
            // Keep the bubble styling so it aligns with the agent avatar
            contentContainer.classList.add('bubble');
            const connectedEmail = responseContent?.email || '';
            const agentPrompt = responseContent?.message_for_user || 'Please connect your Google account.';
            const connectHref = responseContent?.content_url || responseContent?.connect_url || googleConnectUrl;
            const needsConnectionHtml = `
                 <p class="connect-account-heading">${escapeHtml(agentPrompt)}</p>
                 <div class="connect-buttons">
                   <a href="${connectHref}" class="google-connect-btn">
                     <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.64 9.2045C17.64 8.56567 17.5844 7.95816 17.4769 7.37974H9V10.7197H13.9183C13.6711 12.0829 12.9344 13.2644 11.8344 14.0153V16.2715H14.7776C16.5322 14.6384 17.64 12.2644 17.64 9.2045Z" fill="#4285F4"/>
                        <path d="M9 18C11.43 18 13.46 17.19 14.96 15.94L11.83 14.01C11.09 14.5 10.1 14.81 9 14.81C6.81 14.81 4.96 13.45 4.36 11.54H1.33V13.8C2.84 16.85 5.62 18 9 18Z" fill="#34A853"/>
                        <path d="M4.36 11.54C4.08 10.85 3.93 10.08 3.93 9.29C3.93 8.5 4.08 7.73 4.36 7.04V4.78H1.33C0.48 6.47 0 7.88 0 9.29C0 10.7 0.48 12.11 1.33 13.8L4.36 11.54Z" fill="#FBBC05"/>
                        <path d="M9 3.87C10.14 3.87 11.15 4.26 11.96 5.05L15.01 2.01C13.46 0.76 11.43 0 9 0C5.62 0 2.84 1.15 1.33 4.19L4.36 6.46C4.96 4.55 6.81 3.19 9 3.19V3.87Z" fill="#EA4335"/>
                     </svg>
                     Connect ${escapeHtml(connectedEmail) || 'your Google account'}
                   </a>
                   <button class="skip-btn">Skip</button>
                 </div>
               `;
            contentContainer.innerHTML = needsConnectionHtml;

        } else if (responseType === 'connected_status') {
            // Remove bubble class for structured content
            contentContainer.classList.remove("bubble");
            const connectedEmail = responseContent?.email || 'Account';
            const connectedStatusHtml = `
                 <div class="connected-account-status">
                   <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.64 9.2045C17.64 8.56567 17.5844 7.95816 17.4769 7.37974H9V10.7197H13.9183C13.6711 12.0829 12.9344 13.2644 11.8344 14.0153V16.2715H14.7776C16.5322 14.6384 17.64 12.2644 17.64 9.2045Z" fill="#4285F4"/>
                      <path d="M9 18C11.43 18 13.46 17.19 14.96 15.94L11.83 14.01C11.09 14.5 10.1 14.81 9 14.81C6.81 14.81 4.96 13.45 4.36 11.54H1.33V13.8C2.84 16.85 5.62 18 9 18Z" fill="#34A853"/>
                      <path d="M4.36 11.54C4.08 10.85 3.93 10.08 3.93 9.29C3.93 8.5 4.08 7.73 4.36 7.04V4.78H1.33C0.48 6.47 0 7.88 0 9.29C0 10.7 0.48 12.11 1.33 13.8L4.36 11.54Z" fill="#FBBC05"/>
                      <path d="M9 3.87C10.14 3.87 11.15 4.26 11.96 5.05L15.01 2.01C13.46 0.76 11.43 0 9 0C5.62 0 2.84 1.15 1.33 4.19L4.36 6.46C4.96 4.55 6.81 3.19 9 3.19V3.87Z" fill="#EA4335"/>
                   </svg>
                   <span class="connected-text">${escapeHtml(connectedEmail)} connected</span>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <path d="M9 16.17L5.41 12.59L4 14L9 19L20 8L18.59 6.59L9 16.17Z" fill="#9AA0A6"/>
                   </svg>
                 </div>
               `;
            contentContainer.innerHTML = connectedStatusHtml;

        }

        if (!placeholderElement) {
            const messageContent = document.createElement('div');
            messageContent.classList.add('message-content');

            messageContent.appendChild(contentContainer);

            messageDiv.appendChild(messageContent);
            chatMessagesContainer.appendChild(messageDiv);
        }

        scrollChatToBottom();

        return null;
    }
}


// Show "create event loader and connect google account when user requests a calendar related task"
function showCreateEventProgressThenSuccess(successContent) {
    const chatMessagesContainer = document.getElementById("chat-box")
    const messageDiv = document.createElement("div")
    messageDiv.classList.add("message", "agent-message")

    const contentDiv = document.createElement("div")
    contentDiv.classList.add("bubble")

    // Create event (loading animation)
    contentDiv.innerHTML = `
        <div class="create-event-box">
            <div class="create-event-icon">
                ${googleCalendarIconUrl ? `<img src="${googleCalendarIconUrl}" alt="Google Calendar" width="24" height="24">` : ''}
                <div class="circular-loader"></div>
            </div>
            <div class="create-event-details">
                <div class="create-event-title">Creating event</div>
                <div class="create-event-subtitle">Working on it...</div>
            </div>
        </div>
    `
    messageDiv.appendChild(contentDiv)
    chatMessagesContainer.appendChild(messageDiv)
    scrollChatToBottom()

    // After a short delay, replace with success UI in the backend
    setTimeout(() => {
        const eventTitle = successContent?.event_title || 'Your Event'
        const connectedEmail = successContent?.connected_email || ''
        contentDiv.classList.remove("bubble")
        const agentExplanationText = successContent?.agent_explanation || '';

        let agentExplanation = '';
        if (agentExplanationText) {
            agentExplanation = `<div class="agent-explanation">${escapeHtml(agentExplanationText).replace(/\n/g, '<br>')}</div>`;
        }

        contentDiv.innerHTML = `
            <div class="create-event-box">
                <div class="create-event-icon">
                    ${googleCalendarIconUrl ? `<img src="${googleCalendarIconUrl}" alt="Google Calendar" width="24" height="24">` : ''}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="#34A853"/>
                    </svg>
                </div>
                <div class="create-event-details">
                    <div class="create-event-title">${escapeHtml(eventTitle)}</div>
                    <div class="create-event-subtitle success">Event created successfully</div>
                    ${agentExplanation}
                </div>
            </div>
        `
        scrollChatToBottom()
    }, 700)
}



// Function to update the conversation title in the recents list
function updateRecentsTitle(convoId, newTitle) {
    const recentsList = document.getElementById('recents-list');
    if (!recentsList) {
        console.warn("Recents list not found, cannot update title.");
        return;
    }

    // Find the list item using data-convo-id
    const recentItem = recentsList.querySelector(`li[data-convo-id="${convoId}"]`);
    if (recentItem) {
        const recentLink = recentItem.querySelector('.recent-link');
        if (recentLink) {
            const plainTitle = String(newTitle || "New Chat").trim();
            recentLink.textContent = '';
            let i = 0;
            (function typeTitle() {
                if (i < plainTitle.length) {
                    recentLink.append(plainTitle.charAt(i));
                    i++;
                    setTimeout(typeTitle, 120);  // 120 ms between chars
                }
            })();

            // Ensure active state
            recentsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
            recentItem.classList.add('active');

            recentsList.prepend(recentItem); // Move the updated item to the top
        } else {
            console.warn(`Link element with class 'recent-link' not found within list item for convo ID ${convoId}.`);
        }
    } else {
        console.warn(`List item with data-convo-id="${convoId}" not found in recents list.`);
    }
}


// --- Helper Functions for Rendering Structured Content (Global Scope) ---
function renderEventSuccess(container, responseData) {
    // Remove bubble class for structured content
    container.classList.remove("bubble");
    const responseContent = responseData.content || responseData;
    const eventTitle = responseContent?.event_title || responseData?.event_title || 'Your Event';
    const agentExplanationText = responseContent?.agent_explanation || responseData.response || '';

    const eventSuccessHtml = `
         <div class="create-event-box">
            <div class="create-event-icon">
               ${googleCalendarIconUrl ? `<img src="${googleCalendarIconUrl}" alt="Google Calendar" width="24" height="24">` : ''}
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="#34A853"/>
               </svg>
            </div>
            <div class="create-event-details">
               <div class="create-event-title">${escapeHtml(eventTitle)}</div>
               <div class="create-event-subtitle success">Event created successfully</div>
             </div>
         </div>
      `;
    container.innerHTML = eventSuccessHtml;
    // Append a typed agent text bubble within the same message
    if (agentExplanationText) {
        const explainBubble = document.createElement('div');
        explainBubble.classList.add('bubble');
        explainBubble.style.marginTop = '8px';
        container.appendChild(explainBubble);
        typeText(explainBubble, agentExplanationText, 3, scrollChatToBottom);
    }
}

function renderEventDeletionConfirmation(container, content, convoId, messageId) {
    container.classList.remove("bubble");

    // Handle start date/time safely
    let dateStr = "Unknown Date";
    let timeStr = "";

    try {
        const startVal = content.start.dateTime || content.start.date;
        if (startVal) {
            const d = new Date(startVal);
            dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            if (content.start.dateTime) {
                timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            }
        }
    } catch (e) {
        console.error("Error parsing date for deletion card", e);
    }

    const html = `
        <div class="event-preview-card delete-confirmation" style="background: #2d1f1f; border: 1px solid #5c2b2b; border-radius: 12px; padding: 16px; margin-top: 8px; color: #fff; font-family: sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="background: #5c2b2b; color: #ff9999; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Delete Event</span>
            </div>
            
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(content.summary)}</h3>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #ccc; font-size: 14px;">
                <span>📅</span>
                <span>${dateStr} ${timeStr ? '• ' + timeStr : ''}</span>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn-delete-confirm" style="flex: 1; background: #d93025; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Delete</button>
                <button class="btn-cancel" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const deleteBtn = container.querySelector('.btn-delete-confirm');
    const cancelBtn = container.querySelector('.btn-cancel');

    if (deleteBtn) {
        deleteBtn.onclick = function () {
            deleteBtn.textContent = "Deleting...";
            deleteBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;

            const submissionData = {
                action: 'delete',
                event_id: content.event_id,
                calendar_id: 'primary'
            };

            submitConfirmation(submissionData, convoId, container, messageId);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = function () {
            cancelBtn.textContent = "Cancelling...";
            cancelBtn.disabled = true;
            if (deleteBtn) deleteBtn.disabled = true;

            const submissionData = {
                action: 'cancel',
                event_id: content.event_id,
                summary: content.summary
            };
            submitConfirmation(submissionData, convoId, container, messageId);
        };
    }
}

function renderEventUpdateConfirmation(container, content, convoId, messageId) {
    container.classList.remove("bubble");

    // Parse dates for original and updated events
    function formatDateTime(dateObj) {
        if (!dateObj) return { date: "Unknown", time: "" };

        try {
            const dateVal = dateObj.dateTime || dateObj.date;
            if (!dateVal) return { date: "Unknown", time: "" };

            const d = new Date(dateVal);
            const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = dateObj.dateTime ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : "";

            return { date: dateStr, time: timeStr };
        } catch (e) {
            console.error("Error parsing date", e);
            return { date: "Unknown", time: "" };
        }
    }

    const original = content.original || {};
    const updated = content.updated || {};

    const originalFormatted = formatDateTime(original.start);
    const updatedFormatted = formatDateTime(updated.start);

    // Check what changed
    const titleChanged = original.summary !== updated.summary;
    const dateTimeChanged = JSON.stringify(original.start) !== JSON.stringify(updated.start);

    const hasConflict = content.has_conflict || false;
    const conflicts = content.conflicts || [];

    const html = `
        <div class="event-preview-card update-confirmation" style="background: #1e1e1e; border: 1px solid #4a7c59; border-radius: 12px; padding: 16px; margin-top: 8px; color: #fff; font-family: sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="background: #2d4a3e; color: #81c995; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Update Event</span>
            </div>
            
            ${hasConflict ? `
                <div style="background: #5c2b2b; border: 1px solid #8b3a3a; border-radius: 8px; padding: 10px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">⚠️</span>
                    <div style="font-size: 13px; color: #ff9999;">
                        <div style="font-weight: 600; margin-bottom: 4px;">Scheduling Conflict</div>
                        <div style="color: #ffb3b3;">Conflicts with: ${conflicts.map(function (c) { return escapeHtml(c.summary); }).join(', ')}</div>
                    </div>
                </div>
            ` : ''}
            
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; margin-bottom: 16px;">
                <!-- Original -->
                <div style="background: #2a2a2a; border-radius: 8px; padding: 12px;">
                    <div style="font-size: 11px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Original</div>
                    <h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; ${titleChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(original.summary || 'Untitled')}</h4>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #ccc; font-size: 13px; ${dateTimeChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                        <span>📅</span>
                        <span>${originalFormatted.date}</span>
                    </div>
                    ${originalFormatted.time ? `
                        <div style="display: flex; align-items: center; gap: 6px; color: #ccc; font-size: 13px; ${dateTimeChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                            <span>⏰</span>
                            <span>${originalFormatted.time}</span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Arrow -->
                <div style="display: flex; align-items: center; justify-content: center;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#81c995" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </div>
                
                <!-- Updated -->
                <div style="background: #2d4a3e; border: 1px solid #4a7c59; border-radius: 8px; padding: 12px;">
                    <div style="font-size: 11px; color: #81c995; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Updated</div>
                    <h4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #81c995;">${escapeHtml(updated.summary || 'Untitled')}</h4>
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #b3e6c1; font-size: 13px;">
                        <span>📅</span>
                        <span>${updatedFormatted.date}</span>
                    </div>
                    ${updatedFormatted.time ? `
                        <div style="display: flex; align-items: center; gap: 6px; color: #b3e6c1; font-size: 13px;">
                            <span>⏰</span>
                            <span>${updatedFormatted.time}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn-update-confirm" style="flex: 1; background: #4a7c59; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Update</button>
                <button class="btn-cancel" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const updateBtn = container.querySelector('.btn-update-confirm');
    const cancelBtn = container.querySelector('.btn-cancel');

    if (updateBtn) {
        updateBtn.onclick = function () {
            updateBtn.textContent = "Updating...";
            updateBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;

            const submissionData = {
                action: 'update',
                event_id: content.event_id,
                calendar_id: content.calendar_id || 'primary',
                original: content.original,
                updated: content.updated
            };

            submitConfirmation(submissionData, convoId, container, messageId);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = function () {
            cancelBtn.textContent = "Cancelling...";
            cancelBtn.disabled = true;
            if (updateBtn) updateBtn.disabled = true;

            const submissionData = {
                action: 'cancel',
                event_id: content.event_id,
                summary: original.summary
            };
            submitConfirmation(submissionData, convoId, container, messageId);
        };
    }
}

// --- Main DOMContentLoaded listener ---
document.addEventListener("DOMContentLoaded", () => {
    const chatMessagesContainer = document.getElementById("chat-box");
    const form = document.getElementById("chat-form");
    const recentsList = document.getElementById('recents-list');
    const initialMessagesOnLoad = chatMessagesContainer ? chatMessagesContainer.querySelectorAll('.message') : [];

    // Wire up the send button to submit the form
    const sendButton = document.getElementById('send-button');
    if (sendButton && form) {
        sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }


    // --- Helper Functions for Rendering Structured Content ---
    function renderEventSuccess(container, responseData) {
        container.classList.remove("bubble");
        const responseContent = responseData.content || responseData;
        const eventTitle = responseContent?.event_title || responseData?.event_title || 'Your Event';
        const agentExplanationText = responseContent?.agent_explanation || responseData.response || '';

        const eventSuccessHtml = `
             <div class="create-event-box">
                <div class="create-event-icon">
                   ${googleCalendarIconUrl ? `<img src="${googleCalendarIconUrl}" alt="Google Calendar" width="24" height="24">` : ''}
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z" fill="#34A853"/>
                   </svg>
                </div>
                <div class="create-event-details">
                   <div class="create-event-title">${escapeHtml(eventTitle)}</div>
                   <div class="create-event-subtitle success">Event created successfully</div>
                 </div>
             </div>
          `;
        container.innerHTML = eventSuccessHtml;
        if (agentExplanationText) {
            const explainBubble = document.createElement('div');
            explainBubble.classList.add('bubble');
            explainBubble.style.marginTop = '8px';
            container.appendChild(explainBubble);
            typeText(explainBubble, agentExplanationText, 3, scrollChatToBottom);
        }
    }

    function renderEventDeletionConfirmation(container, content, convoId, messageId) {
        container.classList.remove("bubble");

        // Handle start date/time safely
        let dateStr = "Unknown Date";
        let timeStr = "";

        try {
            const startVal = content.start.dateTime || content.start.date;
            if (startVal) {
                const d = new Date(startVal);
                dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                if (content.start.dateTime) {
                    timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                }
            }
        } catch (e) {
            console.error("Error parsing date for deletion card", e);
        }

        const html = `
            <div class="event-preview-card delete-confirmation" style="background: #2d1f1f; border: 1px solid #5c2b2b; border-radius: 12px; padding: 16px; margin-top: 8px; color: #fff; font-family: sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="background: #5c2b2b; color: #ff9999; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Delete Event</span>
                </div>
                
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(content.summary)}</h3>
                
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #ccc; font-size: 14px;">
                    <span>📅</span>
                    <span>${dateStr} ${timeStr ? '• ' + timeStr : ''}</span>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn-delete-confirm" style="flex: 1; background: #d93025; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Delete</button>
                    <button class="btn-cancel" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        const deleteBtn = container.querySelector('.btn-delete-confirm');
        const cancelBtn = container.querySelector('.btn-cancel');

        if (deleteBtn) {
            deleteBtn.onclick = () => {
                deleteBtn.textContent = "Deleting...";
                deleteBtn.disabled = true;
                if (cancelBtn) cancelBtn.disabled = true;

                const submissionData = {
                    action: 'delete',
                    event_id: content.event_id,
                    calendar_id: 'primary'
                };

                submitConfirmation(submissionData, convoId, container, messageId);
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                cancelBtn.textContent = "Cancelling...";
                cancelBtn.disabled = true;
                if (deleteBtn) deleteBtn.disabled = true;

                const submissionData = {
                    action: 'cancel',
                    event_id: content.event_id, // Pass event ID just in case, though not strictly needed for cancel
                    summary: content.summary
                };
                submitConfirmation(submissionData, convoId, container, messageId);
            };
        }
    }

    function renderEventUpdateConfirmation(container, content, convoId, messageId) {
        container.classList.remove("bubble");

        // Parse dates for original and updated events
        function formatDateTime(dateObj) {
            if (!dateObj) return { date: "Unknown", time: "" };

            try {
                const dateVal = dateObj.dateTime || dateObj.date;
                if (!dateVal) return { date: "Unknown", time: "" };

                const d = new Date(dateVal);
                const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = dateObj.dateTime ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : "";

                return { date: dateStr, time: timeStr };
            } catch (e) {
                console.error("Error parsing date", e);
                return { date: "Unknown", time: "" };
            }
        }

        const original = content.original || {};
        const updated = content.updated || {};

        const originalFormatted = formatDateTime(original.start);
        const updatedFormatted = formatDateTime(updated.start);

        // Check what changed
        const titleChanged = original.summary !== updated.summary;
        const dateTimeChanged = JSON.stringify(original.start) !== JSON.stringify(updated.start);

        const hasConflict = content.has_conflict || false;
        const conflicts = content.conflicts || [];

        const html = `
            \u003cdiv class="event-preview-card update-confirmation" style="background: #1e1e1e; border: 1px solid #4a7c59; border-radius: 12px; padding: 16px; margin-top: 8px; color: #fff; font-family: sans-serif;"\u003e
                \u003cdiv style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"\u003e
                    \u003cspan style="background: #2d4a3e; color: #81c995; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;"\u003eUpdate Event\u003c/span\u003e
                \u003c/div\u003e
                
                ${hasConflict ? `
                    \u003cdiv style="background: #5c2b2b; border: 1px solid #8b3a3a; border-radius: 8px; padding: 10px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"\u003e
                        \u003cspan style="font-size: 18px;"\u003e⚠️\u003c/span\u003e
                        \u003cdiv style="font-size: 13px; color: #ff9999;"\u003e
                            \u003cdiv style="font-weight: 600; margin-bottom: 4px;"\u003eScheduling Conflict\u003c/div\u003e
                            \u003cdiv style="color: #ffb3b3;"\u003eConflicts with: ${conflicts.map(function (c) { return escapeHtml(c.summary); }).join(', ')}\u003c/div\u003e
                        \u003c/div\u003e
                    \u003c/div\u003e
                ` : ''}
                
                \u003cdiv style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; margin-bottom: 16px;"\u003e
                    \u003c!-- Original --\u003e
                    \u003cdiv style="background: #2a2a2a; border-radius: 8px; padding: 12px;"\u003e
                        \u003cdiv style="font-size: 11px; color: #888; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;"\u003eOriginal\u003c/div\u003e
                        \u003ch4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; ${titleChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}"\u003e${escapeHtml(original.summary || 'Untitled')}\u003c/h4\u003e
                        \u003cdiv style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #ccc; font-size: 13px; ${dateTimeChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}"\u003e
                            \u003cspan\u003e📅\u003c/span\u003e
                            \u003cspan\u003e${originalFormatted.date}\u003c/span\u003e
                        \u003c/div\u003e
                        ${originalFormatted.time ? `
                            \u003cdiv style="display: flex; align-items: center; gap: 6px; color: #ccc; font-size: 13px; ${dateTimeChanged ? 'text-decoration: line-through; opacity: 0.6;' : ''}"\u003e
                                \u003cspan\u003e⏰\u003c/span\u003e
                                \u003cspan\u003e${originalFormatted.time}\u003c/span\u003e
                            \u003c/div\u003e
                        ` : ''}
                    \u003c/div\u003e
                    
                    \u003c!-- Arrow --\u003e
                    \u003cdiv style="display: flex; align-items: center; justify-content: center;"\u003e
                        \u003csvg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#81c995" stroke-width="2"\u003e
                            \u003cpath d="M5 12h14M12 5l7 7-7 7"/\u003e
                        \u003c/svg\u003e
                    \u003c/div\u003e
                    
                    \u003c!-- Updated --\u003e
                    \u003cdiv style="background: #2d4a3e; border: 1px solid #4a7c59; border-radius: 8px; padding: 12px;"\u003e
                        \u003cdiv style="font-size: 11px; color: #81c995; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;"\u003eUpdated\u003c/div\u003e
                        \u003ch4 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #81c995;"\u003e${escapeHtml(updated.summary || 'Untitled')}\u003c/h4\u003e
                        \u003cdiv style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #b3e6c1; font-size: 13px;"\u003e
                            \u003cspan\u003e📅\u003c/span\u003e
                            \u003cspan\u003e${updatedFormatted.date}\u003c/span\u003e
                        \u003c/div\u003e
                        ${updatedFormatted.time ? `
                            \u003cdiv style="display: flex; align-items: center; gap: 6px; color: #b3e6c1; font-size: 13px;"\u003e
                                \u003cspan\u003e⏰\u003c/span\u003e
                                \u003cspan\u003e${updatedFormatted.time}\u003c/span\u003e
                            \u003c/div\u003e
                        ` : ''}
                    \u003c/div\u003e
                \u003c/div\u003e
                
                \u003cdiv style="display: flex; gap: 10px;"\u003e
                    \u003cbutton class="btn-update-confirm" style="flex: 1; background: #4a7c59; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;"\u003eUpdate\u003c/button\u003e
                    \u003cbutton class="btn-cancel" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px; cursor: pointer;"\u003eCancel\u003c/button\u003e
                \u003c/div\u003e
            \u003c/div\u003e
        `;

        container.innerHTML = html;

        const updateBtn = container.querySelector('.btn-update-confirm');
        const cancelBtn = container.querySelector('.btn-cancel');

        if (updateBtn) {
            updateBtn.onclick = function () {
                updateBtn.textContent = "Updating...";
                updateBtn.disabled = true;
                if (cancelBtn) cancelBtn.disabled = true;

                const submissionData = {
                    action: 'update',
                    event_id: content.event_id,
                    calendar_id: content.calendar_id || 'primary',
                    original: content.original,
                    updated: content.updated
                };

                submitConfirmation(submissionData, convoId, container, messageId);
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = function () {
                cancelBtn.textContent = "Cancelling...";
                cancelBtn.disabled = true;
                if (updateBtn) updateBtn.disabled = true;

                const submissionData = {
                    action: 'cancel',
                    event_id: content.event_id,
                    summary: original.summary
                };
                submitConfirmation(submissionData, convoId, container, messageId);
            };
        }
    }

    function renderEventPreview(container, content, convoId, messageId) {
        container.classList.remove("bubble");
        let isEditMode = false;

        // Store original data
        let currentData = {
            summary: content.summary,
            start: new Date(content.start.dateTime),
            end: new Date(content.end.dateTime),
            startISO: content.start,
            endISO: content.end,
            attendees: content.attendees || []
        };

        function render() {
            const dateStr = currentData.start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            const startTimeStr = currentData.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            const endTimeStr = currentData.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

            // Format for input fields (12-hour format with AM/PM)
            const dateInputValue = currentData.start.toISOString().split('T')[0];
            const startTimeInputValue = currentData.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const endTimeInputValue = currentData.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            const html = `
        <div class="event-preview-card" style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; margin-top: 8px; color: #fff; font-family: sans-serif;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="background: #333; color: #aaa; padding: 2px 8px; border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Draft</span>
            </div>
            
            ${isEditMode ? `
                <input type="text" class="edit-summary" value="${escapeHtml(currentData.summary)}" 
                    style="width: 100%; background: #2a2a2a; border: 1px solid #555; border-radius: 6px; padding: 8px; margin-bottom: 8px; color: #fff; font-size: 16px; font-weight: 600; font-family: sans-serif;">
            ` : `
                <h3 class="display-summary" style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(currentData.summary)}</h3>
            `}
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: #ccc; font-size: 14px;">
                <span>📅</span>
                ${isEditMode ? `
                    <input type="date" class="edit-date" value="${dateInputValue}"
                        style="background: #2a2a2a; border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 14px;">
                ` : `
                    <span class="display-date">${dateStr}</span>
                `}
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #ccc; font-size: 14px;">
                <span>⏰</span>
                ${isEditMode ? `
                    <input type="text" class="edit-start-time" value="${startTimeInputValue}" placeholder="9:00 AM"
                        style="background: #2a2a2a; border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 14px; width: 110px;">
                    <span>-</span>
                    <input type="text" class="edit-end-time" value="${endTimeInputValue}" placeholder="5:00 PM"
                        style="background: #2a2a2a; border: 1px solid #555; border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 14px; width: 110px;">
                ` : `
                    <span class="display-time">${startTimeStr} - ${endTimeStr}</span>
                `}
            </div>

            ${content.recurrence ? `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #ccc; font-size: 14px;">
                <span>🔁</span>
                <span class="display-recurrence" style="font-size: 13px; color: #aaa;">${escapeHtml(content.recurrence.replace('RRULE:', '').replace(/;/g, ', '))}</span>
            </div>
            ` : ''}
            
            <div style="margin-bottom: 16px; font-size: 13px; display: flex; align-items: flex-start; gap: 6px; flex-direction: column;">
                ${content.has_conflict && content.conflicts && content.conflicts.length > 0
                    ? `<div style="display: flex; align-items: center; gap: 6px; color: #ff6b6b;">
                        <span>⚠️ Conflict:</span>
                        <span style="font-weight: 500;">${content.conflicts.map(c => c.summary).join(', ')}</span>
                      </div>`
                    : '<span style="color: #4ec9b0;">✅ You are free</span>'}
                ${content.alternatives && content.alternatives.length > 0
                    ? `<div style="font-size: 12px; margin-top: 8px;">
                        <div style="color: #888; margin-bottom: 6px;">Suggested times:</div>
                        <div class="alternatives-container" style="display: flex; gap: 6px; flex-wrap: wrap;">
                            ${content.alternatives.slice(0, 3).map((alt, index) => {
                        const time = new Date(alt.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        return `<button class="alt-time-btn" data-alt-index="${index}" style="background: #333; color: white; border: 1px solid #555; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">${time}</button>`;
                    }).join('')}
                        </div>
                      </div>`
                    : ''}
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn-confirm" style="flex: 1; background: #4285f4; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Confirm</button>
                <button class="btn-edit" style="flex: 1; background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px; cursor: pointer;">${isEditMode ? 'Cancel' : 'Edit'}</button>
            </div>
        </div>
        `;

            const card = container.querySelector('.event-preview-card');
            if (card) {
                card.outerHTML = html;
            } else {
                container.innerHTML = html;
            }

            attachEventHandlers();
        }

        function attachEventHandlers() {
            const confirmBtn = container.querySelector('.btn-confirm');
            const editBtn = container.querySelector('.btn-edit');

            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    // Gather current values if in edit mode
                    if (isEditMode) {
                        const summaryInput = container.querySelector('.edit-summary');
                        const dateInput = container.querySelector('.edit-date');
                        const startTimeInput = container.querySelector('.edit-start-time');
                        const endTimeInput = container.querySelector('.edit-end-time');

                        if (summaryInput && dateInput && startTimeInput && endTimeInput) {
                            // Update currentData with edited values
                            currentData.summary = summaryInput.value;

                            const dateValue = dateInput.value;
                            const startTimeStr = startTimeInput.value;
                            const endTimeStr = endTimeInput.value;

                            // Parse 12-hour time format (e.g., "9:00 AM")
                            function parseTime12Hour(timeStr) {
                                const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                                if (!match) return null;
                                let hours = parseInt(match[1]);
                                const minutes = match[2];
                                const period = match[3].toUpperCase();
                                if (period === 'PM' && hours !== 12) hours += 12;
                                if (period === 'AM' && hours === 12) hours = 0;
                                return `${hours.toString().padStart(2, '0')}:${minutes}`;
                            }

                            const startTime24 = parseTime12Hour(startTimeStr);
                            const endTime24 = parseTime12Hour(endTimeStr);

                            if (startTime24 && endTime24) {
                                // Construct new Date objects
                                currentData.start = new Date(`${dateValue}T${startTime24}`);
                                currentData.end = new Date(`${dateValue}T${endTime24}`);

                                // Update ISO format for submission, preserving timezone if available
                                const tz = content.start.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                                currentData.startISO = {
                                    dateTime: currentData.start.toISOString(),
                                    timeZone: tz
                                };
                                currentData.endISO = {
                                    dateTime: currentData.end.toISOString(),
                                    timeZone: tz
                                };
                            }
                        }
                    }

                    confirmBtn.textContent = "Confirming...";
                    confirmBtn.disabled = true;

                    // Submit with current data
                    const submissionData = {
                        summary: currentData.summary,
                        start: currentData.startISO,
                        end: currentData.endISO,
                        attendees: currentData.attendees,
                        recurrence: content.recurrence
                    };

                    submitConfirmation(submissionData, convoId, container, messageId);
                };
            }

            if (editBtn) {
                editBtn.onclick = () => {
                    if (isEditMode) {
                        // Cancel edit - revert to original data
                        currentData = {
                            summary: content.summary,
                            start: new Date(content.start.dateTime),
                            end: new Date(content.end.dateTime),
                            startISO: content.start,
                            endISO: content.end,
                            attendees: content.attendees || []
                        };
                    }
                    isEditMode = !isEditMode;
                    render();
                };
            }

            // Add handlers for alternative time buttons
            const altButtons = container.querySelectorAll('.alt-time-btn');
            altButtons.forEach(btn => {
                btn.onclick = () => {
                    const altIndex = parseInt(btn.dataset.altIndex);
                    const alternative = content.alternatives[altIndex];

                    if (alternative) {
                        // Update currentData with the alternative time
                        currentData.startISO = { dateTime: alternative.start };
                        currentData.endISO = { dateTime: alternative.end };

                        // Parse the ISO strings to update start and end
                        currentData.start = new Date(alternative.start);
                        currentData.end = new Date(alternative.end);

                        // Update content to reflect the new time
                        content.start = { dateTime: alternative.start };
                        content.end = { dateTime: alternative.end };

                        // Clear conflicts since we're using a free time
                        content.has_conflict = false;
                        content.conflicts = [];
                        content.alternatives = [];

                        // Re-render to show updated time
                        render();

                        // Show a brief success message
                        showStatus("Updated to suggested time", "success");
                    }
                };
            });
        }

        // Initial render
        render();

        // Add agent message bubble below
        if (content.agent_message) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'bubble';
            msgDiv.style.marginTop = '8px';
            msgDiv.textContent = content.agent_message;
            container.appendChild(msgDiv);
        }
    };

    function submitConfirmation(eventData, convoId, container, messageId) {
        const form = document.getElementById("chat-form");
        const postUrl = form.action;
        const csrfToken = form.querySelector("[name=csrfmiddlewaretoken]").value;

        fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken,
            },
            body: JSON.stringify({
                confirmation_data: eventData,
                convo_id: convoId,
                client_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
                message_id: messageId
            }),
        })
            .then(response => response.json())
            .then(data => {
                // Get the parent message div and message-content
                const messageDiv = container.closest('.message');
                const messageContent = container.closest('.message-content');

                if (data.type === 'event_success') {
                    // Clear preview and render success in the same container
                    container.innerHTML = '';
                    renderEventSuccess(container, data);
                } else if (data.type === 'event_deleted') {
                    // Clear preview and render deletion success
                    container.innerHTML = '';
                    container.innerHTML = `
                        <div style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; color: #fff; display: flex; align-items: center; gap: 12px;">
                            <div style="background: #333; border-radius: 50%; padding: 8px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 2v2" />
                                </svg>
                            </div>
                            <div style="font-weight: 600;">Event Deleted</div>
                        </div>
                    `;

                    // Remove old text bubble and add new one if message exists
                    if (messageContent) {
                        const existingBubbles = messageContent.querySelectorAll('.bubble');
                        existingBubbles.forEach(bubble => bubble.remove());

                        // Add new text bubble if response exists
                        if (data.response) {
                            const textBubble = document.createElement('div');
                            textBubble.className = 'bubble';
                            textBubble.style.marginTop = '8px';
                            textBubble.innerHTML = marked.parse(data.response);
                            messageContent.appendChild(textBubble);
                        }
                    }
                } else if (data.type === 'event_updated') {
                    // Clear preview and render update success
                    container.innerHTML = '';
                    container.innerHTML = `
                        <div style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; color: #fff; display: flex; align-items: center; gap: 12px;">
                            <div style="background: #333; border-radius: 50%; padding: 8px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            </div>
                            <div style="font-weight: 600;">Event Updated</div>
                        </div>
                    `;

                    // Remove old text bubble and add new one if message exists
                    if (messageContent) {
                        // Remove any existing text bubbles within message-content
                        const existingBubbles = messageContent.querySelectorAll('.bubble');
                        existingBubbles.forEach(bubble => bubble.remove());

                        // Add new text bubble if response exists
                        if (data.response) {
                            const textBubble = document.createElement('div');
                            textBubble.className = 'bubble';
                            textBubble.style.marginTop = '8px';
                            textBubble.innerHTML = marked.parse(data.response);
                            messageContent.appendChild(textBubble);
                        }
                    }
                } else if (data.type === 'text') {
                    // Handle text response (e.g. cancellation confirmation). Replace the card with the text response
                    container.innerHTML = '';
                    container.classList.add('bubble');
                    container.innerHTML = marked.parse(data.response);

                    if (messageContent) {
                        const existingBubbles = messageContent.querySelectorAll('.bubble');
                        existingBubbles.forEach(bubble => {
                            if (bubble !== container) bubble.remove();
                        });
                    }
                } else {
                    // Handle error
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'bubble';
                    errorDiv.style.color = 'red';
                    errorDiv.textContent = data.response || "Something went wrong.";
                    container.appendChild(errorDiv);
                }
            })
            .catch(err => console.error(err));
    }



    // --- Initialize Persisted Event Cards ---
    const previewContainers = document.querySelectorAll('.event-preview-card-container');
    if (previewContainers.length > 0) {
        previewContainers.forEach(container => {
            try {
                const eventContent = JSON.parse(container.dataset.eventContent);
                const convoId = container.dataset.convoId;
                const messageId = container.dataset.messageId;
                if (eventContent && convoId) {
                    renderEventPreview(container, eventContent, convoId, messageId);
                }
            } catch (e) {
                console.error('Failed to parse event preview content:', e);
            }
        });
    }

    const deletionContainers = document.querySelectorAll('.event-deletion-card-container');
    if (deletionContainers.length > 0) {
        deletionContainers.forEach(container => {
            try {
                const eventContent = JSON.parse(container.dataset.eventContent);
                const convoId = container.dataset.convoId;
                const messageId = container.dataset.messageId;
                if (eventContent && convoId) {
                    renderEventDeletionConfirmation(container, eventContent, convoId, messageId);
                }
            } catch (e) {
                console.error('Failed to parse event deletion content:', e);
            }
        });
    }

    // --- Initial Page Load Rendering & Welcome Message Handling ---
    if (initialMessagesOnLoad.length > 0) {
        let welcomeMessageFoundAndAnimated = false;

        initialMessagesOnLoad.forEach(messageDiv => {
            const sender = messageDiv.dataset.sender;
            const bubble = messageDiv.querySelector('.bubble'); // Get the bubble inside the message

            if (bubble) { // Check if bubble exists
                const rawText = bubble.dataset.raw; // Get raw text from bubble, not messageDiv
                // If it's the welcome message rendered by Django, animate it
                if (bubble.dataset.welcomeMessage === 'true') {
                    welcomeMessageFoundAndAnimated = true;
                    typeText(bubble, rawText || bubble.innerHTML, 3, scrollChatToBottom); // Use data-raw or innerHTML as fallback
                } else if (sender === 'agent' && rawText !== undefined) {
                    bubble.innerHTML = marked.parse(rawText);
                } else if (sender === 'user') {
                    bubble.textContent = rawText || bubble.textContent; // Use raw or existing text
                }
            } else {
                console.warn("Message div found without a bubble element during initial render:", messageDiv);
            }
        });

        if (!welcomeMessageFoundAndAnimated) {
            scrollChatToBottom();
        }

    } else {
        scrollChatToBottom();
    }


    // --- Handle form submission ---
    if (form) {
        form.addEventListener("submit", async e => {
            e.preventDefault();

            const textarea = document.getElementById("chat-input");
            const userMessage = textarea ? textarea.value.trim() : '';

            if (!userMessage) {
                if (textarea) {
                    textarea.value = '';
                    textarea.style.height = 'auto';
                }
                return;
            }

            // Get the current conversation ID from the browser URL
            let conversationId = null;
            const pathParts = window.location.pathname.split('/').filter(part => part); // Split and remove empty parts
            // Assuming URL structure is /agent/assistant/UUID/ or /agent/assistant/new/
            // Find the UUID part in the URL
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            for (let i = 0; i < pathParts.length; i++) {
                if (uuidRegex.test(pathParts[i])) {
                    conversationId = pathParts[i];
                    break;
                }
            }
            const postUrl = form.action;

            appendMessage("user", { type: 'text', response: userMessage }, false, conversationId, false); // isTyping=false for user message
            if (textarea) {
                textarea.value = '';
                textarea.style.height = 'auto';
            }

            const intentElement = showIntentConfirmation();

            showStatus("Processing request...", "loading");


            try {
                const csrfTokenInput = form.querySelector("[name=csrfmiddlewaretoken]");
                const csrfToken = csrfTokenInput ? csrfTokenInput.value : '';

                // POST data as JSON (preferred over form-urlencoded for complex data)
                const response = await fetch(postUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": csrfToken,
                    },
                    // Send message text and conversation ID in the JSON body
                    body: JSON.stringify({
                        message: userMessage,
                        convo_id: conversationId,
                        client_tz: (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined)
                    }),
                });

                if (!response.ok) {
                    console.error("Fetch failed with status:", response.status, response.statusText);
                    // Reuse the intent confirmation structure for error display
                    if (intentElement && intentElement.mainContentDiv) {
                        intentElement.mainContentDiv.className = 'bubble';
                        intentElement.mainContentDiv.innerHTML = `Error communicating with the server (${response.status}). Please try again.`;
                    } else {
                        appendMessage("agent", { type: 'text', response: `Error communicating with the server (${response.status}). Please try again.` }, false, conversationId, false);
                    }
                    return;
                }

                const data = await response.json();

                // Update intent confirmation with the received intent
                if (intentElement && data.intent) {
                    updateIntentConfirmation(intentElement, data.intent);
                }

                setTimeout(() => {
                    const agentResponse = data.agent_response_data || {
                        type: data.type,
                        response: data.response,
                        content: data.content || {}
                    };
                    if (agentResponse) {
                        const responseType = agentResponse.type || 'text';
                        const responseContent = responseType === 'text' ? agentResponse.response : agentResponse.content;

                        // Show calendar-specific status for event creation
                        if (responseType === 'event_confirmation_request' || data.intent === 'calendar') {
                            showStatus("Checking calendar for conflicts...", "loading");
                        }

                        // Debug logging (remove when issues are resolved)
                        if (responseType === 'calendar_action_request' && responseContent?.action === 'unknown') {
                            // Log removed("⚠️ Got 'unknown' action - this usually means AI returned multiple JSON objects");
                            // Log removed("Response details:", responseContent?.details);
                        }

                        // Determine if it's the first message exchange *based on the backend response*
                        const isFirstActualMessageFromBackend = data.is_first_actual_message === true;

                        // Reuse the existing intent confirmation message structure for typing indicator
                        if (intentElement && intentElement.mainContentDiv) {
                            intentElement.mainContentDiv.style.display = '';
                            intentElement.mainContentDiv.style.opacity = '1';
                            intentElement.mainContentDiv.innerHTML = `
                                <div class="bubble">
                                    <div class="typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            `;
                            intentElement.messageDiv.classList.add("typing-message");
                            scrollChatToBottom();

                            setTimeout(() => {
                                // Remove typing indicator and show actual response
                                intentElement.messageDiv.classList.remove("typing-message");
                                intentElement.messageDiv.dataset.sender = "agent";
                                if (data.convo_id) {
                                    intentElement.messageDiv.dataset.convoId = data.convo_id;
                                }
                                if (isFirstActualMessageFromBackend) {
                                    intentElement.messageDiv.dataset.isFirstActualMessage = 'true';
                                }

                                // Handle different response types in the reused container
                                if (responseType === 'text') {
                                    const textContent = responseContent || '';
                                    intentElement.messageDiv.dataset.raw = textContent;

                                    // Clear existing content and change class from intent-confirmation-box to bubble
                                    intentElement.mainContentDiv.innerHTML = '';
                                    intentElement.mainContentDiv.className = 'bubble';

                                    // Use typeText for typing animation directly on the main content div
                                    typeText(intentElement.mainContentDiv, textContent, 3, () => {
                                        scrollChatToBottom();
                                        clearStatus();
                                    });

                                } else {
                                    // Handle other response types (calendar actions, etc.) directly
                                    intentElement.mainContentDiv.innerHTML = '';
                                    intentElement.mainContentDiv.className = '';

                                    // Handle different response types directly without creating new messages
                                    if (responseType === 'event_success') {
                                        renderEventSuccess(intentElement.mainContentDiv, agentResponse);

                                    } else if (responseType === 'event_confirmation_request') {
                                        renderEventPreview(intentElement.mainContentDiv, responseContent, data.convo_id, responseContent.message_id);

                                    } else if (responseType === 'event_deletion_confirmation') {
                                        renderEventDeletionConfirmation(intentElement.mainContentDiv, responseContent, data.convo_id, responseContent.message_id);

                                        // Add text bubble alongside the card if response text exists
                                        if (agentResponse.response) {
                                            let messageContent = intentElement.messageDiv.querySelector('.message-content');
                                            if (!messageContent) {
                                                messageContent = document.createElement('div');
                                                messageContent.classList.add('message-content');
                                                intentElement.messageDiv.appendChild(messageContent);
                                                messageContent.appendChild(intentElement.mainContentDiv);
                                            }

                                            const textBubble = document.createElement('div');
                                            textBubble.className = 'bubble';
                                            textBubble.style.marginTop = '8px';
                                            textBubble.innerHTML = marked.parse(agentResponse.response);
                                            messageContent.appendChild(textBubble);
                                        }

                                    } else if (responseType === 'event_update_confirmation') {
                                        renderEventUpdateConfirmation(intentElement.mainContentDiv, responseContent, data.convo_id, responseContent.message_id);

                                        // Add text bubble alongside the card if response text exists
                                        if (agentResponse.response) {
                                            let messageContent = intentElement.messageDiv.querySelector('.message-content');
                                            if (!messageContent) {
                                                messageContent = document.createElement('div');
                                                messageContent.classList.add('message-content');
                                                intentElement.messageDiv.appendChild(messageContent);
                                                messageContent.appendChild(intentElement.mainContentDiv);
                                            }

                                            const textBubble = document.createElement('div');
                                            textBubble.className = 'bubble';
                                            textBubble.style.marginTop = '8px';
                                            textBubble.innerHTML = marked.parse(agentResponse.response);
                                            messageContent.appendChild(textBubble);
                                        }

                                    } else if (responseType === 'needs_connection') {
                                        // Keep the bubble styling so it aligns with the agent avatar
                                        intentElement.mainContentDiv.className = 'bubble';
                                        const connectedEmail = responseContent?.email || '';
                                        const agentPrompt = responseContent?.message_for_user || 'Please connect your Google account.';
                                        const connectHref = responseContent?.content_url || responseContent?.connect_url || googleConnectUrl;

                                        const needsConnectionHtml = `
                                             <p class="connect-account-heading">${escapeHtml(agentPrompt)}</p>
                                             <div class="connect-buttons">
                                               <a href="${connectHref}" class="google-connect-btn">
                                                 <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M17.64 9.2045C17.64 8.56567 17.5844 7.95816 17.4769 7.37974H9V10.7197H13.9183C13.6711 12.0829 12.9344 13.2644 11.8344 14.0153V16.2715H14.7776C16.5322 14.6384 17.64 12.2644 17.64 9.2045Z" fill="#4285F4"/>
                                                    <path d="M9 18C11.43 18 13.46 17.19 14.96 15.94L11.83 14.01C11.09 14.5 10.1 14.81 9 14.81C6.81 14.81 4.96 13.45 4.36 11.54H1.33V13.8C2.84 16.85 5.62 18 9 18Z" fill="#34A853"/>
                                                    <path d="M4.36 11.54C4.08 10.85 3.93 10.08 3.93 9.29C3.93 8.5 4.08 7.73 4.36 7.04V4.78H1.33C0.48 6.47 0 7.88 0 9.29C0 10.7 0.48 12.11 1.33 13.8L4.36 11.54Z" fill="#FBBC05"/>
                                                    <path d="M9 3.87C10.14 3.87 11.15 4.26 11.96 5.05L15.01 2.01C13.46 0.76 11.43 0 9 0C5.62 0 2.84 1.15 1.33 4.19L4.36 6.46C4.96 4.55 6.81 3.19 9 3.19V3.87Z" fill="#EA4335"/>
                                                 </svg>
                                                 Connect ${escapeHtml(connectedEmail) || 'your Google account'}
                                               </a>
                                               <button class="skip-btn">Skip</button>
                                             </div>
                                           `;
                                        intentElement.mainContentDiv.innerHTML = needsConnectionHtml;

                                    } else if (responseType === 'connected_status') {
                                        const connectedEmail = responseContent?.email || 'Account';

                                        const connectedStatusHtml = `
                                             <div class="connected-account-status">
                                               <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                  <path d="M17.64 9.2045C17.64 8.56567 17.5844 7.95816 17.4769 7.37974H9V10.7197H13.9183C13.6711 12.0829 12.9344 13.2644 11.8344 14.0153V16.2715H14.7776C16.5322 14.6384 17.64 12.2644 17.64 9.2045Z" fill="#4285F4"/>
                                                  <path d="M9 18C11.43 18 13.46 17.19 14.96 15.94L11.83 14.01C11.09 14.5 10.1 14.81 9 14.81C6.81 14.81 4.96 13.45 4.36 11.54H1.33V13.8C2.84 16.85 5.62 18 9 18Z" fill="#34A853"/>
                                                  <path d="M4.36 11.54C4.08 10.85 3.93 10.08 3.93 9.29C3.93 8.5 4.08 7.73 4.36 7.04V4.78H1.33C0.48 6.47 0 7.88 0 9.29C0 10.7 0.48 12.11 1.33 13.8L4.36 11.54Z" fill="#FBBC05"/>
                                                  <path d="M9 3.87C10.14 3.87 11.15 4.26 11.96 5.05L15.01 2.01C13.46 0.76 11.43 0 9 0C5.62 0 2.84 1.15 1.33 4.19L4.36 6.46C4.96 4.55 6.81 3.19 9 3.19V3.87Z" fill="#EA4335"/>
                                               </svg>
                                               <span class="connected-text">${escapeHtml(connectedEmail)} connected</span>
                                               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                 <path d="M9 16.17L5.41 12.59L4 14L9 19L20 8L18.59 6.59L9 16.17Z" fill="#9AA0A6"/>
                                               </svg>
                                             </div>
                                           `;
                                        intentElement.mainContentDiv.innerHTML = connectedStatusHtml;
                                    }
                                }

                                scrollChatToBottom();
                            }, 800);
                        }

                        // --- START: Handle new conversation creation & URL update ---
                        if (isFirstActualMessageFromBackend && data.convo_id) {
                            const newConvoUrl = `/agent/assistant/${data.convo_id}/`;
                            window.history.pushState({}, data.convo_title || 'New Chat', newConvoUrl);

                            // 1.   Update datasets so the next send goes to this convo
                            form.dataset.initialConvoId = data.convo_id;
                            document.getElementById('chat-input').dataset.convoId = data.convo_id;

                            // 2.   Build / replace the Recents-list item
                            if (recentsList) {
                                const placeholder = recentsList.querySelector('li[data-placeholder="true"]');
                                if (placeholder) placeholder.remove();

                                let li = recentsList.querySelector(`li[data-convo-id="${data.convo_id}"]`);
                                if (li) {
                                    const link = li.querySelector('.recent-link');
                                    if (link) link.textContent = data.convo_title || 'New Chat';
                                } else {
                                    // Otherwise build a brand-new entry
                                    li = document.createElement('li');
                                    li.dataset.convoId = data.convo_id;
                                    li.dataset.deleteUrl = `/agent/assistant/delete_conversation/${data.convo_id}/`;
                                    li.className = 'active';

                                    const link = document.createElement('a');
                                    link.href = `/agent/assistant/${data.convo_id}/`;
                                    link.className = 'recent-link';
                                    link.textContent = data.convo_title || 'New Chat';

                                    const delBtn = document.createElement('button');
                                    delBtn.className = 'delete-recent-btn';
                                    delBtn.innerHTML =
                                        '<img src="/static/home_page/images/delete.png" alt="Delete">';
                                    li.appendChild(link);
                                    li.appendChild(delBtn);
                                }

                                // Mark active & move to top
                                recentsList.querySelectorAll('li').forEach(liEl => liEl.classList.remove('active'));
                                li.classList.add('active');
                                recentsList.prepend(li);
                            }

                            scrollChatToBottom();

                        } else {
                            const recentsList = document.getElementById('recents-list');
                            if (recentsList && data.convo_id) {
                                const currentConvoItem = recentsList.querySelector(`li[data-convo-id="${data.convo_id}"]`);
                                if (currentConvoItem) {
                                    recentsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                                    currentConvoItem.classList.add('active');
                                    recentsList.prepend(currentConvoItem);
                                }
                            }
                        }
                        // --- END ----------------------------------------------------

                    } else if (data.error) {
                        // Display error message if backend sends one. Reuse the intent confirmation structure for error display
                        if (intentElement && intentElement.mainContentDiv) {
                            intentElement.mainContentDiv.className = 'bubble';
                            intentElement.mainContentDiv.innerHTML = `Error: ${data.error}`;
                        } else {
                            appendMessage("agent", { type: 'text', response: `Error: ${data.error}` }, false, data.convo_id, data.is_first_actual_message);
                        }

                        // If it was the first message but backend returned an error, update title immediately with fallback
                        if (data.is_first_actual_message && data.convo_id && data.convo_title) {
                            updateRecentsTitle(data.convo_id, data.convo_title);
                        } else if (data.convo_id && data.convo_title) {
                            updateRecentsTitle(data.convo_id, data.convo_title);
                        }

                    } else {
                        if (data.is_first_actual_message && data.convo_id && data.convo_title) {
                            updateRecentsTitle(data.convo_id, data.convo_title);
                        } else if (data.convo_id && data.convo_title) {
                            updateRecentsTitle(data.convo_id, data.convo_title);
                        }
                    }
                }, 1200);


            } catch (error) {
                console.error("Error during fetch or processing response:", error);
                // Reuse the intent confirmation structure for error display
                if (intentElement && intentElement.mainContentDiv) {
                    intentElement.mainContentDiv.className = 'bubble';
                    intentElement.mainContentDiv.innerHTML = `Sorry, an unexpected error occurred: ${error.message}`;
                } else {
                    appendMessage("agent", { type: 'text', response: `Sorry, an unexpected error occurred: ${error.message}` }, false, conversationId, false);
                }

                // If it was the first message but there was a JS error, update title with fallback if possible
                const currentConvoIdFromUrl = new URL(window.location.href).pathname.split('/').filter(part => part).pop(); // Get last non-empty part of path
                // Check if it's a valid-looking UUID before using it
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                const errorConvoId = (currentConvoIdFromUrl && uuidRegex.test(currentConvoIdFromUrl)) ? currentConvoIdFromUrl : null;

                if (errorConvoId) { // Best-effort title update
                    updateRecentsTitle(errorConvoId, "Error occurred");
                }


            }
        });
    }

    /* ======  KEEP GREY BACKGROUND ON CURRENT CONVERSATION  ====== */
    if (recentsList) {
        const currPath = window.location.pathname;
        // On page-load: mark active based on current path
        const links = recentsList.querySelectorAll('a.recent-link');
        links.forEach(link => {
            if (link.getAttribute('href') === currPath) {
                recentsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
                const li = link.closest('li');
                if (li) li.classList.add('active');
            }
        });
        // On click: visual feedback immediately
        recentsList.addEventListener('click', (e) => {
            const link = e.target.closest('a.recent-link');
            if (!link || !recentsList.contains(link)) return;
            recentsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
            const li = link.closest('li');
            if (li) li.classList.add('active');
        });
    }

    /* --- Auto-resume after OAuth consent ( ?resume=true ) --- */
    (function () {
        const params = new URLSearchParams(window.location.search);
        const resumeVal = params.get('resume');
        if (resumeVal && resumeVal.startsWith('true')) {
            const chat = document.getElementById('chat-box');
            // Support both template-rendered and JS-rendered user bubbles
            const candidates = chat.querySelectorAll('.message.user-message .message-text, .message.user-message .bubble');
            const el = candidates.length ? candidates[candidates.length - 1] : null;
            const text = el ? el.textContent.trim() : '';
            if (text) {
                const textarea = document.getElementById('chat-input');
                const form = document.getElementById('chat-form');
                const originalAction = form.action;
                // Mark this submission so backend can optionally branch, then restore
                form.action = originalAction + (originalAction.includes('?') ? '&' : '?') + 'resume=true';
                textarea.value = text;
                textarea.dispatchEvent(new Event('input'));
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
                // Clean up URL to avoid loops
                const url = new URL(window.location.href);
                url.searchParams.delete('resume');
                window.history.replaceState({}, document.title, url.toString());
                form.action = originalAction;
            }
        }
    })();

});


// force DOM reflow/repaint
function forceReflow(element) {
    void element.offsetHeight;
}

// Function to send user message and handle AI response
function sendUserMessage(messageText, conversationId, inputElement) {
    if (!inputElement) {
        inputElement = document.getElementById('chat-input');
    }

    if (!conversationId && inputElement && inputElement.dataset && inputElement.dataset.convoId) {
        conversationId = inputElement.dataset.convoId;
    }

    if (!conversationId) {
        const chatForm = document.getElementById("chat-form");
        if (chatForm && chatForm.dataset && chatForm.dataset.initialConvoId) {
            conversationId = chatForm.dataset.initialConvoId;
        }
    }

    // Show the user message immediately
    const chatBox = $('#chat-box');
    const userMessageHtml = `
        <div class="message user-message">
            <div class="avatar user-avatar">
                ${userAvatar}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text">${escapeHtml(messageText).replace(/\n/g, '<br>')}</div>
                </div>
            </div>
        </div>`;
    const userMessageElement = $(userMessageHtml);
    chatBox.append(userMessageElement);

    // Use requestAnimationFrame to ensure the element is painted before proceeding
    requestAnimationFrame(() => {
        // Wait for another frame to allow styles to fully apply after the first paint
        requestAnimationFrame(() => {
            chatBox.scrollTop(chatBox[0].scrollHeight);

            // Show a temporary "..." or loading indicator for the agent
            const agentThinkingHtml = `
                <div id="agent-thinking" class="message agent-message">
                     <div class="avatar agent-avatar">
                        ${agentAvatar}
                    </div>
                    <div class="message-content">
                        <div class="message-bubble">
                            <div class="message-text"></div>
                        </div>
                    </div>
                </div>`;
            chatBox.append(agentThinkingHtml);
            chatBox.scrollTop(chatBox[0].scrollHeight);

            // Get CSRF token and send message via AJAX
            const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            $.ajax({
                url: '/agent/chat/process/',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    message: messageText,
                    convo_id: conversationId || null // Send null if no conversationId
                }),
                dataType: 'json',
                headers: {
                    'X-CSRFToken': csrftoken
                },
                success: function (response) {
                    // Remove the thinking indicator
                    $('#agent-thinking').remove();

                    // --- CORRECTED: Handle the response data (check top-level keys) ---
                    if (response.type === 'calendar_action_request') {
                        // Handle structured calendar action request
                        const agentResponse = response; // The response itself contains the data
                        displayAgentMessage(agentResponse.content.message_for_user || "Processing calendar action..."); // Display introductory message
                        handleCalendarActionRequest(agentResponse.content); // Show the action UI (ensure handleCalendarActionRequest is defined)

                    } else if (response.type === 'text') {
                        // Handle a standard text response
                        const agentResponse = response; // The response itself contains the data
                        displayAgentMessage(agentResponse.response); // Display the AI's text response (ensure displayAgentMessage is defined)

                    } else if (response.error) {
                        // Handle error sent by the backend
                        const agentResponse = response;
                        appendMessage("agent", { type: 'text', response: `Error: ${agentResponse.error}` }, false, response.convo_id, response.is_first_actual_message); // Use appendMessage for errors (ensure appendMessage is defined)

                    } else {
                        // Handle cases where backend returns an unexpected structure
                        console.warn("Backend response had no expected type ('text' or 'calendar_action_request') or error.", response);
                        $('#agent-thinking').remove();
                    }


                    // --- Handle New Conversation Creation & Recents Update (if it was the first message) ---
                    // This logic runs if the backend confirmed it was the first message and created a new convo
                    if (response.is_first_actual_message && response.convo_id) {
                        const newUrl = `/agent/assistant/${response.convo_id}/`;

                        // Update browser URL without reload
                        window.history.pushState({}, response.convo_title || 'New Chat', newUrl);

                        // Update form/input so future sends keep using this convo
                        $('#chat-form').data('initial-convo-id', response.convo_id);
                        $('#chat-input').data('convo-id', response.convo_id);

                        // Remove any placeholder li
                        const placeholderLi = $('#recents-list li[data-placeholder="true"]');
                        if (placeholderLi.length) placeholderLi.remove();

                        // Build the new recents <li> with empty <a>, then type out the title
                        const $newLi = $(`
                           <li data-convo-id="${response.convo_id}"
                               data-delete-url="/agent/assistant/delete_conversation/${response.convo_id}/"
                               class="active animate__animated animate__fadeIn just-created">
                             <a href="${newUrl}" class="recent-link"></a>
                             <button class="delete-recent-btn">
                               <img src="/static/home_page/images/delete.png" alt="Delete">
                             </button>
                           </li>
                       `);

                        // Animate the title typing
                        const fullTitle = response.convo_title || 'New Chat';
                        const $link = $newLi.find('.recent-link');
                        let i = 0;
                        function typeTitle() {
                            if (i < fullTitle.length) {
                                $link.append(fullTitle.charAt(i));
                                i++;
                                setTimeout(typeTitle, 120);
                            }
                        }
                        typeTitle();

                        // Prepend and activate
                        $('#recents-list li').removeClass('active');
                        $('#recents-list').prepend($newLi);

                        // Re-attach the delete-button handler
                        $newLi.find('.delete-recent-btn').on('click', function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        });

                        return;
                    }

                },
                error: function (xhr, status, error) {
                    // Remove the thinking indicator
                    $('#agent-thinking').remove();
                    // Display an error message
                    let errorMessage = 'An error occurred while sending your message.'; // Generic error for sending
                    if (xhr.status === 403) {
                        errorMessage = 'You do not have permission to send messages.';
                    } else if (xhr.responseJSON && xhr.responseJSON.error) {
                        errorMessage = 'Error: ' + xhr.responseJSON.error;
                    } else {
                        errorMessage += ` Status: ${xhr.status}`;
                    }
                    alert(errorMessage);
                    console.error("Message sending failed.", status, error, xhr);
                }
            });
        });
    });
}

function displayAgentMessage(messageText) {
    const chatBox = $('#chat-box');
    const agentMessageHtml = `
        <div class="message agent-message new-message">
             <div class="avatar agent-avatar">
                ${agentAvatar}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    <div class="message-text"></div> <!-- Text will be typed here -->
                </div>
            </div>
        </div>`;
    chatBox.append(agentMessageHtml);

    const newMessage = chatBox.find('.new-message').last();
    const textElement = newMessage.find('.message-text');

    const parsedMessageHtml = marked.parse(messageText);

    const tempDiv = $('<div>').html(parsedMessageHtml);
    const plainTextContent = tempDiv.text();

    const startTime = Date.now();
    const speed = 10; // (ms per char)

    function typeWriter() {
        const now = Date.now();
        const elapsed = now - startTime;
        const charIndex = Math.floor(elapsed / speed);

        if (charIndex < plainTextContent.length) {
            textElement.text(plainTextContent.substring(0, charIndex + 1));
            chatBox.scrollTop(chatBox[0].scrollHeight);
            requestAnimationFrame(typeWriter);
        } else {
            // Animation finished
            textElement.html(parsedMessageHtml);
            newMessage.removeClass('new-message');
            chatBox.scrollTop(chatBox[0].scrollHeight);
        }
    }

    requestAnimationFrame(typeWriter);

}

function handleCalendarActionRequest(content) {
    const chatBox = $('#chat-box');
    // Remove any existing action UIs before adding a new one
    $('.calendar-action-ui').remove();

    let actionUiHtml = '';

    if (content.needs_connection) {
        // Show the connect Google account prompt
        actionUiHtml = `
            <div class="message agent-message calendar-action-ui">
                 <div class="message-avatar agent-avatar">
                    ${agentAvatar}
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        <p>Please connect your Google account to manage your calendar.</p>
                        <a href="${content.connect_url}" class="btn btn-primary btn-sm google-connect-button">Connect Google Account</a>
                         <button class="btn btn-secondary btn-sm skip-button">Skip</button>
                    </div>
                </div>
            </div>`;
        chatBox.append(actionUiHtml);

        // Add event listener to the skip button if needed (optional based on requirements)
        $('.skip-button').on('click', function () {
            // Handle skip logic here, e.g., remove the UI, send a message back to the agent
            $(this).closest('.calendar-action-ui').remove();
            displayAgentMessage("Okay, skipping the calendar action for now.");
        });

    } else if (content.create_event_form) {
        displayAgentMessage("Okay, I'm ready to create the event. (Form display needs implementation)");

    }
    chatBox.scrollTop(chatBox[0].scrollHeight);
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}


$(document).ready(function () {
    const messageInput = $('#chat-input');
    const sendButton = $('#send-button');
    const chatForm = $('#chat-form');
    const chatBox = $('#chat-box');
    const recentsList = $('#recents-list');


    // Get user and agent avatars from data attributes (set in the template)
    window.userAvatar = chatForm.data('user-avatar') || '';
    window.agentAvatar = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14 c0 1.1.9 2 2 2h14 c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM19 20H5V8h14v12z" fill="#5F6368"/></svg>';
    chatBox.scrollTop(chatBox[0].scrollHeight);


    recentsList.on('click', '.delete-recent-btn', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const listItem = $(this).closest('li');
        const convoId = listItem.data('convo-id');
        const deleteUrl = listItem.data('delete-url');

        // Basic validation
        if (!convoId || !deleteUrl) {
            console.error("Missing convo ID or delete URL for delete action.");
            alert("Could not delete conversation due to missing information.");
            return; // Exit if data is missing
        }


        if (confirm('Are you sure you want to delete this conversation?')) {
            // Get CSRF token (assuming cookie method)
            const csrftoken = getCookie('csrftoken');

            $.ajax({
                url: deleteUrl,
                type: 'POST',
                headers: { 'X-CSRFToken': csrftoken },

                success: function (response) {
                    if (response.success) {
                        listItem.remove();

                        // Handle redirect if a redirect URL is provided by the backend
                        if (response.redirect_url) {
                            window.location.href = response.redirect_url;
                        } else {
                            console.warn("Delete success but no redirect_url received from backend.");
                            // If no convos remain and no redirect, display the "No conversations yet" message
                            if (recentsList.find('li').length === 0) {
                                $('.no-convos-msg').show();
                                chatBox.empty();
                            }
                        }

                    } else {
                        alert('Error deleting conversation: ' + (response.error || 'Unknown error'));
                    }
                },
                error: function (xhr, status, error) {
                    console.error("Delete request failed:", status, error, xhr);
                    let errorMessage = 'An error occurred while trying to delete the conversation.';
                    if (xhr.status === 403) {
                        errorMessage = 'You do not have permission to delete this conversation.';
                    } else if (xhr.responseJSON && xhr.responseJSON.error) {
                        errorMessage = 'Error: ' + xhr.responseJSON.error;
                    } else {
                        errorMessage += ` Status: ${xhr.status}`;
                    }
                    alert(errorMessage);
                }
            });
        } else {
            // Log removed("Delete action cancelled by user.");
        }
    })

    $('.new-task-btn').on('click', function (e) {
        $(this).addClass('disabled');
    });

    // Animate the recents list title if just created
    const justCreatedLi = $('#recents-list li.just-created');
    if (justCreatedLi.length) {
        const link = justCreatedLi.find('.recent-link');
        const fullTitle = link.text();
        link.text('');
        let i = 0;
        function typeTitle() {
            if (i < fullTitle.length) {
                link.append(fullTitle.charAt(i));
                i++;
                setTimeout(typeTitle, 120); // slower animation
            }
        }
        typeTitle();
        justCreatedLi.removeClass('just-created');
    }

    /* ======  KEEP GREY BACKGROUND ON CURRENT CONVERSATION  ====== */
    if (recentsList.length) {
        const currPath = window.location.pathname;

        recentsList.find('a.recent-link').each(function () {
            if (this.getAttribute('href') === currPath) {
                recentsList.find('li').removeClass('active');
                $(this).closest('li').addClass('active');
                return false;
            }
        });

        recentsList.on('click', 'a.recent-link', function () {
            recentsList.find('li').removeClass('active');
            $(this).closest('li').addClass('active');
        });
    }

});


function showIntentConfirmation() {
    const chatMessagesContainer = document.getElementById("chat-box");
    if (!chatMessagesContainer) return null;

    // Create persistent agent message element that will be reused throughout the conversation flow
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", "agent-message");
    messageDiv.dataset.sender = "agent";
    messageDiv.dataset.intentState = "confirming";

    const avatarDiv = document.createElement("div");
    avatarDiv.classList.add('avatar', 'agent-avatar');
    avatarDiv.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14
                     c0 1.1.9 2 2 2h14
                     c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM19 20H5V8h14v12z"
                  fill="#5F6368"/>
        </svg>`;
    messageDiv.appendChild(avatarDiv);

    const mainContentDiv = document.createElement("div");
    mainContentDiv.classList.add("intent-confirmation-box");

    // Create the confirmation UI with progress animation
    mainContentDiv.innerHTML = `
        <div class="intent-confirmation-content">
            <div class="intent-progress-spinner"></div>
            <div class="intent-confirmation-title processing">Confirming Intent</div>
        </div>
    `;

    messageDiv.appendChild(mainContentDiv);
    chatMessagesContainer.appendChild(messageDiv);
    scrollChatToBottom();

    return { messageDiv, mainContentDiv };
}

function updateIntentConfirmation(element, intent) {
    if (!element || !element.mainContentDiv) return;

    // Map intent types to display labels
    const intentLabels = {
        'general_chat': 'General',
        'calendar': 'Calendar',
        'schedule': 'Calendar',
        'calendar_action_request': 'Calendar'
    };

    const intentLabel = intentLabels[intent] || 'General';

    element.mainContentDiv.innerHTML = `
        <div class="intent-confirmation-content confirmed">
            <div class="intent-confirmation-icon">✓</div>
            <div class="intent-confirmation-title confirmed">Intent: ${intentLabel}</div>
        </div>
    `;
    element.messageDiv.dataset.intentState = "confirmed";
}


/* 
   --------------------------------------------------
   JS FOR settings.html (intl-tel-input)
   --------------------------------------------------
*/
document.addEventListener('DOMContentLoaded', function () {
    const input = document.querySelector('#whatsapp_number');
    const form = document.querySelector('#settings-form');

    // Check idempotency using a data attribute
    if (input && form && !input.dataset.itiInitialized) {
        input.dataset.itiInitialized = "true";

        if (window.intlTelInput) {
            const iti = window.intlTelInput(input, {
                utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js',
                separateDialCode: true,
                initialCountry: 'auto',
                geoIpLookup: function (callback) {
                    fetch('https://ipapi.co/json')
                        .then(function (res) { return res.json(); })
                        .then(function (data) { callback(data.country_code); })
                        .catch(function () { callback('us'); });
                },
                preferredCountries: ['us', 'gb', 'ng'],
            });

            form.addEventListener('submit', function (e) {
                e.preventDefault();

                if (input.value.trim()) {
                    if (iti.isValidNumber()) {
                        const fullNumber = iti.getNumber();
                        input.value = fullNumber;
                        form.submit();
                    } else {
                        const fullNumber = iti.getNumber();
                        input.value = fullNumber;
                        form.submit();
                    }
                } else {
                    form.submit();
                }
            });
        }
    }
});


/* 
   --------------------------------------------------
   JS FOR settings.html (Morning Briefing Toggle)
   --------------------------------------------------
*/
document.addEventListener('DOMContentLoaded', function () {
    const briefingCheckbox = document.getElementById('morning_briefing_enabled');
    const briefingTimeGroup = document.getElementById('briefing-time-group');

    if (briefingCheckbox && briefingTimeGroup) {
        briefingCheckbox.addEventListener('change', function () {
            briefingTimeGroup.style.display = this.checked ? 'block' : 'none';
        });
    }
});

/* 
   --------------------------------------------------
   Mobile Responsiveness Handling
   --------------------------------------------------
*/
document.addEventListener('DOMContentLoaded', function () {
    if (window.innerWidth <= 768) {
        const sidebarWrapper = document.querySelector('.sidebar-wrapper');
        const body = document.body;

        // Default to collapsed on mobile if not already
        if (sidebarWrapper && !sidebarWrapper.classList.contains('collapsed')) {
            sidebarWrapper.classList.add('collapsed');
            body.classList.add('sidebar-collapsed');
        }
    }
});
