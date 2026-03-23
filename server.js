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

// 🔗 CONEXIÓN AUTOMÁTICA
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ AUTO-CREACIÓN DE TABLAS (SEO Ready)
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
        console.log("✅ Base de datos conectada y lista para AdSense.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 INTELIGENCIA ARTIFICIAL (ROTACIÓN DE 2 KEYS)
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

// 🐂 EL TORO BUSCANDO TEMAS DE ALTO VALOR (MONETIZACIÓN)
async function publicarNoticiaEstrategica() {
    console.log("🐂 El Toro analizando tendencias de alto CPC...");
    
    // Instrucción Maestra para monetizar
    const promptSEO = `Actúa como un experto en SEO y Finanzas. 
    Genera un artículo de alto valor para Google AdSense sobre tecnología o economía en 2026.
    Temas preferidos: Inteligencia Artificial en banca, Cripto-activos en RD, o Inversiones Tech.
    
    RESPONDE SOLO EN JSON:
    {
      "titulo": "Un título llamativo con palabras clave",
      "resumen": "Un párrafo que enganche al lector",
      "contenido": "Mínimo 5 párrafos con subtítulos HTML (h2), datos técnicos y análisis profundo",
      "categoria": "Tecnología/Economía",
      "tags": "separados, por, coma"
    }`;

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
        console.log("💰 Artículo monetizable publicado: " + data.titulo);
    } catch (e) { console.log("❌ Error procesando JSON de Gemini."); }
}

// ⏱️ PROGRAMACIÓN (CADA 8 HORAS) - Para no parecer spam
cron.schedule('0 */8 * * *', () => publicarNoticiaEstrategica());

// 🌐 RUTAS
app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

// 🚀 LANZAMIENTO
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Farol Tech Online en Puerto ${PORT}`);
    await autoConfigurarDB();
});
