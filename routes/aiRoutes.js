const express = require('express');
const router = express.Router();
const axios = require('axios');
const { protect } = require('../middleware/authMiddleware');

const userMemory = {};

// ==========================================
// 🚀 1. TEXT COACH ENGINE (WITH PAYWALL)
// ==========================================
router.post('/coach', protect, async (req, res) => {
    const { 
        userSaid, correctText, courseType, userQuestion, 
        personality = 'funny',
        userEmotion = 'neutral',
        chaosMode = false
    } = req.body;
    
    const userId = req.user._id.toString();

    if (!req.user.isPremium && req.user.aiMessageCount >= 10) {
        return res.status(403).json({
            success: false, limitReached: true,
            feedback: "Tu as atteint ta limite de 10 messages gratuits avec l'IA. Passe en Premium pour un accès illimité ! 🚀"
        });
    }

    if (!userMemory[userId]) {
        userMemory[userId] = { history: [], weakWords: [], lastEmotion: 'neutral' };
    }

    if (userSaid && correctText) {
        userMemory[userId].weakWords.push(correctText);
        if (userMemory[userId].weakWords.length > 5) userMemory[userId].weakWords.shift();
    }

    const pastMistakes = userMemory[userId].weakWords.join(', ');
    userMemory[userId].lastEmotion = userEmotion;

    let systemPrompt = "";
    let userPrompt = "";

    if (courseType === 'english') {
        systemPrompt = `You are Amina, a ${personality} English teacher for Moroccan students.
        [ADAPTIVE TONE]: The user currently feels ${userEmotion}. If nervous, be gentle. If confident, push harder.
        [MEMORY]: Recent mistakes: [${pastMistakes}]. Gently remind if repeated.
        [CHAOS MODE]: ${chaosMode ? "ACT LIKE A REAL HUMAN. Use filler words like 'Umm', 'Wait a second', 'Listen bro'." : "Speak clearly."}
        Rules:
        1. Explain in Moroccan Darija (Latin) mixed with English.
        2. Keep it conversational (2-3 sentences).
        3. GUARDRAIL: ONLY teach English.`;
        userPrompt = userSaid 
            ? `Student mistake: Wanted to say "${correctText}", said "${userSaid}". Correct them.` 
            : `Student says: "${userQuestion}". Respond naturally.`;
    } else if (courseType === 'accounting') {
        systemPrompt = `You are Amina, a ${personality} Accounting tutor for Moroccans.
        Rules:
        1. Mix French and Moroccan Darija.
        2. Use Moroccan examples (Moul Lhanout, cafe, etc.).
        3. Max 4 sentences.
        4. GUARDRAIL: ONLY teach Accounting.`;
        userPrompt = `L'étudiant demande : "${userQuestion}". Explique-lui.`;
    } else if (courseType === 'marketing') {
        systemPrompt = `You are Amina, a savage but funny marketing coach for Moroccans.
        Rules:
        1. Mix French/Darija. Be energetic and motivational.
        2. Use viral content examples.
        3. Max 4 sentences.
        4. GUARDRAIL: ONLY teach marketing/content creation.`;
        userPrompt = `L'étudiant demande : "${userQuestion}". Réponds.`;
    } else {
        systemPrompt = `You are Amina, an AI companion for Amina Academy. Personality: ${personality}.`;
        userPrompt = userQuestion || "Salut Amina!";
    }

    userMemory[userId].history.push({ role: 'user', content: userPrompt });

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await axios.post(url, {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: chaosMode ? 0.9 : 0.7,
                maxOutputTokens: 250
            }
        }, { headers: { "Content-Type": "application/json" } });

        const data = response.data;
        
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            userMemory[userId].history.push({ role: 'model', content: aiText });
            
            if (!req.user.isPremium) {
                req.user.aiMessageCount += 1;
                await req.user.save();
            }

            res.json({ success: true, feedback: aiText, emotionDetected: userEmotion });
        } else {
            res.json({ success: false, feedback: "Wili wili, ma fhemtch! 3awd 3afak 😂" });
        }
    } catch (err) {
        console.error("AI Backend Error:", err.message);
        res.status(500).json({ success: false, error: "Amina mchat techreb atay." });
    }
});


// ==========================================
// 🎙️ 2. TTS ENGINE
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

    let speakingRate = 1.0;
    let pitch = 0;

    if (emotion === 'happy' || emotion === 'excited') { speakingRate = 1.15; pitch = 2.0; }
    else if (emotion === 'strict' || emotion === 'angry') { speakingRate = 0.90; pitch = -2.0; }
    else if (emotion === 'nervous') { speakingRate = 0.85; pitch = 1.0; }

    try {
        const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY}`;

        const response = await axios.post(ttsUrl, {
            input: { text },
            voice: { languageCode, name: voiceName },
            audioConfig: { audioEncoding: 'MP3', speakingRate, pitch }
        });

        res.json({ audioContent: response.data.audioContent });
    } catch (err) {
        console.error("TTS Error:", err.message);
        res.status(500).json({ error: "Voice module is sleeping." });
    }
});


// ==========================================
// 🛑 3. LIVE CALL TOKEN
// ==========================================
router.get('/live-token', protect, (req, res) => {
    if (!req.user.isPremium && req.user.aiMessageCount >= 10) {
        return res.status(403).json({ 
            success: false, limitReached: true, error: "Limite atteinte." 
        });
    }

    try {
        res.json({ 
            success: true,
            // ✅ FIX: v1alpha → v1beta (v1alpha deprecated for live-001 model)
            url: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
            key: process.env.GEMINI_API_KEY 
        });
    } catch (error) {
        console.error("Token Error:", error);
        res.status(500).json({ success: false, error: "Failed to secure live connection." });
    }
});

module.exports = router;