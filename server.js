/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (AUTO-CONFIGURABLE)
 * --------------------------------------------------------
 */

const express   = require('express');
const { Pool }  = require('pg');
const cron      = require('node-cron');
const { GoogleGenerativeAI } = require('@google-ai/generativai');

const app      = express();
const PORT     = process.env.PORT || 8080;

// 🔗 CONEXIÓN A BASE DE DATOS
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ FUNCIÓN MAESTRA: CREAR TABLA AUTOMÁTICAMENTE
async function configurarBaseDeDatos() {
    const queryTabla = `
        CREATE TABLE IF NOT EXISTS articulos (
            id SERIAL PRIMARY KEY,
            titulo TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            resumen TEXT,
            contenido_html TEXT,
            tags TEXT,
            fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(queryTabla);
        console.log("✅ Base de datos lista y conectada automáticamente.");
    } catch (err) {
        console.error("❌ Error al auto-conectar DB:", err.message);
    }
}

// 🔑 LLAMADA A GEMINI (USANDO TUS 2 KEYS)
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

// 🐂 EL TORO ESCRIBIENDO (CADA 8 HORAS)
async function publicarNoticia() {
    console.log("🐂 El Toro está generando contenido...");
    const prompt = `Escribe una noticia de tecnología/economía para RD en JSON: {"titulo":"...","resumen":"...","contenido":"..."}`;
    const respuesta = await llamarIA(prompt);
    if (!respuesta) return;

    try {
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await pool.query(
            `INSERT INTO articulos (titulo, slug, resumen, contenido_html) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [data.titulo, slug, data.resumen, data.contenido]
        );
        console.log("✅ Noticia publicada automáticamente.");
    } catch (e) { console.log("❌ Error al guardar noticia."); }
}

// ⏱️ CRON (3 veces al día)
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🌐 RUTAS
app.use(express.static('client'));
app.get('/', (req, res) => res.sendFile(__dirname + '/client/index.html'));

// 🚀 ARRANCAR Y CONFIGURAR TODO SOLO
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
    await configurarBaseDeDatos(); // <--- Aquí hace la magia solo
});
