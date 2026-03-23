/**
 * 🐂 FAROL TECH & NEGOCIOS — ESTRATEGIA MONETIZACIÓN 2026
 * --------------------------------------------------------
 */
const express   = require('express');
const { Pool }  = require('pg');
const cron      = require('node-cron');
const { GoogleGenerativeAI } = require('@google-ai/generativai');
const path      = require('path');

const app      = express();
const PORT     = process.env.PORT || 8080;

// ✅ RUTA DE SALUD (Arregla el Healthcheck failed de Railway)
app.get('/health', (req, res) => { res.status(200).send('OK'); });

// 🔗 CONEXIÓN AUTOMÁTICA A POSTGRES
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ AUTO-CONFIGURACIÓN (Crea la tabla solo si no existe)
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
        console.log("✅ Base de datos lista para facturar.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 INTELIGENCIA ARTIFICIAL (ROTACIÓN DE 2 LLAVES)
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

// 💰 GENERADOR DE ARTÍCULOS PARA ADSENSE (CADA 8 HORAS)
async function publicarNoticiaEstrategica() {
    const promptSEO = `Actúa como experto en Finanzas y SEO. Escribe un artículo de alto valor sobre tecnología o economía dominicana en 2026 para Google AdSense. 
    Responde SOLO en JSON: {"titulo":"...","resumen":"...","contenido":"(usa h2 y p)","categoria":"...","tags":"..."}`;

    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return;

    try {
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await pool.query(
            `INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) 
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        console.log("🐂 Noticia Monetizable Publicada: " + data.titulo);
    } catch (e) { console.log("❌ Error en JSON"); }
}

cron.schedule('0 */8 * * *', () => publicarNoticiaEstrategica());

// 🌐 RUTAS WEB
app.use(express.static(path.join(__dirname, 'client')));
app.get('/api/noticias', async (req, res) => {
    const result = await pool.query('SELECT * FROM articulos ORDER BY fecha_
