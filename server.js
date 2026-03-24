/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (PRODUCCIÓN TOTAL)
 * --------------------------------------------------------
 * 🛠️ CONFIGURACIÓN:
 * 1. IA: Rotación de 2 llaves Gemini.
 * 2. AUTO-DB: Crea tablas solo al iniciar.
 * 3. DISPARO: Ruta /activar-toro para publicar manual.
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

// ✅ RUTA DE SALUD (Para que Railway no se ponga rojo)
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
        console.log("✅ DB Lista y conectada.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 MOTOR DE IA (Gemini 1.5 Flash)
async function llamarIA(prompt) {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean);
    const keyActual = (new Date().getHours() % 2 === 0) ? keys[0] : (keys[1] || keys[0]);
    try {
        const genAI = new GoogleGenerativeAI(keyActual);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) { 
        console.error("Error IA:", e.message);
        return null; 
    }
}

// 💰 FUNCIÓN PARA PUBLICAR ARTÍCULO SEO
async function publicarNoticia() {
    console.log("🐂 El Toro analizando mercados...");
    const promptSEO = `Actúa como analista financiero. Escribe un artículo SEO sobre tecnología o economía dominicana en 2026. 
    Responde SOLO en formato JSON: {"titulo":"...","resumen":"...","contenido":"...","categoria":"...","tags":"..."}`;
    
    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return;
    
    try {
        const cleanRes = respuesta.replace(/```json|```/g, "").trim();
        const data = JSON.parse(cleanRes);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        console.log("💰 Noticia Publicada: " + data.titulo);
        return true;
    } catch (e) { 
        console.log("❌ Error procesando JSON de la noticia."); 
        return false;
    }
}

// ⏱️ PROGRAMACIÓN AUTOMÁTICA (CADA 8 HORAS)
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🚀 RUTA DE ACTIVACIÓN MANUAL (La que usarás tú)
app.get('/activar-toro', async (req, res) => {
    const exito = await publicarNoticia();
    if (exito) {
        res.send('<h1>🐂 ¡EL TORO HA PUBLICADO!</h1><p>Ya puedes ver la noticia en la portada.</p><a href="/">Ir a la Portada</a>');
    } else {
        res.status(500).send('<h1>❌ Error</h1><p>El Toro falló al escribir. Revisa las Keys de Gemini.</p>');
    }
});

// 🌐 API PARA LA PORTADA
app.get('/api/noticias', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 10");
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🌐 API PARA VER UNA NOTICIA COMPLETA
app.get('/api/noticia/:slug', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM articulos WHERE slug = $1", [req.params.slug]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Noticia no encontrada" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// SERVIR ARCHIVOS DE LA CARPETA CLIENT
app.use(express.static(path.join(__dirname, 'client')));

// RUTA PRINCIPAL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// ENCENDER MOTOR
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Motor encendido en puerto ${PORT}`);
    await autoConfigurarDB();
});
