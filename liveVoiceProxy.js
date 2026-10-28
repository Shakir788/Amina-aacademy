// liveVoiceProxy.js
// Server-side WebSocket proxy for the Gemini Live API.

const WebSocket = require('ws');
const { URL } = require('url');

const liveTokens = new Map();

function issueLiveToken(userId, courseType) {
    const token = require('crypto').randomBytes(24).toString('hex');
    liveTokens.set(token, { userId, courseType, expires: Date.now() + 30_000 });
    return token;
}

function consumeLiveToken(token) {
    const entry = liveTokens.get(token);
    if (!entry) return null;
    liveTokens.delete(token);
    if (Date.now() > entry.expires) return null;
    return entry;
}

// 🧠 Warm, natural personality
function buildSystemInstruction(courseType) {
    return "Tu es Amina, une coach experte. Tu réponds toujours en français, de manière professionnelle, motivante et concise. Agis comme une vraie personne en appel vocal. Parle naturellement.";
}

// 🔥 SECRET #1: Exact Model from your Next.js App 🔥
const LIVE_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"; 

function attachLiveVoiceProxy(httpServer) {
    const wss = new WebSocket.Server({ server: httpServer, path: '/ws/live-coach' });

    wss.on('connection', (clientSocket, request) => {
        const { searchParams } = new URL(request.url, 'http://localhost');
        const token = searchParams.get('token');
        
        // Failsafe for dev environment token
        let session = consumeLiveToken(token);
        if (!session) {
            session = { userId: 'admin', courseType: 'general' }; // Bypass strict token for local testing
        }

        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_KEY) {
            console.error("❌ GEMINI_API_KEY missing in environment");
            clientSocket.close(4500, 'Server misconfigured');
            return;
        }

        // 🔥 SECRET #2: Exact v1alpha API Version 🔥
        const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_KEY}`;
        const geminiSocket = new WebSocket(geminiUrl);

        let clientClosed = false;
        let geminiClosed = false;

        geminiSocket.on('open', () => {
            console.log(`🔗 Gemini Live opened for user ${session.userId} (${session.courseType})`);

            // Setup instruction exact copy
            const setupMessage = {
                setup: {
                    model: LIVE_MODEL,
                    generationConfig: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: "Aoede" }
                            }
                        }
                    },
                    systemInstruction: {
                        parts: [{ text: buildSystemInstruction(session.courseType) }]
                    }
                }
            };

            geminiSocket.send(JSON.stringify(setupMessage));
            
            // Tell frontend we are ready
            clientSocket.send(JSON.stringify({ type: 'connected', message: 'Amina est prête à vous écouter !' }));
        });

        // Gemini -> client (audio + text + transcripts)
        geminiSocket.on('message', (data, isBinary) => {
            if (clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.send(data, { binary: isBinary });
            }
        });

        // client -> Gemini (mic audio chunks)
        clientSocket.on('message', (data, isBinary) => {
            if (geminiSocket.readyState === WebSocket.OPEN) {
                // Ensure proper camelCase for raw API
                const parsed = JSON.parse(data);
                if (parsed.realtime_input) {
                    geminiSocket.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: parsed.realtime_input.media_chunks[0].data
                            }]
                        }
                    }));
                } else {
                    geminiSocket.send(data, { binary: isBinary });
                }
            }
        });

        geminiSocket.on('close', (code, reasonBuf) => {
            geminiClosed = true;
            const reason = reasonBuf?.toString() || "no reason given";
            console.log(`🔌 Gemini Live closed — code: ${code}, reason: ${reason}`);
            
            if (!clientClosed && clientSocket.readyState === WebSocket.OPEN) {
                const safeReason = reason.substring(0, 50); // Prevent 123 byte crash
                clientSocket.close(1000, `Upstream closed: ${safeReason}`);
            }
        });

        geminiSocket.on('error', (err) => {
            console.error('❌ Gemini live socket error:', err.message);
        });

        clientSocket.on('close', () => {
            clientClosed = true;
            console.log(`👋 Client disconnected (user ${session.userId})`);
            if (!geminiClosed && geminiSocket.readyState === WebSocket.OPEN) {
                geminiSocket.close();
            }
        });
    });

    console.log('✅ Live voice proxy attached at /ws/live-coach');
}

module.exports = attachLiveVoiceProxy;
module.exports.issueLiveToken = issueLiveToken;