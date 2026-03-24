/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (GEMINI 1.5 FLASH ONLY)
 * MODELO: gemini-1.5-flash
 */
const express = require('express');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 🔗 CONEXIÓN A BASE DE DATOS
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function autoConfigurarDB() {
    const sql = `CREATE TABLE IF NOT EXISTS articulos (id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, resumen TEXT, contenido_html TEXT, tags TEXT, categoria TEXT, fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`;
    try { await pool.query(sql); } catch (err) { console.error("Error DB:", err.message); }
}

// 🔑 LLAMADA A IA (SOLO GEMINI 1.5 FLASH)
async function llamarIA(prompt) {
    let key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) throw new Error("Falta la llave API en Railway.");

    try {
        const genAI = new GoogleGenerativeAI(key);
        // USANDO SOLO GEMINI 1.5 FLASH
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Limpiador de JSON
        const inicio = text.indexOf('{');
        const fin = text.lastIndexOf('}') + 1;
        if (inicio === -1) throw new Error("La IA no respondió en formato correcto.");
        return text.substring(inicio, fin);
    } catch (e) {
        throw new Error("Error Gemini Flash: " + e.message);
    }
}

async function publicarNoticia() {
    const prompt = `Escribe una noticia SEO sobre economía en RD 2026. Responde SOLO en JSON: {"titulo":"...","resumen":"...","contenido":"(usa h2 y p)","categoria":"...","tags":"..."}`;
    try {
        const respuesta = await llamarIA(prompt);
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6)",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        return { ok: true };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

// 🚀 RUTAS
app.get('/activar-toro', async (req, res) => {
    const resu = await publicarNoticia();
    if (resu.ok) {
        res.send(`<h1>🐂 TORO FLASH ACTIVO</h1>
                  <p>✅ Usando Gemini 1.5 Flash</p>
                  <a href="/redaccion.html">Ver Monitor</a>
                  <br><br>
                  <a href="/api/noticias">📰 Ver últimas noticias</a> | 
                  <a href="/api/admin/listado">📋 Admin - Ver todas</a>`);
    } else {
        res.status(500).send(`<h1>❌ FALLO</h1><p>Detalle: ${resu.msg}</p>`);
    }
});

app.get('/api/admin/listado', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC");
    res.json(r.rows);
});

app.get('/api/noticias', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 10");
    res.json(r.rows);
});

app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

app.listen(PORT, '0.0.0.0', async () => {
    await autoConfigurarDB();
    console.log(`🚀 Motor Gemini 1.5 Flash corriendo en puerto ${PORT}`);
    console.log(`✅ Usando modelo: gemini-1.5-flash`);
});
