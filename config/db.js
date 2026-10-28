const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Google/Cloudflare DNS, Atlas SRV 
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1); // Agar DB connect nahi hua toh server band kar do
    }
};

module.exports = connectDB;