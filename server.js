/**
 * 🐂 FAROL TECH & NEGOCIOS — V2.0
 * MODELO: gemini-3-flash-preview (reemplaza a 1.5-flash)
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
    const sql = `CREATE TABLE IF NOT EXISTS articulos (
        id SERIAL PRIMARY KEY, 
        titulo TEXT NOT NULL, 
        slug TEXT UNIQUE NOT NULL, 
        resumen TEXT, 
        contenido_html TEXT, 
        tags TEXT, 
        categoria TEXT, 
        modelo_usado TEXT,
        fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;
    try { await pool.query(sql); } catch (err) { console.error("Error DB:", err.message); }
}

// 🤖 LLAMADA A GEMINI 3 FLASH (NUEVO MODELO)
async function llamarIA(prompt) {
    let key = (process.env.GEMINI_API_KEY || "").trim();
    if (!key) throw new Error("Falta la llave API en Railway.");

    try {
        const genAI = new GoogleGenerativeAI(key);
        // 🔥 NUEVO: Gemini 3 Flash Preview (reemplaza a 1.5-flash)
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const inicio = text.indexOf('{');
        const fin = text.lastIndexOf('}') + 1;
        if (inicio === -1) throw new Error("La IA no respondió en formato correcto.");
        return text.substring(inicio, fin);
    } catch (e) {
        throw new Error("Error Gemini 3 Flash: " + e.message);
    }
}

// 📝 PUBLICAR NOTICIA
async function publicarNoticia() {
    const prompt = `Escribe una noticia SEO sobre economía o tecnología en RD 2026. 
    Responde SOLO en JSON: 
    {
        "titulo":"...",
        "resumen":"...",
        "contenido":"(usa h2 y p)",
        "categoria":"...",
        "tags":"..."
    }`;
    
    try {
        const respuesta = await llamarIA(prompt);
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags, modelo_usado) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags, "gemini-3-flash-preview"]
        );
        return { ok: true, titulo: data.titulo };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

// 🗑️ BORRAR NOTICIA
async function borrarNoticia(id) {
    try {
        await pool.query("DELETE FROM articulos WHERE id = $1", [id]);
        return { ok: true };
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

// ==================== 🚀 RUTAS API ====================

app.get('/api/generar', async (req, res) => {
    const resultado = await publicarNoticia();
    res.json(resultado);
});

app.get('/api/admin/listado', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC");
    res.json(r.rows);
});

app.get('/api/noticias', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 10");
    res.json(r.rows);
});

app.get('/api/noticia/:slug', async (req, res) => {
    const { slug } = req.params;
    const r = await pool.query("SELECT * FROM articulos WHERE slug = $1", [slug]);
    if (r.rows.length === 0) return res.status(404).json({ error: "No encontrada" });
    res.json(r.rows[0]);
});

app.delete('/api/admin/borrar/:id', async (req, res) => {
    const resultado = await borrarNoticia(req.params.id);
    res.json(resultado);
});

// ==================== 🎨 FRONTEND ESTÁTICO ====================
app.use(express.static(path.join(__dirname, 'client')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));
app.get('/redaccion.html', (req, res) => res.sendFile(path.join(__dirname, 'client', 'redaccion.html')));
app.get('/noticia.html', (req, res) => res.sendFile(path.join(__dirname, 'client', 'noticia.html')));

// ==================== 🚀 INICIAR SERVIDOR ====================
app.listen(PORT, '0.0.0.0', async () => {
    await autoConfigurarDB();
    console.log(`🐂 Farol Tech corriendo en puerto ${PORT}`);
    console.log(`🤖 IA: Gemini 3 Flash Preview (reemplaza a 1.5-flash)`);
    console.log(`📰 Portada: http://localhost:${PORT}`);
    console.log(`📝 Monitor: http://localhost:${PORT}/redaccion.html`);
});
