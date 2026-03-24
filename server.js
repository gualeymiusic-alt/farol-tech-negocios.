/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (VERSIÓN FINAL BLINDADA)
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

// ✅ RUTA DE SALUD PARA RAILWAY
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
        console.log("✅ DB Conectada.");
    } catch (err) { console.error("❌ Error DB:", err.message); }
}

// 🔑 LLAMADA A IA CON LIMPIADOR DE JSON
async function llamarIA(prompt) {
    const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY_2;
    if (!key) return null;
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Caza el JSON real aunque Gemini ponga texto extra
        const inicio = text.indexOf('{');
        const fin = text.lastIndexOf('}') + 1;
        return text.substring(inicio, fin);
    } catch (e) { return null; }
}

// 💰 FUNCIÓN MAESTRA DE PUBLICACIÓN
async function publicarNoticia() {
    console.log("🐂 El Toro analizando tendencias...");
    const promptSEO = `Escribe un artículo SEO sobre tecnología o economía dominicana 2026. Responde SOLO en JSON: {"titulo":"...","resumen":"...","contenido":"(usa h2 y p)","categoria":"...","tags":"..."}`;
    
    const respuesta = await llamarIA(promptSEO);
    if (!respuesta) return false;

    try {
        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);
        
        await pool.query(
            "INSERT INTO articulos (titulo, slug, resumen, contenido_html, categoria, tags) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [data.titulo, slug, data.resumen, data.contenido, data.categoria, data.tags]
        );
        console.log("💰 Publicada: " + data.titulo);
        return true;
    } catch (e) { return false; }
}

// ⏱️ PROGRAMACIÓN CADA 8 HORAS
cron.schedule('0 */8 * * *', () => publicarNoticia());

// 🚀 RUTAS DE ADMINISTRACIÓN
app.get('/activar-toro', async (req, res) => {
    const exito = await publicarNoticia();
    if (exito) res.send('<h1>🐂 TORO ACTIVO</h1><a href="/redaccion.html">Volver</a>');
    else res.status(500).send('Error: Revisa tu GEMINI_API_KEY.');
});

app.get('/api/admin/listado', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC");
    res.json(r.rows);
});

app.delete('/api/admin/borrar/:id', async (req, res) => {
    await pool.query("DELETE FROM articulos WHERE id = $1", [req.params.id]);
    res.json({ success: true });
});

// 📈 SITEMAP PARA SEARCH CONSOLE
app.get('/sitemap.xml', async (req, res) => {
    const r = await pool.query("SELECT slug, fecha_publicacion FROM articulos");
    let xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    xml += `<url><loc>https://${req.get('host')}/</loc></url>`;
    r.rows.forEach(row => {
        xml += `<url><loc>https://${req.get('host')}/noticia.html?v=${row.slug}</loc><lastmod>${row.fecha_publicacion.toISOString().split('T')[0]}</lastmod></url>`;
    });
    xml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
});

// 🌐 API PÚBLICA
app.get('/api/noticias', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos ORDER BY fecha_publicacion DESC LIMIT 10");
    res.json(r.rows);
});

app.get('/api/noticia/:slug', async (req, res) => {
    const r = await pool.query("SELECT * FROM articulos WHERE slug = $1", [req.params.slug]);
    res.json(r.rows[0] || { error: "No encontrado" });
});

// 📂 SERVIR WEB
app.use(express.static(path.join(__dirname, 'client')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

// 🚀 INICIO
app.listen(PORT, '0.0.0.0', async () => {
    await autoConfigurarDB();
    console.log(`🚀 Puerto ${PORT}`);
});
