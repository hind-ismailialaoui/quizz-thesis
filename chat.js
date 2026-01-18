const chatBubble = document.getElementById('chat-bubble');
const chatWindow = document.getElementById('chat-window');
const closeChat = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// Variable pour suivre l'état ouvert/fermé
let isChatOpen = false;

// Ouvrir/fermer le chat avec la bulle
chatBubble.addEventListener('click', () => {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
        chatWindow.classList.remove('hide');
    } else {
        chatWindow.classList.add('hide');
    }
});

// Fermer le chat avec la croix (sans supprimer les messages)
closeChat.addEventListener('click', () => {
    isChatOpen = false;
    chatWindow.classList.add('hide');
});

function addMessage(text, isUser = false, isTyping = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(isUser ? 'user-message' : 'assistant-message');
    if (isTyping) messageDiv.dataset.typing = 'true';
    
    const p = document.createElement('p');
    p.textContent = text;
    messageDiv.appendChild(p);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll automatique vers le bas
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        // Ajouter le message de l'utilisateur
        addMessage(message, true);
        chatInput.value = '';
        sendBtn.disabled = true;

        // Placeholder "typing"
        const typingMessage = addMessage("...", false, true);
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            if (!response.ok) {
                throw new Error('Erreur serveur');
            }
            const data = await response.json();
            const reply = data.reply || "Je n'ai pas de reponse pour le moment.";
            typingMessage.querySelector('p').textContent = reply;
            typingMessage.removeAttribute('data-typing');
        } catch (error) {
            typingMessage.querySelector('p').textContent =
                "Desole, une erreur est survenue. Reessaie dans un instant.";
            typingMessage.removeAttribute('data-typing');
        } finally {
            sendBtn.disabled = false;
        }
    }
}

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
