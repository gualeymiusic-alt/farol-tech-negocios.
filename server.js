/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (CONEXIÓN TOTAL)
 * --------------------------------------------------------
 */

const express   = require('express');
const { Pool }  = require('pg');
const cron      = require('node-cron');
const { GoogleGenerativeAI } = require('@google-ai/generativai');
const path      = require('path');

const app      = express();
const PORT     = process.env.PORT || 8080;

// 🔗 CONEXIÓN AUTOMÁTICA (Usa la variable que Railway genera sola)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ FUNCIÓN: CREAR TABLA SOLA (Si no existe)
async function autoConfigurarDB() {
    const sql = `
        CREATE TABLE IF NOT EXISTS articulos (
            id SERIAL PRIMARY KEY,
            titulo TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            resumen TEXT,
            contenido_html TEXT,
            tags TEXT,
            imagen_url TEXT,
            fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(sql);
        console.log("✅ El Toro encontró (o creó) su base de datos automáticamente.");
    } catch (err) {
        console.error("❌ Error de auto-conexión:", err.message);
    }
}

// 🔑 GEMINI CON TUS 2 KEYS
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

// 🐂 PUBLICACIÓN PROGRAMADA (Cada 8 horas)
async function publicarNoticia() {
    const prompt = `Escribe una noticia tech/economía de RD en JSON: {"titulo":"...","resumen":"...","contenido":"..."}`;
    const respuesta = await llamarIA(prompt);
    if (!respuesta) return;

    try {
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await pool.query(
            `INSERT INTO articulos (titulo, slug, resumen, contenido_html) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.titulo, slug, data.resumen, data.contenido]
        );
        console.log("🐂 Noticia publicada: " + data.titulo);
    } catch (e) { console.log("❌ Error al guardar."); }
}

// ⏱️ TIEMPOS DEL TORO
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🌐 RUTAS PÚBLICAS
app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

// 🚀 ENCENDIDO
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Motor Farol Tech en puerto ${PORT}`);
    await autoConfigurarDB(); // <--- Aquí ocurre la magia automática
});
