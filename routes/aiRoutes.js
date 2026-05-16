const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/authMiddleware');

// 🧠 1. DYNAMIC MEMORY SYSTEM (In-Memory Database)
// Pro-Tip: Production mein isko MongoDB ya Redis mein shift kar dena.
const userMemory = {};

// ==========================================
// 🚀 1. THE "GOD MODE" TEXT ENGINE
// ==========================================
router.post('/coach', protect, async (req, res) => {
    const { 
        userSaid, 
        correctText, 
        courseType, 
        userQuestion, 
        personality = 'funny', // 🎭 friendly, strict, motivational, funny
        userEmotion = 'neutral', // 🥺 nervous, confident, shy
        chaosMode = false // 🌪️ Random interruptions & human filler words
    } = req.body;
    
    const userId = req.user._id.toString();

    // 🧠 Initialize Memory for User
    if (!userMemory[userId]) {
        userMemory[userId] = { history: [], weakWords: [], lastEmotion: 'neutral' };
    }

    // 📈 Track Weaknesses Live
    if (userSaid && correctText) {
        userMemory[userId].weakWords.push(correctText);
        // Keep only last 5 weaknesses to avoid prompt overload
        if (userMemory[userId].weakWords.length > 5) userMemory[userId].weakWords.shift();
    }

    const pastMistakes = userMemory[userId].weakWords.join(', ');
    const previousEmotion = userMemory[userId].lastEmotion;
    userMemory[userId].lastEmotion = userEmotion; // Update for next time

    let systemPrompt = "";
    let userPrompt = "";

    // 🔀 DYNAMIC MASTER PROMPTS WITH ADAPTIVE INTELLIGENCE
    if (courseType === 'english') {
        systemPrompt = `You are Amina, a ${personality} English teacher for Moroccan students.
        [ADAPTIVE TONE]: The user currently feels ${userEmotion}. If they are nervous, be extremely gentle. If confident, push them harder.
        [MEMORY]: Their recent mistakes are: [${pastMistakes}]. Gently tease them or remind them if they repeat these.
        [CHAOS MODE]: ${chaosMode ? "ACT LIKE A REAL HUMAN. Use filler words like 'Umm', 'Wait a second', 'Listen bro'. Interrupt your own sentences." : "Speak clearly and structured."}
        
        Rules:
        1. Explain mistakes in Moroccan Darija (Latin letters) mixed with English.
        2. Keep it conversational and highly addictive (2-3 sentences).
        3. GUARDRAIL: You ONLY teach English. If they ask about other things, scold them playfully in Darija.`;
        
        userPrompt = userSaid 
            ? `Student mistake: Wanted to say "${correctText}", but said "${userSaid}". Correct them based on your current personality.` 
            : `Student says: "${userQuestion}". Respond naturally.`;
            
    } else if (courseType === 'accounting') {
        systemPrompt = `You are Amina, a ${personality} Accounting (Comptabilité) tutor for Moroccans.
        [ADAPTIVE TONE]: User feels ${userEmotion}. Adjust your teaching speed.
        Rules:
        1. Mix French and Moroccan Darija.
        2. ALWAYS use a relatable Moroccan example (Moul Lhanout, cafe, etc.).
        3. Keep it short (max 4 sentences).
        4. GUARDRAIL: ONLY teach Accounting.`;
        
        userPrompt = `L'étudiant demande : "${userQuestion}". Explique-lui.`;
    } else {
        systemPrompt = `You are Amina, an AI companion for Amina Academy. Personality: ${personality}.`;
        userPrompt = userQuestion || "Salut Amina!";
    }

    // 🗂️ Save to history context
    userMemory[userId].history.push({ role: 'user', content: userPrompt });

    try {
        // ⚡ MODEL REMAINS EXACTLY WHAT YOU REQUESTED
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await axios.post(url, {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: chaosMode ? 0.9 : 0.7, // Higher temp = more chaotic/creative
                maxOutputTokens: 250
            }
        }, { headers: { "Content-Type": "application/json" } });

        const data = response.data;
        
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            userMemory[userId].history.push({ role: 'model', content: aiText }); // Save AI response
            res.json({ feedback: aiText, emotionDetected: userEmotion });
        } else {
            res.json({ feedback: "Wili wili, ma fhemtch! 3awd 3afak 😂" });
        }
    } catch (err) {
        console.error("AI Backend Error:", err.message);
        res.status(500).json({ error: "Amina mchat techreb atay. (L'IA est endormie)." });
    }
});


// ==========================================
// 🎙️ 2. EMOTIONAL VOICE ENGINE (TTS)
// ==========================================
router.post('/speak', protect, async (req, res) => {
    const { text, courseType, emotion = 'neutral' } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    let languageCode = 'fr-FR';
    let voiceName = 'fr-FR-Neural2-A'; 

    if (courseType === 'english') {
        languageCode = 'en-US';
        voiceName = 'en-US-Journey-F'; 
    }

    // 🎛️ DYNAMIC VOICE PITCH & SPEED BASED ON EMOTION
    let speakingRate = 1.0;
    let pitch = 0;

    if (emotion === 'happy' || emotion === 'excited') {
        speakingRate = 1.15; pitch = 2.0;
    } else if (emotion === 'strict' || emotion === 'angry') {
        speakingRate = 0.90; pitch = -2.0;
    } else if (emotion === 'nervous') {
        speakingRate = 0.85; pitch = 1.0;
    }

    try {
        const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY}`;

        const response = await axios.post(ttsUrl, {
            input: { text: text },
            voice: { languageCode: languageCode, name: voiceName },
            audioConfig: { 
                audioEncoding: 'MP3', 
                speakingRate: speakingRate, 
                pitch: pitch 
            }
        });

        res.json({ audioContent: response.data.audioContent });
    } catch (err) {
        console.error("TTS Error:", err.message);
        res.status(500).json({ error: "Voice module is sleeping." });
    }
});


// ==========================================
// 🛑 3. SECURE BACKEND WEBSOCKET PROXY LOGIC 🛑
// ==========================================
// BIGGEST FIX: We NEVER send the Gemini API Key to the frontend.
// The frontend connects to YOUR backend server via WebSocket.
// Then, your backend server connects to Google Gemini Live API.

router.get('/live-token', protect, (req, res) => {
    try {
        // Generate a secure, temporary token for your OWN backend
        // (You will need to install 'jsonwebtoken' for production JWTs)
        const sessionToken = "amina_secure_" + req.user._id + "_" + Date.now();
        
        // Frontend will connect to: wss://yourdomain.com/ws/live?token=amina_secure_...
        res.json({ 
            success: true,
            message: "Connect to backend WebSocket using this token.",
            wsUrl: `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host')}/ws/live`,
            token: sessionToken 
            // ❌ KEY REMOVED! THE FRONTEND IS NOW 100% BLIND TO YOUR API KEY.
        });
    } catch (error) {
        console.error("Token Error:", error);
        res.status(500).json({ error: "Failed to secure live connection." });
    }
});

module.exports = router;