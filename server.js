/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (VERSIÓN REDACCIÓN PRO)
 * --------------------------------------------------------
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

// ✅ RUTA DE SALUD (Para Railway)
app.get('/health', (req, res) => { res.status(200).send('OK'); });

// 🔗 CONEXIÓN A BASE DE DATOS
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ AUTO-CONFIGURAR TABLAS
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
        console.log("✅ DB Lista para la Redacción.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 MOTOR DE IA (Gemini)
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

// 💰 FUNCIÓN MAESTRA DE PUBLICACIÓN
async function publicarNoticia() {
    console.log("🐂 Analizando mercados para publicar...");
    const promptSEO = `Actúa como analista financiero. Escribe un artículo SEO de alto valor sobre tecnología o economía dominicana 2026. Responde SOLO en JSON: {"titulo":"...","resumen":"...","contenido":"...","categoria":"...","tags":"..."}`;
    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return false;
    try {
        const cleanRes = respuesta.replace(/```json|```/g, "").trim();
        const data = JSON.parse(cleanRes);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        return true;
    } catch (e) { return false; }
}

// ⏱️ PROGRAMACIÓN (CADA 8 HORAS)
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🚀 RUTAS DE ADMINISTRACIÓN (Monitor)
app.get('/activar-toro', async (req, res) => {
    const exito = await publicarNoticia();
    if (exito) res.send('<h1>🐂 PUBLICADO</h1><a href="/
