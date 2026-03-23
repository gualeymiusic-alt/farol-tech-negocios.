/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (LIMPIO)
 */
const express = require('express');
const { Pool } = require('pg');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ✅ SALUD PARA RAILWAY
app.get('/health', (req, res) => { res.status(200).send('OK'); });

// 🔗 DB
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ AUTO-TABLAS
async function autoConfigurarDB() {
    const sql = `
        CREATE TABLE IF NOT EXISTS articulos (
            id SERIAL PRIMARY KEY,
            titulo TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            resumen TEXT,
            contenido_html TEXT,
            tags TEXT,
            categoria TEXT,
            fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(sql);
        console.log("✅ DB Lista");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 IA
async function llamarIA(prompt) {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean);
    const keyActual = (new Date().getHours() % 2 === 0) ? keys[0] : (keys[1] || keys[0]);
    try {
        const genAI = new GoogleGenerativeAI(keyActual);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { return null; }
}

// 💰 PUBLICAR
async function publicarNoticia() {
    const promptSEO = `Escribe un articulo SEO tech/economia RD 2026. JSON: {"titulo":"...","resumen":"...","contenido":"...","categoria":"...","tags":"..."}`;
    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return;
    try {
        const cleanRes = respuesta.replace(/```json|```/g, "").trim();
        const data = JSON.parse(cleanRes);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        console.log("💰 Publicada: " + data.titulo);
    } catch (e) { console.log("❌ Error JSON"); }
}

cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🌐 API CORREGIDA (Aquí estaba el error de sintaxis)
app.get('/api/noticias', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 6");
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Puerto ${PORT}`);
    await autoConfigurarDB();
});
